/**
 * maps.js — 맵 이미지 & 좌표계 정보
 *
 * 텔레메트리 좌표는 cm 단위, 원점은 맵 왼쪽 위. worldSize 는 맵 한 변 길이(cm).
 *
 * 이미지 소스 (모두 도시 이름 없는 No_Text 지도, 같은 좌표계):
 *  - 지도 타일 서버 (Cloudflare, 원본: server/map-tiles — PUBG api-assets High_Res 8192px 를 잘라 올림)
 *      <map>_low_res.jpg : 2048×2048 바탕
 *      <map>_01..16.jpg  : 2048×2048 타일 16장, 4×4 행 우선 → 실질 8192×8192
 *  - 번들 폴백: assets/maps/<code>.jpg (819×819) — 서버 실패 시
 */

const EIGHT_KM = 816000;

/** 지도 타일 서버 (server/map-tiles 를 배포한 곳). 파일은 루트에 평탄하게: <remote>_NN.jpg */
export const MAP_TILE_BASE = 'https://pubg-play-log-maps.hellolouis-office.workers.dev';

/**
 * 공식 2D 리플레이 CDN — 무기·차량 아이콘용 (replayAssets.js 가 여기서 파생).
 * 경로의 해시/버전은 PUBG 쪽에서 바뀔 수 있음. 바뀌면 여기만 수정.
 */
export const TILE_CDN_BASE = 'https://prod-live-images.playbattlegrounds.com/27131e3c9012b9dd/webreplay/map-images/2610';
export const TILE_GRID = 4; // 4×4

const MAP_INFO = Object.freeze({
  Baltic_Main: { worldSize: EIGHT_KM, image: 'Baltic_Main', remote: 'erangel' },
  Erangel_Main: { worldSize: EIGHT_KM, image: 'Baltic_Main', remote: 'erangel' },
  Desert_Main: { worldSize: EIGHT_KM, image: 'Desert_Main', remote: 'miramar' },
  DihorOtok_Main: { worldSize: EIGHT_KM, image: 'DihorOtok_Main', remote: 'vikendi' },
  Tiger_Main: { worldSize: EIGHT_KM, image: 'Tiger_Main', remote: 'taego' },
  Kiki_Main: { worldSize: EIGHT_KM, image: 'Kiki_Main', remote: 'deston' },
  Neon_Main: { worldSize: EIGHT_KM, image: 'Neon_Main', remote: 'rondo' },
  Savage_Main: { worldSize: 408000, image: 'Savage_Main', remote: 'sanhok' },
  Chimera_Main: { worldSize: 306000, image: 'Chimera_Main', remote: 'paramo' },
  Summerland_Main: { worldSize: 204000, image: 'Summerland_Main', remote: 'karakin' },
  Range_Main: { worldSize: 204000, image: 'Range_Main', remote: 'camp_jackal' },
  Heaven_Main: { worldSize: 102000, image: 'Heaven_Main', remote: 'haven' },
});

/** 아는 지도 코드 전부 (getMapInfo 에 넣을 수 있는 값) */
export const MAP_CODES = Object.freeze(Object.keys(MAP_INFO));

const tileUrl = (remote, index) => `${MAP_TILE_BASE}/${remote}_${String(index).padStart(2, '0')}.jpg`;

export const getMapInfo = (mapCode) => {
  const info = MAP_INFO[mapCode];
  if (!info) return null;
  return {
    code: mapCode,
    /** 영문 짧은 이름 (erangel, miramar …) — 지도 타일 파일 이름 · 주소(?map=) · 지도별 자료 파일에 쓴다 */
    slug: info.remote ?? null,
    worldSize: info.worldSize,
    /** 번들 폴백 이미지 */
    imageUrl: new URL(`../../../assets/maps/${info.image}.jpg`, import.meta.url).href,
    /** 저해상도 바탕 (없으면 null) */
    lowResUrl: info.remote ? `${MAP_TILE_BASE}/${info.remote}_low_res.jpg` : null,
    /** 고해상도 타일 URL 목록 (행 우선 16개). 없으면 [] */
    tileUrls: info.remote ? Array.from({ length: TILE_GRID * TILE_GRID }, (_, i) => tileUrl(info.remote, i + 1)) : [],
  };
};
