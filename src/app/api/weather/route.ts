import type { NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { serverKey } from "@/lib/server/env";
import { toKmaGrid } from "@/lib/server/kma-grid";
import { numParam, respond, ServiceError, UpstreamError } from "@/lib/server/http";
import type { WeatherData } from "@/lib/types";

// 공공데이터포털: 기상청 단기예보 조회서비스 - 단기예보(getVilageFcst)
type Item = { category: string; fcstDate: string; fcstTime: string; fcstValue: string };
type Res = {
  response?: { header?: { resultCode: string; resultMsg?: string }; body?: { items?: { item?: Item[] } } };
};

const SKY: Record<string, string> = { "1": "맑음", "3": "구름 많음", "4": "흐림" };
const PTY: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" };
const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23]; // 단기예보 발표 시각(KST)
const p2 = (n: number) => String(n).padStart(2, "0");

/** 현재(KST)로부터 가장 최근에 '제공 중인' 발표 시각. 발표 후 약 10분 뒤부터 조회 가능. */
function latestBase(now = new Date()): { date: string; time: string } {
  const kst = new Date(now.getTime() + 9 * 3600_000 - 10 * 60_000);
  let hour = [...BASE_HOURS].reverse().find((h) => h <= kst.getUTCHours());
  if (hour === undefined) {
    kst.setUTCDate(kst.getUTCDate() - 1);
    hour = 23;
  }
  return { date: `${kst.getUTCFullYear()}${p2(kst.getUTCMonth() + 1)}${p2(kst.getUTCDate())}`, time: `${p2(hour)}00` };
}

const fmt = (d: string, t: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${t.slice(0, 2)}:${t.slice(2, 4)}`;

/** GET /api/weather?lat=&lng= (출발지 좌표 → 기상청 격자 변환 → 가장 가까운 예보시각의 기온·강수확률) */
export async function GET(request: NextRequest) {
  return respond<WeatherData>(async () => {
    const sp = request.nextUrl.searchParams;
    const lat = numParam(sp, "lat", { min: 33, max: 39 });
    const lng = numParam(sp, "lng", { min: 124, max: 132 });
    const grid = toKmaGrid(lat, lng);
    const base = latestBase();

    const params = new URLSearchParams({
      serviceKey: serverKey("DATA_GO_KR_API_KEY"),
      pageNo: "1",
      numOfRows: "300",
      dataType: "JSON",
      base_date: base.date,
      base_time: base.time,
      nx: String(grid.nx),
      ny: String(grid.ny),
    });
    let json: Res;
    try {
      const res = await fetch(`https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params}`, {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
      if (res.status === 403) {
        throw new ServiceError(
          "공공데이터포털에서 '기상청_단기예보 ((구)_동네예보) 조회서비스' 활용신청이 되어 있지 않거나 아직 승인되지 않았습니다 (SERVICE_KEY_IS_NOT_REGISTERED_ERROR). 활용신청 후 다시 시도하세요.",
          503,
        );
      }
      if (!res.ok) throw new UpstreamError("kma/vilageFcst", res.status);
      json = (await res.json()) as Res;
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof ServiceError || e instanceof UpstreamError) throw e;
      throw new UpstreamError("kma/vilageFcst");
    }

    const items = json.response?.body?.items?.item;
    if (json.response?.header?.resultCode !== "00" || !items?.length) {
      throw new ServiceError(`기상청 응답 오류 (${json.response?.header?.resultMsg ?? "데이터 없음"})`);
    }

    // 현재 시각(KST) 이후 첫 예보시각 선택
    const nowKst = new Date(Date.now() + 9 * 3600_000);
    const nowKey = `${nowKst.getUTCFullYear()}${p2(nowKst.getUTCMonth() + 1)}${p2(nowKst.getUTCDate())}${p2(nowKst.getUTCHours())}00`;
    const slots = [...new Set(items.map((i) => i.fcstDate + i.fcstTime))].sort();
    const slot = slots.find((s) => s >= nowKey) ?? slots[slots.length - 1];
    const pick = (cat: string) => items.find((i) => i.category === cat && i.fcstDate + i.fcstTime === slot)?.fcstValue;
    const num = (v?: string) => (v === undefined || v === "" ? null : Number(v));

    return {
      grid,
      announcedAt: fmt(base.date, base.time),
      forecastAt: fmt(slot.slice(0, 8), slot.slice(8)),
      temp: num(pick("TMP")),
      pop: num(pick("POP")),
      sky: SKY[pick("SKY") ?? ""] ?? null,
      precipitation: PTY[pick("PTY") ?? ""] ?? null,
    };
  }, 600);
}
