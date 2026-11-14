/**
 * tools/collect/pubg.mjs — PUBG 서버에서 받아 오기 (전송만 한다. 가공은 extract.mjs)
 *
 *   lookupPlayers(names)   프록시(키 필요) → [{ name, matchIds }]
 *   fetchMatch(id)         경기 정보 (키 불필요) → { id, mapName, gameMode, matchType, isCustomMatch, createdAt, telemetryUrl, names }
 *   fetchTelemetry(url)    텔레메트리 이벤트 배열 (키 불필요)
 */

import { PROXY_BASE, PUBG_BASE, SHARD, REQUEST_TIMEOUT_MS } from './config.mjs';

const HEADERS = { Accept: 'application/vnd.api+json' };

const getJson = async (url, { retries = 2 } = {}) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
};

export const lookupPlayers = async (names) => {
  const url = new URL(`${PROXY_BASE}/pubg/${SHARD}/players`);
  url.searchParams.set('filter[playerNames]', names.join(','));
  const body = await getJson(url, { retries: 0 }); // 제한에 걸렸을 때 바로 다시 부르지 않는다
  return (body?.data ?? []).map((player) => ({
    name: player.attributes?.name,
    matchIds: (player.relationships?.matches?.data ?? []).map((match) => match.id),
  }));
};

export const fetchMatch = async (id) => {
  const body = await getJson(`${PUBG_BASE}/${SHARD}/matches/${id}`);
  if (!body) return null;
  const { attributes } = body.data;
  const included = body.included ?? [];
  return {
    id,
    mapName: attributes.mapName,
    gameMode: attributes.gameMode,
    matchType: attributes.matchType,
    isCustomMatch: attributes.isCustomMatch,
    createdAt: attributes.createdAt,
    telemetryUrl: included.find((item) => item.type === 'asset')?.attributes?.URL ?? null,
    names: included.filter((item) => item.type === 'participant').map((item) => item.attributes?.stats?.name).filter(Boolean),
  };
};

export const fetchTelemetry = (url) => getJson(url);
