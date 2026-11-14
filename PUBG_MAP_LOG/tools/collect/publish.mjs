/**
 * tools/collect/publish.mjs — 원본 기록(store/) → 사이트가 읽는 지도별 자료 파일(data/)
 *
 *   data/index.json            { updatedAt, maps: { <지도>: { matches, drop, fight, from, to, zoneRadius: [1단계, 2단계, …] } } }
 *                              from · to = 보유 경기의 가장 오래된 · 최근 경기 시각
 *                              zoneRadius = 그 지도 경기들의 단계별 흰 원 반지름 가운데값(m)
 *   data/<지도>.drop.json      { v, matches: [[sx, sy, ex, ey, [jumps…], [lands…]], …] }      동선을 구한 경기만
 *   data/<지도>.fight.json     { v, matches: [[[zones…], [fights…]], …] }                     흰 원이 2개 이상인 경기만
 *   data/<지도>.spots.json     { v, matches, car: [x, y, fixed, rides, …], boat, glider, rooms: [x, y, …] }   spots.json 이 있을 때만 (spots.mjs)
 *   (각 배열의 뜻 · 단위는 extract.mjs 머리말)
 *
 *   node publish.mjs           단독 실행 가능. collect.mjs 가 끝날 때도 부른다
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_DIR } from './config.mjs';
import { readMatches, storedSlugs, RECORD_VERSION } from './store.mjs';
import { readSpots, buildSpotData } from './spots.mjs';

const VERSION = 2; // 2: fights 에 moving(자기장 출발 전/후) 추가

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/** 단계별 반지름 가운데값 (경기가 3개 이상 있는 단계까지) */
const zoneRadiusOf = (matches) => {
  const byPhase = [];
  for (const { zones } of matches) for (let i = 2; i < zones.length; i += 3) (byPhase[(i - 2) / 3] ??= []).push(zones[i]);
  return byPhase.filter((radii) => radii.length >= 3).map(median).filter((radius) => radius > 0); // 마지막 단계(0m)는 뺀다
};

export const publish = async () => {
  await mkdir(DATA_DIR, { recursive: true });
  const maps = {};
  for (const slug of await storedSlugs()) {
    const matches = await readMatches(slug);
    const drop = matches.filter((match) => match.plane && match.lands.length >= 2).map((match) => [...match.plane, match.jumps, match.lands]);
    // 옛 판 기록(fights 한 건이 숫자 4개)은 전투 자료에서 뺀다
    const fight = matches.filter((match) => match.fv === RECORD_VERSION && match.zones.length >= 6 && match.fights.length > 0).map((match) => [match.zones, match.fights]);
    await writeFile(join(DATA_DIR, `${slug}.drop.json`), JSON.stringify({ v: VERSION, matches: drop }));
    await writeFile(join(DATA_DIR, `${slug}.fight.json`), JSON.stringify({ v: VERSION, matches: fight }));
    const times = matches.map((match) => match.at).filter(Boolean).sort();
    maps[slug] = { matches: matches.length, drop: drop.length, fight: fight.length, from: times[0] ?? null, to: times.at(-1) ?? null, zoneRadius: zoneRadiusOf(matches) };
  }
  // 이동수단 · 비밀의 방: 자리 목록이 있는 지도는 모은 경기가 없어도 만든다 (탑승률만 비어 있다)
  const spots = await readSpots();
  if (!spots) console.log('spots.json 을 찾지 못했어요 — 이동수단 · 비밀의 방 자료는 건너뜁니다.');
  for (const [slug, mapSpots] of Object.entries(spots?.maps ?? {})) {
    const data = buildSpotData(mapSpots, maps[slug] ? await readMatches(slug) : []);
    await writeFile(join(DATA_DIR, `${slug}.spots.json`), JSON.stringify(data));
    (maps[slug] ??= { matches: 0, drop: 0, fight: 0, zoneRadius: [] }).spots = (data.car.length + data.boat.length + data.glider.length) / 4 + data.rooms.length / 2;
  }
  await writeFile(join(DATA_DIR, 'index.json'), JSON.stringify({ updatedAt: new Date().toISOString(), maps }, null, 1));
  return maps;
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  console.log(await publish());
}
