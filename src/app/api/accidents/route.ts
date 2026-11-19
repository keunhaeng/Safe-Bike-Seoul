import { serverKey } from "@/lib/server/env";
import { fetchJson, respond, ServiceError } from "@/lib/server/http";
import type { AccidentData, AccidentZone } from "@/lib/types";

// 공공데이터포털: 도로교통공단 자전거 교통사고 다발지역 (frequentzoneBicycle)
// 시군구(guGun) 필수 → 서울 25개 자치구를 모두 조회한다.
const SEOUL_GU = [
  "110", "140", "170", "200", "215", "230", "260", "290", "305", "320", "350", "380", "410",
  "440", "470", "500", "530", "545", "560", "590", "620", "650", "680", "710", "740",
];

type Item = {
  afos_id?: string;
  spot_cd?: string;
  spot_nm?: string;
  occrrnc_cnt?: number | string;
  caslt_cnt?: number | string;
  dth_dnv_cnt?: number | string;
  la_crd?: number | string;
  lo_crd?: number | string;
  geom_json?: string;
};
type Res = { resultCode?: string; items?: { item?: Item[] | Item } };

const URL_BASE = "https://apis.data.go.kr/B552061/frequentzoneBicycle/getRestFrequentzoneBicycle";
const CACHE_MS = 6 * 3600_000;
let cache: { at: number; data: AccidentData } | null = null;

async function fetchGu(key: string, year: number, gu: string): Promise<Item[] | "nodata"> {
  const params = new URLSearchParams({
    serviceKey: key,
    searchYearCd: String(year),
    siDo: "11",
    guGun: gu,
    type: "json",
    numOfRows: "100",
    pageNo: "1",
  });
  const json = await fetchJson<Res>("data.go.kr/accidents", `${URL_BASE}?${params}`);
  if (json.resultCode === "03") return "nodata"; // NODATA_ERROR
  if (json.resultCode !== "00") throw new ServiceError(`사고다발지역 API 오류 (resultCode ${json.resultCode ?? "?"})`);
  const raw = json.items?.item ?? [];
  return Array.isArray(raw) ? raw : [raw];
}

/** 원형 다발지역 폴리곤(geom_json)에서 반지름(m)을 근사한다. */
function radiusOf(geom: string | undefined, lat: number): number {
  try {
    const ring = (JSON.parse(geom ?? "") as { coordinates: number[][][] }).coordinates[0];
    const dLat = (Math.max(...ring.map((p) => p[1])) - Math.min(...ring.map((p) => p[1]))) / 2;
    const dLng = (Math.max(...ring.map((p) => p[0])) - Math.min(...ring.map((p) => p[0]))) / 2;
    const m = Math.max(dLat * 111_000, dLng * 111_000 * Math.cos((lat * Math.PI) / 180));
    return Math.round(m) || 50;
  } catch {
    return 50;
  }
}

/** 최신 기준연도부터 거슬러 내려가며 데이터가 있는 연도를 찾는다. */
async function load(): Promise<AccidentData> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const key = serverKey("DATA_GO_KR_API_KEY");

  const thisYear = new Date().getFullYear();
  let baseYear = 0;
  for (let y = thisYear; y >= thisYear - 6; y--) {
    const probe = await fetchGu(key, y, "680");
    if (probe !== "nodata") { baseYear = y; break; }
  }
  if (!baseYear) throw new ServiceError("조회 가능한 사고다발지역 기준연도를 찾지 못했습니다.");

  const settled = await Promise.allSettled(SEOUL_GU.map((gu) => fetchGu(key, baseYear, gu)));
  const zones: AccidentZone[] = [];
  let failed = 0;
  for (const r of settled) {
    if (r.status === "rejected") { failed++; continue; }
    if (r.value === "nodata") continue;
    for (const i of r.value) {
      const lat = Number(i.la_crd), lng = Number(i.lo_crd);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      zones.push({
        id: `${i.afos_id ?? ""}-${i.spot_cd ?? zones.length}`,
        title: i.spot_nm ?? "사고다발지역",
        accidents: Number(i.occrrnc_cnt ?? 0),
        casualties: Number(i.caslt_cnt ?? 0),
        deaths: Number(i.dth_dnv_cnt ?? 0),
        lat,
        lng,
        radiusM: radiusOf(i.geom_json, lat),
      });
    }
  }
  if (zones.length === 0) throw new ServiceError("사고다발지역 데이터를 가져오지 못했습니다.");

  const data = { baseYear, zones, failedDistricts: failed };
  if (failed === 0) cache = { at: Date.now(), data };
  return data;
}

export async function GET() {
  return respond(load, 3600);
}
