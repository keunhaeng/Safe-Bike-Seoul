import type { NextRequest } from "next/server";
import { serverKey } from "@/lib/server/env";
import { BadRequestError, fetchJson, respond } from "@/lib/server/http";

// 카카오 로컬 API: 키워드로 장소 검색
type KakaoDoc = {
  id: string;
  place_name: string;
  road_address_name: string;
  address_name: string;
  x: string; // 경도
  y: string; // 위도
};

// 서울 중심 좌표를 함께 보내 서울과 가까운 결과를 우선한다 (radius 로 제한하지는 않는다)
const SEOUL = { x: "126.9780", y: "37.5665" };

export async function GET(request: NextRequest) {
  return respond(async () => {
    const q = (request.nextUrl.searchParams.get("query") ?? "").trim();
    if (q.length < 1 || q.length > 50) throw new BadRequestError("query 는 1~50자여야 합니다.");

    const params = new URLSearchParams({ query: q, size: "8", ...SEOUL });
    const json = await fetchJson<{ documents: KakaoDoc[] }>(
      "kakao/local",
      `https://dapi.kakao.com/v2/local/search/keyword.json?${params}`,
      { headers: { Authorization: `KakaoAK ${serverKey("KAKAO_REST_API_KEY")}` } },
    );

    return json.documents.map((d) => ({
      id: d.id,
      name: d.place_name,
      address: d.road_address_name || d.address_name,
      lat: Number(d.y),
      lng: Number(d.x),
    }));
  }, 300);
}
