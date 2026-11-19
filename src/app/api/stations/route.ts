import type { NextRequest } from "next/server";
import { distanceM } from "@/lib/geo";
import { serverKey } from "@/lib/server/env";
import { fetchJson, numParam, respond, ServiceError, UpstreamError } from "@/lib/server/http";
import type { Station } from "@/lib/types";

// 서울 열린데이터광장: 공공자전거 실시간 대여정보 (bikeList)
type Row = {
  stationId: string;
  stationName: string;
  rackTotCnt: string;
  parkingBikeTotCnt: string;
  stationLatitude: string;
  stationLongitude: string;
};
type Res = { rentBikeStatus?: { RESULT?: { CODE: string; MESSAGE?: string }; row?: Row[] } };

const PAGE = 1000;
const CACHE_MS = 60_000;
let cache: { at: number; stations: Station[] } | null = null;

async function loadAll(): Promise<{ at: number; stations: Station[] }> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache;
  const key = serverKey("SEOUL_API_KEY");
  const rows: Row[] = [];
  for (let start = 1, i = 0; i < 6; start += PAGE, i++) {
    const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/bikeList/${start}/${start + PAGE - 1}/`;
    const json = await fetchJson<Res>("seoul/bikeList", url);
    const page = json.rentBikeStatus?.row ?? [];
    const code = json.rentBikeStatus?.RESULT?.CODE;
    if (page.length === 0 && start === 1) {
      throw new ServiceError(`서울 열린데이터광장 응답 오류${code ? ` (${code})` : ""}`);
    }
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  if (rows.length === 0) throw new UpstreamError("seoul/bikeList");

  const stations = rows
    .map((r) => ({
      id: r.stationId,
      name: r.stationName.replace(/^\d+\.\s*/, ""),
      lat: Number(r.stationLatitude),
      lng: Number(r.stationLongitude),
      bikes: Number(r.parkingBikeTotCnt),
      racks: Number(r.rackTotCnt),
    }))
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng) && s.lat > 0 && s.lng > 0);
  cache = { at: Date.now(), stations };
  return cache;
}

/**
 * GET /api/stations?lat=&lng=&radius=1500&limit=20&minBikes=0
 * 기준 좌표 주변 대여소를 거리순으로 반환한다.
 */
export async function GET(request: NextRequest) {
  return respond(async () => {
    const sp = request.nextUrl.searchParams;
    const origin = {
      lat: numParam(sp, "lat", { min: 33, max: 39 }),
      lng: numParam(sp, "lng", { min: 124, max: 132 }),
    };
    const radius = sp.has("radius") ? numParam(sp, "radius", { min: 100, max: 5000 }) : 1500;
    const limit = sp.has("limit") ? numParam(sp, "limit", { min: 1, max: 50 }) : 20;
    const minBikes = sp.has("minBikes") ? numParam(sp, "minBikes", { min: 0, max: 50 }) : 0;

    const { at, stations: all } = await loadAll();
    const stations = all
      .map((s) => ({ ...s, distanceM: Math.round(distanceM(origin, s)) }))
      .filter((s) => s.distanceM <= radius && s.bikes >= minBikes)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, limit);
    return { fetchedAt: new Date(at).toISOString(), stations };
  }, 30);
}
