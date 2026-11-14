/**
 * tools/collect/store.mjs — 원본 기록 보관 (store/ 폴더, 사이트에 올리지 않는다)
 *
 *   store/matches/<지도>.ndjson   경기마다 한 줄 (extract.mjs 의 기록 + id · 시각 · 모드)
 *   store/skipped.txt             받아 봤지만 쓰지 않는 경기 번호 (다른 모드 · 지도 등) — 다시 받지 않게
 *   store/names.json              다음에 조회할 플레이어 후보 { pool, first, asked }
 *
 *   const store = await openStore();
 *   store.has(id) / store.count() / store.countOf(slug)
 *   await store.addMatch(slug, record) / await store.replaceMap(slug, records) / await store.skip(id)
 *   await store.trim(keepOf)      지도마다 최근 keepOf(slug) 경기만 남긴다 (시각 at 기준) → { 지도: 뺀 수 }
 *   store.nameCount() / await store.newestIds(n)   남은 조회 후보 수 · 보관 경기 중 가장 최근 경기 번호 n 개 (후보가 없을 때 시작점)
 *   store.takeNames(n) / store.offerNames(names, first) / await store.saveNames()      first = 먼저 조회할 후보 (목표를 못 채운 지도에서 뛴 사람)
 *   readMatches(slug) → 기록 배열 (publish.mjs 가 쓴다)
 */

import { mkdir, readFile, appendFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { STORE_DIR, SEED_PLAYERS } from './config.mjs';

const MATCH_DIR = join(STORE_DIR, 'matches');
const SKIPPED_FILE = join(STORE_DIR, 'skipped.txt');
const NAMES_FILE = join(STORE_DIR, 'names.json');
const MAX_NAMES = 5000;

/** 기록 모양의 판 (extract.mjs 가 바뀌면 올린다). 2 = fights 한 건이 숫자 5개 */
export const RECORD_VERSION = 2;

const readText = (file) => readFile(file, 'utf8').catch(() => '');
const lines = (text) => text.split('\n').filter(Boolean);

export const readMatches = async (slug) => lines(await readText(join(MATCH_DIR, `${slug}.ndjson`))).map((line) => JSON.parse(line));

export const storedSlugs = async () => (await readdir(MATCH_DIR).catch(() => [])).filter((name) => name.endsWith('.ndjson')).map((name) => name.slice(0, -7));

export const openStore = async () => {
  await mkdir(MATCH_DIR, { recursive: true });
  const seen = new Set(lines(await readText(SKIPPED_FILE)));
  const counts = new Map();
  for (const slug of await storedSlugs()) {
    const matches = await readMatches(slug);
    counts.set(slug, matches.length);
    for (const match of matches) seen.add(match.id);
  }
  const saved = JSON.parse((await readText(NAMES_FILE)) || '{}');
  const asked = new Set(saved.asked ?? []); // 이미 조회한 이름
  let pool = (saved.pool ?? SEED_PLAYERS).filter((name) => !asked.has(name));
  if (pool.length === 0 && asked.size === 0) pool = [...SEED_PLAYERS];
  const first = (saved.first ?? []).filter((name) => !asked.has(name)); // 먼저 조회할 후보
  const takeFrom = (list) => list.splice(Math.floor(Math.random() * list.length), 1)[0];

  return {
    has: (id) => seen.has(id),
    count: () => [...counts.values()].reduce((sum, value) => sum + value, 0),
    countOf: (slug) => counts.get(slug) ?? 0,
    async addMatch(slug, record) {
      seen.add(record.id);
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
      await appendFile(join(MATCH_DIR, `${slug}.ndjson`), `${JSON.stringify({ fv: RECORD_VERSION, ...record })}\n`);
    },
    /** 그 지도의 기록을 통째로 바꾼다 (가져오기에서 새 판 묶음이 올 때) */
    async replaceMap(slug, records) {
      for (const record of records) seen.add(record.id);
      counts.set(slug, records.length);
      await writeFile(join(MATCH_DIR, `${slug}.ndjson`), records.map((record) => `${JSON.stringify(record)}\n`).join(''));
    },
    async trim(keepOf) {
      const removed = {};
      for (const slug of await storedSlugs()) {
        const matches = await readMatches(slug);
        const keep = keepOf(slug);
        if (matches.length <= keep) continue;
        const newest = matches.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, keep);
        removed[slug] = matches.length - keep;
        await this.replaceMap(slug, newest.reverse()); // 오래된 것부터 (추가 순서와 같게)
      }
      return removed;
    },
    async skip(id) {
      seen.add(id);
      await appendFile(SKIPPED_FILE, `${id}\n`);
    },
    nameCount: () => first.length + pool.length,
    async newestIds(n) {
      const all = [];
      for (const slug of await storedSlugs()) for (const { id, at } of await readMatches(slug)) all.push({ id, at: String(at) });
      return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, n).map(({ id }) => id);
    },
    /** 아직 조회하지 않은 이름을 무작위로 n 개 꺼낸다 (먼저 조회할 후보부터) */
    takeNames(n) {
      const taken = [];
      while (taken.length < n && first.length + pool.length > 0) {
        const name = takeFrom(first.length > 0 ? first : pool);
        if (asked.has(name)) continue;
        asked.add(name);
        taken.push(name);
      }
      return taken;
    },
    offerNames(names, isFirst = false) {
      const list = isFirst ? first : pool;
      for (const name of names) if (!asked.has(name) && !list.includes(name) && list.length < MAX_NAMES) list.push(name);
    },
    saveNames: () => writeFile(NAMES_FILE, JSON.stringify({ pool, first, asked: [...asked] })),
  };
};
