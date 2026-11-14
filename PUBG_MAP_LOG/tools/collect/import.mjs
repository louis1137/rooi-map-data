/**
 * tools/collect/import.mjs — 다른 곳(브라우저)에서 모은 기록 묶음을 store/ 에 합치고 data/ 를 다시 만든다
 *
 *   node import.mjs [묶음.json]      파일을 안 주면 이 폴더(tools/collect)와 내려받기 폴더에서 가장 최근의 map_log_store*.json 을 찾는다
 *                                    (가져오기.bat 위에 묶음 파일을 끌어다 놓아도 된다)
 *
 * 묶음 모양: { v, matches: { <지도>: [기록, …] }, skipped: [경기 번호, …] }   (기록 = extract.mjs 의 기록 + id · at · mode · fv)
 * 묶음에 든 지도는 묶음의 기록으로 통째로 바꾼다 (묶음이 그 지도의 전부를 담고 있으므로). 묶음에 없는 지도는 그대로 둔다.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.mjs';
import { publish } from './publish.mjs';

const BUNDLE_PATTERN = /^map_log_store.*\.json$/;

const SEARCH_FOLDERS = [fileURLToPath(new URL('.', import.meta.url)), join(homedir(), 'Downloads')];

const newestBundle = async () => {
  const found = [];
  for (const folder of SEARCH_FOLDERS) {
    const names = (await readdir(folder).catch(() => [])).filter((name) => BUNDLE_PATTERN.test(name));
    for (const name of names) found.push({ file: join(folder, name), time: (await stat(join(folder, name))).mtimeMs });
  }
  return found.sort((a, b) => b.time - a.time)[0]?.file ?? null;
};

const file = process.argv[2] ?? (await newestBundle());
if (!file) {
  console.log('가져올 묶음 파일(map_log_store*.json)을 찾지 못했어요.\n이 폴더(tools\\collect)에 묶음 파일을 넣거나, 묶음 파일을 가져오기.bat 위에 끌어다 놓아 주세요.');
  process.exit(1);
}

const bundle = JSON.parse(await readFile(file, 'utf8'));
const store = await openStore();
for (const [slug, records] of Object.entries(bundle.matches ?? {})) await store.replaceMap(slug, records);
for (const id of bundle.skipped ?? []) if (!store.has(id)) await store.skip(id);
console.log(`${file}\n→ 가져왔어요 (전체 ${store.count()}경기). 자료 파일을 다시 만듭니다…`);
console.log(await publish());
