export type LatLng = { lat: number; lng: number };

export type Place = LatLng & { id: string; name: string; address: string };

export type Station = LatLng & {
  id: string;
  name: string;
  bikes: number; // 현재 이용 가능한 자전거 수
  racks: number; // 거치대 수
  distanceM?: number; // 기준점으로부터 거리(m)
};

export type RouteMode = "BIKE_ONLY" | "SHORTEST";

export type RouteResult = {
  mode: RouteMode;
  distanceM: number;
  timeSec: number;
  path: LatLng[];
  guidance: string[];
};

/** 모드별 경로 조회 결과. 실패하면 임의 경로를 만들지 않고 이유만 담는다. */
export type RouteOutcome =
  | { mode: RouteMode; ok: true; route: RouteResult }
  | { mode: RouteMode; ok: false; reason: string };

export type AccidentZone = LatLng & {
  id: string;
  title: string;
  accidents: number;
  casualties: number;
  deaths: number;
  radiusM: number;
};

export type AccidentData = {
  baseYear: number; // 조회 가능한 최신 기준연도(searchYearCd)
  zones: AccidentZone[];
  failedDistricts: number;
};

export type WeatherData = {
  grid: { nx: number; ny: number };
  announcedAt: string; // 발표시각 (예: 2026-11-19 14:00)
  forecastAt: string; // 예보시각
  temp: number | null;
  pop: number | null; // 강수확률 %
  sky: string | null;
  precipitation: string | null;
};

/** 대여소 조회 응답. 서울시 API는 측정시각을 주지 않아 서버가 응답을 받은 시각을 함께 준다. */
export type StationsData = { fetchedAt: string; stations: Station[] };

/** 경로 조회 응답. queriedAt 은 서버가 카카오에 조회한 시각. */
export type RouteQuery = { queriedAt: string; outcomes: RouteOutcome[] };

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };
