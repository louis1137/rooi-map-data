/**
 * tools/collect/config.mjs — 수집 스크립트 설정 (값만 있다)
 *
 * 비용 메모
 *   - 경기 정보(api.pubg.com /matches) 와 텔레메트리(telemetry-cdn) 는 API 키 없이 PUBG 서버에서 바로 받는다 → Cloudflare 요청 0
 *   - 경기 번호를 찾으려면 플레이어 조회가 필요한데 이것만 키가 있어야 해서 우리 프록시(워커)를 거친다.
 *     한 번에 10명씩, LOOKUP_GAP_MS 간격으로만 부른다 (PUBG 분당 호출 제한을 사이트 이용자와 나눠 쓰므로 천천히)
 */

import { fileURLToPath } from 'node:url';

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));

export const SHARD = 'kakao';
export const PROXY_BASE = 'https://game-log-proxy.hellolouis-office.workers.dev';
export const PUBG_BASE = 'https://api.pubg.com/shards';

/** 처음 경기 번호를 얻을 플레이어 (이 사람의 최근 경기 → 같이 뛴 사람들 → 그 사람들의 경기 … 로 퍼져 나간다) */
export const SEED_PLAYERS = ['New_Louis'];

/** 모으는 지도 (플레이 로그 maps.js 의 영문 짧은 이름) · 모드 */
export const MAP_SLUGS = new Set(['erangel', 'miramar', 'taego', 'rondo', 'vikendi', 'deston', 'sanhok', 'paramo', 'karakin']);
export const GAME_MODES = new Set(['squad', 'squad-fpp', 'duo', 'duo-fpp', 'solo', 'solo-fpp']);
export const MATCH_TYPES = new Set(['official', 'competitive']);

export const LOOKUP_GAP_MS = 15_000; // 플레이어 조회(프록시) 사이 간격
export const LOOKUP_NAMES = 10; // 한 번에 조회하는 인원 (PUBG 최대 10)
export const MAX_LOOKUPS = 60; // 한 번 실행에서 프록시를 부르는 최대 횟수
export const NAMES_PER_MATCH = 4; // 경기마다 다음 조회 후보로 남기는 참가자 수
export const CONCURRENCY = 4; // 동시에 받는 경기 수
/**
 * 지도마다 최근 이만큼의 경기만 남긴다 (새 경기가 들어오면 오래된 경기부터 뺀다 — collect.mjs 끝에서 store.trim).
 * 한 번 실행에서도 한 지도에 이보다 많이는 받지 않는다 (인기 지도만 받느라 시간을 쓰지 않게). 따로 적지 않은 지도는 DEFAULT
 */
const MAP_KEEP = { DEFAULT: 2000, karakin: 1000 };
export const keepOf = (slug) => MAP_KEEP[slug] ?? MAP_KEEP.DEFAULT;
export const LOW_QUEUE = 40; // 받을 경기가 이보다 적으면 플레이어 조회로 더 찾는다
export const DEFAULT_MINUTES = 25; // 실행 시간 (분) — --minutes 로 바꾼다
export const REQUEST_TIMEOUT_MS = 90_000;

/** 원본 기록 (경기마다 한 줄). 사이트에 올리지 않는다 */
export const STORE_DIR = process.env.MAP_LOG_STORE ?? here('./store/'); // GitHub Actions 는 자료 저장소의 store/ 를 쓴다
/** 사이트가 읽는 지도별 자료 파일 */
export const DATA_DIR = process.env.MAP_LOG_DATA ?? here('../../data/'); // GitHub Actions 는 자료 저장소의 data/ (GitHub Pages 로 공개)
