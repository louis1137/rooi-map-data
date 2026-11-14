/**
 * tools/collect/extract.mjs — 텔레메트리 한 경기 → 분석에 쓰는 작은 기록 (순수 함수, 파일 · 네트워크를 모른다)
 *
 *   extractMatch(events, worldSize) → 아래 모양 (좌표 · 길이는 m 정수, 원점은 지도 왼쪽 위) 또는 null(쓸 수 없는 경기)
 *     plane   [sx, sy, ex, ey]        비행기 동선: 지도 변 위의 시작점 → 끝점 (못 구하면 null)
 *     jumps   [x, y, …]               비행기에서 뛰어내린 자리
 *     lands   [x, y, …]               낙하산으로 내린 자리
 *     zones   [x, y, r, …]            안전 구역(흰 원) 1단계, 2단계, … 순서
 *     fights  [x, y, k, kind, moving, …]   교전: 쓰러지거나 죽은 사람 자리. k = 그때까지 발표된 흰 원 수
 *                                     (k = N+1 이면 '현재 자기장 N단계 · 다음 자기장 N+1단계' 인 동안), kind 0 = 기절, 1 = 사망,
 *                                     moving 0 = 자기장 출발 전(파란 원이 멈춰 있음), 1 = 출발 후(줄어드는 중)
 *     rides   [type, x, y, …]         서 있던 탈것에 탄 자리. type 0 = 자동차, 1 = 배, 2 = 글라이더
 */

const DROP_WINDOW_S = 240; // 비행기에서 내리는 시간 (경기 시작 뒤)
const LAND_WINDOW_S = 420; // 첫 낙하산 착지로 보는 시간
const MIN_JUMPS = 8; // 동선을 구하는 데 필요한 최소 인원
const MAX_LINE_ERROR_CM = 15000; // 뛰어내린 자리들이 직선에서 벗어난 정도(RMS)가 이보다 크면 동선을 버린다
const RIDE_TYPES = { WheeledVehicle: 0, FloatingVehicle: 1, FlyingVehicle: 2 };

const toMeters = (cm) => Math.round(cm / 100);
const isUser = (character) => !character?.type || character.type === 'user';

/** 뛰어내린 자리(시간순)를 지나는 직선을 지도 변까지 늘린다 */
const planeOf = (points, worldSize) => {
  if (points.length < MIN_JUMPS) return null;
  const n = points.length;
  const cx = points.reduce((sum, p) => sum + p.x, 0) / n;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - cx) ** 2;
    syy += (p.y - cy) ** 2;
    sxy += (p.x - cx) * (p.y - cy);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy); // 가장 길게 퍼진 방향
  let dx = Math.cos(angle);
  let dy = Math.sin(angle);
  // 직선에서 벗어난 정도 · 진행 방향(늦게 뛴 사람이 앞쪽)
  let error = 0;
  let forward = 0;
  const meanT = points.reduce((sum, p) => sum + p.t, 0) / n;
  for (const p of points) {
    const along = (p.x - cx) * dx + (p.y - cy) * dy;
    error += ((p.x - cx) * -dy + (p.y - cy) * dx) ** 2;
    forward += along * (p.t - meanT);
  }
  if (Math.sqrt(error / n) > MAX_LINE_ERROR_CM || forward === 0) return null;
  if (forward < 0) {
    dx = -dx;
    dy = -dy;
  }
  // (cx, cy) + s·(dx, dy) 가 지도 안에 있는 s 구간
  let enter = -Infinity;
  let exit = Infinity;
  for (const [origin, delta] of [[cx, dx], [cy, dy]]) {
    if (Math.abs(delta) < 1e-9) continue;
    const s1 = (0 - origin) / delta;
    const s2 = (worldSize - origin) / delta;
    enter = Math.max(enter, Math.min(s1, s2));
    exit = Math.min(exit, Math.max(s1, s2));
  }
  if (!(enter < exit)) return null;
  const clamp = (value) => Math.min(worldSize, Math.max(0, value));
  return [cx + dx * enter, cy + dy * enter, cx + dx * exit, cy + dy * exit].map((value) => toMeters(clamp(value)));
};

export const extractMatch = (events, worldSize) => {
  const startEvent = events.find((event) => event._T === 'LogMatchStart');
  if (!startEvent) return null;
  const startMs = Date.parse(startEvent._D);
  const inMap = (location) => location && location.x >= 0 && location.y >= 0 && location.x <= worldSize && location.y <= worldSize;

  const jumpPoints = [];
  const lands = [];
  const landed = new Set();
  const zones = [];
  const fights = [];
  const rides = [];
  let lastRadius = 0;
  let announced = 0; // 지금까지 발표된 흰 원 수
  let lastSafe = 0; // 바로 앞 기록의 파란 원 반지름
  let moving = 0; // 파란 원이 줄어드는 중인가

  const fight = (victim, kind) => {
    if (!inMap(victim?.location)) return;
    fights.push(toMeters(victim.location.x), toMeters(victim.location.y), announced, kind, moving);
  };

  for (const event of events) {
    switch (event._T) {
      case 'LogGameStatePeriodic': {
        const state = event.gameState;
        const radius = state?.poisonGasWarningRadius ?? 0;
        if (radius > 0 && Math.abs(radius - lastRadius) > 1) {
          lastRadius = radius;
          zones.push(toMeters(state.poisonGasWarningPosition.x), toMeters(state.poisonGasWarningPosition.y), toMeters(radius));
          announced = zones.length / 3;
        }
        const safe = state?.safetyZoneRadius ?? 0;
        moving = lastSafe > 0 && safe < lastSafe - 1 ? 1 : 0;
        lastSafe = safe;
        break;
      }
      case 'LogVehicleLeave': {
        if (event.vehicle?.vehicleType !== 'TransportAircraft' || !isUser(event.character)) break;
        const t = (Date.parse(event._D) - startMs) / 1000;
        const { location } = event.character;
        if (t >= 0 && t <= DROP_WINDOW_S && inMap(location)) jumpPoints.push({ x: location.x, y: location.y, t });
        break;
      }
      case 'LogParachuteLanding': {
        const { character } = event;
        if (!isUser(character) || landed.has(character.name) || !inMap(character.location)) break;
        const t = (Date.parse(event._D) - startMs) / 1000;
        if (t < 0 || t > LAND_WINDOW_S) break;
        landed.add(character.name);
        lands.push(toMeters(character.location.x), toMeters(character.location.y));
        break;
      }
      case 'LogPlayerMakeGroggy':
        if (event.attacker?.name) fight(event.victim, 0);
        break;
      case 'LogPlayerKillV2':
        if (!event.isSuicide && (event.killer?.name || event.finisher?.name)) fight(event.victim, 1);
        break;
      case 'LogVehicleRide': {
        const type = RIDE_TYPES[event.vehicle?.vehicleType];
        const location = event.vehicle?.location ?? event.character?.location;
        // 서 있던(속도 0 · 시동 꺼짐) 탈것에 탄 것만 — 달리던 차에 옮겨 탄 것은 놓여 있던 자리가 아니다
        if (type === undefined || event.vehicle.velocity !== 0 || event.vehicle.isEngineOn || !inMap(location)) break;
        rides.push(type, toMeters(location.x), toMeters(location.y));
        break;
      }
      default:
    }
  }

  jumpPoints.sort((a, b) => a.t - b.t);
  return {
    plane: planeOf(jumpPoints, worldSize),
    jumps: jumpPoints.flatMap((point) => [toMeters(point.x), toMeters(point.y)]),
    lands,
    zones,
    fights,
    rides,
  };
};
