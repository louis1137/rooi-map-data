# rooi-map-data

[rooi.gg 맵 로그](https://rooi.gg/map_log/)의 분석 자료(낙하 · 전투 · 이동수단)를 매일 모으는 저장소입니다.

- **main** — 수집 코드와 매일 실행 설정(`.github/workflows/collect.yml`).
  코드의 원본은 PC의 `PUBG_MAP_LOG/tools/collect`이고, 여기 있는 것은 복사본입니다. 폴더 구조를 PC와 같게 두어서 가져다 쓰는 경로가 그대로 맞습니다.
- **data** — 매일 GitHub Actions가 새로 만드는 자료. GitHub Pages로 공개됩니다.
  - `data/index.json` · `data/<지도>.drop.json` · `.fight.json` · `.spots.json` — 맵 로그가 읽는 파일
  - `store/matches/<지도>.ndjson` — 원본 기록 (지도마다 최근 2000경기, 카라킨 1000). 경기 번호 · 좌표만 있고 닉네임은 없습니다.
  - 이력 없이 한 커밋으로 덮어씁니다.

조회할 플레이어 닉네임 목록은 공개 브랜치에 올리지 않고 Actions 캐시에만 둡니다.

## 손으로 돌리기

Actions 탭 → **맵 로그 자료 수집** → **Run workflow** (수집 시간을 분으로 정할 수 있습니다).
