# Safe Bike Seoul

서울 자전거 이용자를 위한 지도 기반 정보 앱입니다. 따릉이 대여소, 자전거 경로, 자전거 사고다발지역(과거 통계), 날씨를 한 화면에서 비교해 볼 수 있습니다.

> 이 앱은 공공 API의 정보를 보여주는 **참고용**입니다. 경로나 지역의 실제 안전성을 판단하거나 보장하지 않습니다.

## 기능

- 출발지·목적지 검색 (카카오 로컬 API)
- 출발지 주변 따릉이 대여소를 거리순으로 표시, 이용 가능한 자전거 수 (서울 열린데이터광장 `bikeList`)
- 선택한 대여소에서 목적지까지 자전거도로 우선 / 최단 경로 비교 (카카오맵 자전거 경로 REST API)
- 경로 주변 사고다발지역 수 (도로교통공단 자전거 교통사고 다발지역, 과거 통계)
- 출발지 기온·강수확률, 발표시각/예보시각 구분 (기상청 단기예보)
- 데이터별 출처와 조회·발표 시각 표시

API 호출이 실패하면 임의 데이터나 경로를 만들지 않고 실패 이유를 화면에 표시합니다.

## 기술 스택

Next.js 16 (App Router, Route Handlers) · React 19 · TypeScript · Tailwind CSS 4 · 카카오맵 JavaScript SDK

## 로컬 실행

Node.js 20.9 이상이 필요합니다.

```bash
npm install
cp .env.local.example .env.local   # Windows: copy .env.local.example .env.local
# .env.local 에 키를 채운 뒤
npm run dev
```

http://localhost:3000 에서 확인합니다. (3000번 포트가 사용 중이면 터미널에 표시된 포트를 사용하세요.)

## 환경변수

| 이름 | 위치 | 설명 |
|---|---|---|
| `SEOUL_API_KEY` | 서버 전용 | 서울 열린데이터광장 인증키 |
| `DATA_GO_KR_API_KEY` | 서버 전용 | 공공데이터포털 일반 인증키 (Decoding) |
| `KAKAO_REST_API_KEY` | 서버 전용 | 카카오 REST API 키 |
| `NEXT_PUBLIC_KAKAO_JS_KEY` | 브라우저 공개 | 카카오 JavaScript 키 (도메인 등록으로 보호) |

- 서버 전용 키는 `src/app/api/*` Route Handler 에서만 사용하며, `NEXT_PUBLIC_` 접두사가 없어 브라우저로 전달되지 않습니다. 서버 키를 읽는 모듈은 `server-only` 로 보호됩니다.
- `.env*` 파일은 `.gitignore` 로 제외되며, 값이 비어 있는 양식 `.env.local.example` 만 저장소에 포함됩니다.
- 공공데이터포털에서는 아래 서비스의 **활용신청**이 필요합니다.
  - 기상청_단기예보 ((구)동네예보) 조회서비스
  - 도로교통공단_자전거 교통사고 다발지역 정보
- 카카오 개발자 콘솔에서 **카카오맵** 사용 설정을 켜야 자전거 경로 API 가 동작합니다.

## API (Route Handlers)

| 경로 | 설명 |
|---|---|
| `GET /api/stations?lat=&lng=&radius=&limit=` | 기준 좌표 주변 따릉이 대여소 (거리순) |
| `GET /api/places?query=` | 장소 검색 |
| `GET /api/route?fromLat=&fromLng=&toLat=&toLng=` | 자전거도로 우선 / 최단 경로 |
| `GET /api/accidents` | 서울 사고다발지역 (최신 기준연도 자동 탐색) |
| `GET /api/weather?lat=&lng=` | 출발지 격자 변환 후 단기예보 |

응답은 `{ ok: true, data }` 또는 `{ ok: false, error }` 형태이며, 오류 메시지에는 키나 외부 API 주소가 포함되지 않습니다.

## 배포 (Vercel)

1. 이 저장소를 GitHub 에 올립니다.
2. [Vercel](https://vercel.com/new) 에서 저장소를 Import 합니다. (Framework: Next.js 자동 인식)
3. **Settings → Environment Variables** 에 위 환경변수 4개를 등록합니다. 서버 전용 3개는 *Sensitive* 로 설정하는 것을 권장합니다.
4. 첫 배포 후 발급된 도메인(`https://<프로젝트>.vercel.app`)을 카카오 개발자 콘솔 **앱 → 플랫폼 → Web → 사이트 도메인**에 등록합니다.
5. 환경변수나 도메인을 바꾼 뒤에는 **Redeploy** 합니다. (`NEXT_PUBLIC_*` 값은 빌드 시점에 번들에 포함되므로 재배포가 필요합니다.)

`vercel.json` 은 함수 실행 리전을 서울(`icn1`)로 지정합니다. 국내 공공 API 와의 지연을 줄이기 위한 설정입니다.

## 스크립트

```bash
npm run dev     # 개발 서버
npm run build   # 프로덕션 빌드
npm run start   # 프로덕션 서버
npm run lint    # ESLint
```

## 데이터 출처

- 서울 열린데이터광장 — 공공자전거 실시간 대여정보
- 한국도로교통공단(공공데이터포털) — 자전거 교통사고 다발지역
- 기상청(공공데이터포털) — 단기예보
- 카카오 — 로컬 검색, 자전거 경로, 지도
