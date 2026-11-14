/**
 * tools/collect/collect.mjs — 경기 기록 수집 (PC 에서 돌린다. 서버 · DB 없음)
 *
 *   node collect.mjs [--minutes 25]
 *
 * 흐름: 플레이어 조회(프록시, 드물게) → 경기 번호 → 경기 정보 · 텔레메트리(PUBG 서버에서 바로) → extract → store/ 에 한 줄
 *       → 같이 뛴 사람 몇 명을 다음 조회 후보로 → … 시간이 다 되면 지도마다 최근 경기만 남기고(trim) publish 로 data/ 를 다시 만든다.
 * 지도가 다 차도 멈추지 않는다 — 새 경기가 들어오고 오래된 경기가 빠져서 자료가 계속 최근 것으로 바뀐다.
 * 매일 GitHub Actions 가 돌린다 (자료 저장소 rooi-map-data 의 .github/workflows/collect.yml). PC 에서 수집.bat 으로 돌려도 된다.
 * 중간에 꺼도 된다 (받은 만큼 store/ 에 남고, 다시 돌리면 이어서 받는다).
 */

import { getMapInfo } from '../../../PUBG_PLAY_LOG/src/games/pubg/maps.js';
import * as config from './config.mjs';
import { lookupPlayers, fetchMatch, fetchTelemetry } from './pubg.mjs';
import { extractMatch } from './extract.mjs';
import { openStore } from './store.mjs';
import { publish } from './publish.mjs';

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};

const deadline = Date.now() + argOf('minutes', config.DEFAULT_MINUTES) * 60_000;
const store = await openStore();
const queue = []; // 받을 경기 번호
const passed = new Set(); // 이번 실행에서 그 지도를 이미 keep 만큼 받아서 넘긴 경기 (기록하지 않는다 — 다음 실행에 받는다)
const addedNow = new Map(); // 이번 실행에서 지도마다 받은 수
const stats = { saved: 0, skipped: 0, failed: 0, full: 0, lookups: 0 };
let lastLookup = 0;

const sample = (list, n) => [...list].sort(() => Math.random() - 0.5).slice(0, n);
const log = (...parts) => console.log(new Date().toTimeString().slice(0, 8), ...parts);

/** 경기 번호가 모자라면 플레이어 조회로 채운다 (간격 · 횟수 제한) */
const refill = async () => {
  if (queue.length >= config.LOW_QUEUE || stats.lookups >= config.MAX_LOOKUPS) return;
  if (Date.now() - lastLookup < config.LOOKUP_GAP_MS) return;
  const names = store.takeNames(config.LOOKUP_NAMES);
  if (names.length === 0) return;
  lastLookup = Date.now();
  stats.lookups += 1;
  try {
    const players = await lookupPlayers(names);
    const before = queue.length;
    for (const player of players) for (const id of player.matchIds) if (!store.has(id) && !passed.has(id) && !queue.includes(id)) queue.push(id);
    log(`조회 ${stats.lookups}회째: ${players.length}명 → 새 경기 ${queue.length - before}개 (대기 ${queue.length})`);
  } catch (error) {
    log(`조회 실패 (${error.message}) — 잠시 뒤 다시`);
    lastLookup = Date.now() + 45_000; // 제한에 걸렸을 수 있으니 한참 쉰다
  }
  await store.saveNames();
};

const handle = async (id) => {
  const match = await fetchMatch(id);
  const map = match && getMapInfo(match.mapName);
  const wanted = match && !match.isCustomMatch && match.telemetryUrl && map?.slug && config.MAP_SLUGS.has(map.slug)
    && config.GAME_MODES.has(match.gameMode) && config.MATCH_TYPES.has(match.matchType);
  // 아직 목표를 못 채운 지도에서 뛴 사람을 먼저 조회한다 (그 지도 경기를 더 찾으려고)
  if (match) store.offerNames(sample(match.names, config.NAMES_PER_MATCH), Boolean(map?.slug) && store.countOf(map.slug) < config.keepOf(map.slug));
  if (!wanted) {
    stats.skipped += 1;
    return store.skip(id);
  }
  if ((addedNow.get(map.slug) ?? 0) >= config.keepOf(map.slug)) {
    passed.add(id);
    stats.full += 1;
    return;
  }
  const events = await fetchTelemetry(match.telemetryUrl);
  const record = events && extractMatch(events, map.worldSize);
  if (!record) {
    stats.skipped += 1;
    return store.skip(id);
  }
  await store.addMatch(map.slug, { id, at: match.createdAt, mode: match.gameMode, ...record });
  addedNow.set(map.slug, (addedNow.get(map.slug) ?? 0) + 1);
  stats.saved += 1;
  if (stats.saved % 10 === 0) log(`저장 ${stats.saved} (전체 ${store.count()}) · 건너뜀 ${stats.skipped} · 실패 ${stats.failed} · 대기 ${queue.length}`);
};

const worker = async () => {
  while (Date.now() < deadline) {
    await refill();
    const [id] = queue.splice(Math.floor(Math.random() * queue.length), 1); // 무작위로 — 한 사람의 경기(같은 지도)만 몰아 받지 않게
    if (!id) {
      if (stats.lookups >= config.MAX_LOOKUPS) return; // 더 찾을 방법이 없다
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (store.has(id)) continue;
    try {
      await handle(id);
    } catch (error) {
      stats.failed += 1; // 다음 실행 때 다시 받아 본다 (기록하지 않음)
      log(`경기 ${id.slice(0, 8)} 실패: ${error.message}`);
    }
  }
};

/**
 * 조회 후보가 거의 없으면 (처음 실행 · 후보 목록을 잃었을 때) 보관 중인 가장 최근 경기들의 참가자를 후보로 삼는다.
 * 경기 정보는 키 없이 PUBG 서버에서 받으므로 프록시를 쓰지 않는다. 시작 닉네임(SEED_PLAYERS)이 요즘 안 뛰어도 이어서 모을 수 있다.
 */
const BOOTSTRAP_BELOW = 30;
const BOOTSTRAP_MATCHES = 8;
if (store.nameCount() < BOOTSTRAP_BELOW) {
  for (const id of await store.newestIds(BOOTSTRAP_MATCHES)) {
    const match = await fetchMatch(id).catch(() => null);
    if (match) store.offerNames(sample(match.names, config.NAMES_PER_MATCH * 3));
  }
  log(`조회 후보가 적어 최근 경기 참가자로 채웠어요 → 후보 ${store.nameCount()}명`);
}

log(`수집 시작 — 보관 중 ${store.count()}경기, ${Math.round((deadline - Date.now()) / 60_000)}분 동안`);
await Promise.all(Array.from({ length: config.CONCURRENCY }, worker));
await store.saveNames();
log(`수집 끝 — 이번에 저장 ${stats.saved}, 건너뜀 ${stats.skipped}, 이번 실행 몫이 차서 넘김 ${stats.full}, 실패 ${stats.failed}, 플레이어 조회 ${stats.lookups}회`);
log('오래된 경기 빼는 중…', JSON.stringify(await store.trim(config.keepOf)));
log('자료 파일 만드는 중…');
console.log(await publish());
log('끝');
