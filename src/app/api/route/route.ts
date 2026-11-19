import { unstable_rethrow } from "next/navigation";
import type { NextRequest } from "next/server";
import { serverKey } from "@/lib/server/env";
import { numParam, redact, respond } from "@/lib/server/http";
import type { LatLng, RouteMode, RouteOutcome } from "@/lib/types";

// 카카오맵 REST API: 자전거 경로 조회
// 문서: https://developers.kakao.com/docs/ko/kakaomap/rest-api (자전거 경로 조회)
type KakaoBikeRes = {
  status?: string;
  route?: {
    properties?: { totalDistance?: number; totalTime?: number };
    legs?: {
      steps?: {
        properties?: { guidance?: string };
        path?: { points?: [number, number][] };
      }[];
    }[];
  };
  message?: string;
  msg?: string;
  errorType?: string;
};

const STATUS_REASON: Record<string, string> = {
  SAME_POINT: "출발지와 도착지가 같은 위치입니다.",
  START_LINK_NOT_FOUND: "출발지 주변에서 자전거로 갈 수 있는 길을 찾지 못했습니다.",
  END_LINK_NOT_FOUND: "도착지 주변에서 자전거로 갈 수 있는 길을 찾지 못했습니다.",
  TOO_MANY_SEARCH_LINK: "탐색 범위가 너무 넓어 경로를 찾지 못했습니다.",
  TOO_FAR_AWAY: "출발지와 도착지가 너무 멀어 경로를 찾지 못했습니다.",
  ROUTE_RESULT_NOT_FOUND: "카카오가 두 지점 사이의 자전거 경로를 찾지 못했습니다.",
};

async function fetchMode(mode: RouteMode, from: LatLng, to: LatLng): Promise<RouteOutcome> {
  const params = new URLSearchParams({
    start_x: String(from.lng),
    start_y: String(from.lat),
    end_x: String(to.lng),
    end_y: String(to.lat),
    route_mode: mode,
  });
  const key = serverKey("KAKAO_REST_API_KEY");
  let res: Response;
  try {
    res = await fetch(`https://dapi.kakao.com/v2/routing/bicycle?${params}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
  } catch (e) {
    unstable_rethrow(e);
    return { mode, ok: false, reason: "카카오 서버에 연결하지 못했습니다." };
  }

  const body = (await res.json().catch(() => null)) as KakaoBikeRes | null;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      // 카카오는 오류 메시지에 키를 되돌려 주므로 상세 메시지는 쓰지 않는다.
      return { mode, ok: false, reason: `카카오 API 인증/권한 오류 (HTTP ${res.status}). 카카오 개발자 콘솔에서 REST API 키와 '카카오맵' 사용 설정을 확인하세요.` };
    }
    const detail = redact(body?.msg ?? body?.message ?? "", [key]);
    return { mode, ok: false, reason: `카카오 자전거 경로 API 오류 (HTTP ${res.status}${detail ? `: ${detail}` : ""}).` };
  }
  if (!body || body.status !== "OK" || !body.route) {
    return { mode, ok: false, reason: STATUS_REASON[body?.status ?? ""] ?? `경로를 찾지 못했습니다 (${body?.status ?? "알 수 없음"}).` };
  }

  const steps = body.route.legs?.flatMap((l) => l.steps ?? []) ?? [];
  const path: LatLng[] = [];
  for (const s of steps) {
    for (const [lng, lat] of s.path?.points ?? []) {
      const last = path[path.length - 1];
      if (!last || last.lat !== lat || last.lng !== lng) path.push({ lat, lng });
    }
  }
  if (path.length < 2) return { mode, ok: false, reason: "카카오 응답에 경로 좌표가 없습니다." };

  return {
    mode,
    ok: true,
    route: {
      mode,
      distanceM: body.route.properties?.totalDistance ?? 0,
      timeSec: body.route.properties?.totalTime ?? 0,
      path,
      guidance: steps.map((s) => s.properties?.guidance ?? "").filter(Boolean),
    },
  };
}

/** GET /api/route?fromLat=&fromLng=&toLat=&toLng= → 자전거도로 우선 / 최단 경로 */
export async function GET(request: NextRequest) {
  return respond(async () => {
    const sp = request.nextUrl.searchParams;
    const from = { lat: numParam(sp, "fromLat", { min: 33, max: 39 }), lng: numParam(sp, "fromLng", { min: 124, max: 132 }) };
    const to = { lat: numParam(sp, "toLat", { min: 33, max: 39 }), lng: numParam(sp, "toLng", { min: 124, max: 132 }) };
    serverKey("KAKAO_REST_API_KEY"); // 키 누락은 503 으로 먼저 처리
    const queriedAt = new Date().toISOString();
    const outcomes = await Promise.all([fetchMode("BIKE_ONLY", from, to), fetchMode("SHORTEST", from, to)]);
    return { queriedAt, outcomes };
  }, 60);
}
