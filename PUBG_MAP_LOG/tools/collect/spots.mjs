/**
 * tools/collect/spots.mjs — 이동수단 · 비밀의 방 자리(spots.json) + 수집한 탑승 기록 → 지도별 자리 자료 (순수 계산 + 파일 읽기 하나)
 *
 * spots.json (이 폴더에 없으면 내려받기 폴더에서 가장 최근의 spots*.json, 좌표 m): { maps: { <지도>: { cars, carsFixed, boats, boatsFixed, gliders, glidersFixed, rooms } } }  각 값은 [x, y, x, y, …]
 *   *Fixed = 항상 나오는 고정 자리. 자리 좌표는 그대로 믿고 쓴다 (검증하지 않는다).
 *
 *   const spots = await readSpots();                    // 없으면 null
 *   buildSpotData(spots.maps[slug], matches)            // → { v, matches, car: [x, y, fixed, rides, …], boat: […], glider: […], rooms: [x, y, …] }
 *     rides = 그 자리 NEAR_M 이내에서, 서 있던 그 종류의 탈것에 탄 '경기 수' → 탑승률 = rides ÷ matches
 */

import { readFile, readdir, stat, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SPOTS_PATTERN = /^spots.*\.json$/; // 브라우저가 같은 이름을 피해 'spots (1).json' 으로 저장하기도 한다

/** 이 폴더의 spots.json 이 먼저, 없으면 내려받기 폴더에서 가장 최근 것 */
const findSpotsFile = async () => {
  const here = join(HERE, 'spots.json');
  if (await stat(here).catch(() => null)) return here;
  const folder = join(homedir(), 'Downloads');
  const names = (await readdir(folder).catch(() => [])).filter((name) => SPOTS_PATTERN.test(name));
  const dated = await Promise.all(names.map(async (name) => ({ file: join(folder, name), time: (await stat(join(folder, name))).mtimeMs })));
  return dated.sort((a, b) => b.time - a.time)[0]?.file ?? null;
};
const NEAR_M = 50; // 자리에서 이만큼 이내에서 탔으면 그 자리의 탑승
const VERSION = 1;
/** 종류: 자료 이름 · 탑승 기록의 type (extract.mjs rides) · spots.json 의 칸 */
const KINDS = [
  { key: 'car', rideType: 0, random: 'cars', fixed: 'carsFixed' },
  { key: 'boat', rideType: 1, random: 'boats', fixed: 'boatsFixed' },
  { key: 'glider', rideType: 2, random: 'gliders', fixed: 'glidersFixed' },
];

export const readSpots = async () => {
  const file = await findSpotsFile();
  if (!file) return null;
  const here = join(HERE, 'spots.json');
  if (file !== here) await copyFile(file, here); // 다음부터는 이 폴더 것을 쓴다
  return JSON.parse(await readFile(here, 'utf8'));
};

const cellOf = (x, y) => `${Math.floor(x / NEAR_M)},${Math.floor(y / NEAR_M)}`;

/** 한 종류: 자리마다 '근처에서 탄 경기 수' 를 센다 */
const countRides = (spots, matches, rideType) => {
  // 자리를 격자에 넣어 두고, 탑승 기록마다 주변 9칸만 본다
  const grid = new Map();
  spots.forEach((spot, index) => {
    const cell = cellOf(spot.x, spot.y);
    if (!grid.has(cell)) grid.set(cell, []);
    grid.get(cell).push(index);
  });
  const counts = new Array(spots.length).fill(0);
  for (const { rides } of matches) {
    const hit = new Set(); // 한 경기에서 같은 자리는 한 번만
    for (let i = 0; i < rides.length; i += 3) {
      if (rides[i] !== rideType) continue;
      const x = rides[i + 1];
      const y = rides[i + 2];
      const cx = Math.floor(x / NEAR_M);
      const cy = Math.floor(y / NEAR_M);
      let best = -1;
      let bestDistance = NEAR_M;
      for (let gx = cx - 1; gx <= cx + 1; gx += 1) {
        for (let gy = cy - 1; gy <= cy + 1; gy += 1) {
          for (const index of grid.get(`${gx},${gy}`) ?? []) {
            const distance = Math.hypot(spots[index].x - x, spots[index].y - y);
            if (distance <= bestDistance) {
              best = index;
              bestDistance = distance;
            }
          }
        }
      }
      if (best >= 0) hit.add(best); // 가장 가까운 자리 하나에만 센다
    }
    for (const index of hit) counts[index] += 1;
  }
  return counts;
};

const pairs = (flat = [], fixed) => {
  const out = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push({ x: flat[i], y: flat[i + 1], fixed });
  return out;
};

export const buildSpotData = (mapSpots, matches) => {
  const data = { v: VERSION, matches: matches.length, rooms: mapSpots.rooms ?? [] };
  for (const kind of KINDS) {
    const spots = [...pairs(mapSpots[kind.fixed], 1), ...pairs(mapSpots[kind.random], 0)];
    const counts = countRides(spots, matches, kind.rideType);
    data[kind.key] = spots.flatMap((spot, index) => [spot.x, spot.y, spot.fixed, counts[index]]);
  }
  return data;
};
