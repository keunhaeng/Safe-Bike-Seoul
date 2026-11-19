"use client";

import { useMemo, useState } from "react";
import { distanceToPathM } from "@/lib/geo";
import type { AccidentData, AccidentZone, Place, RouteMode, RouteQuery, RouteResult, StationsData, WeatherData } from "@/lib/types";
import { useApi } from "@/lib/useApi";
import { AccidentCard, RouteCard, SourcesCard, StationCard, WeatherCard } from "./Cards";
import MapView from "./MapView";
import PlaceSearch from "./PlaceSearch";

// 처음 화면용 기본 출발/도착 (실제 좌표, 카카오 검색으로 바꿀 수 있음)
const DEFAULT_ORIGIN: Place = { id: "default-origin", name: "서울시청", address: "서울 중구 세종대로 110", lat: 37.5664, lng: 126.9779 };
const DEFAULT_DEST: Place = { id: "default-dest", name: "여의도한강공원", address: "서울 영등포구 여의동로 330", lat: 37.5283, lng: 126.9326 };

/** 경로 경계에서 이 거리(m) 이내의 사고다발지역을 '가깝다'고 본다. */
const NEAR_EDGE_M = 100;

export default function SafeBikeApp() {
  const [origin, setOriginState] = useState<Place | null>(DEFAULT_ORIGIN);
  const [dest, setDest] = useState<Place | null>(DEFAULT_DEST);
  const [pickedStationId, setPickedStationId] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<RouteMode>("BIKE_ONLY");
  const [showStations, setShowStations] = useState(true);
  const [showAccidents, setShowAccidents] = useState(true);

  const setOrigin = (p: Place | null) => { setOriginState(p); setPickedStationId(null); };

  // 1) 출발지 주변 대여소 (거리순)
  const stationsApi = useApi<StationsData>(
    origin ? `/api/stations?lat=${origin.lat}&lng=${origin.lng}&radius=1500&limit=20` : null,
  );
  const stations = useMemo(() => stationsApi.data?.stations ?? [], [stationsApi.data]);
  // 직접 고르지 않으면 자전거가 있는 가장 가까운 대여소
  const station = stations.find((s) => s.id === pickedStationId) ?? stations.find((s) => s.bikes > 0) ?? null;

  // 2) 선택 대여소 → 목적지 자전거 경로 (실패 시 이유만 표시, 임의 경로 없음)
  const routeApi = useApi<RouteQuery>(
    station && dest ? `/api/route?fromLat=${station.lat}&fromLng=${station.lng}&toLat=${dest.lat}&toLng=${dest.lng}` : null,
  );
  const routes = useMemo<RouteResult[]>(
    () => routeApi.data?.outcomes.flatMap((o) => (o.ok ? [o.route] : [])) ?? [],
    [routeApi.data],
  );
  const activeMode = routes.some((r) => r.mode === selectedMode) ? selectedMode : (routes[0]?.mode ?? selectedMode);
  const activeRoute = routes.find((r) => r.mode === activeMode);

  // 3) 사고다발지역(과거 통계) + 경로 근처 판정
  const accidentApi = useApi<AccidentData>("/api/accidents");
  const zones = useMemo(() => accidentApi.data?.zones ?? [], [accidentApi.data]);
  // 경로별로 가까운 사고다발지역을 계산한다 (비교용)
  const nearByMode = useMemo(() => {
    const out: Partial<Record<RouteMode, AccidentZone[]>> = {};
    for (const r of routes) {
      out[r.mode] = zones
        .map((z) => ({ z, edge: Math.max(0, distanceToPathM(z, r.path) - z.radiusM) }))
        .filter((x) => x.edge <= NEAR_EDGE_M)
        .sort((a, b) => a.edge - b.edge)
        .map((x) => x.z);
    }
    return out;
  }, [zones, routes]);
  const nearCounts = useMemo(
    () => Object.fromEntries(Object.entries(nearByMode).map(([m, z]) => [m, z.length])) as Partial<Record<RouteMode, number>>,
    [nearByMode],
  );
  const nearZones = useMemo(() => nearByMode[activeMode] ?? [], [nearByMode, activeMode]);
  const nearIds = useMemo(() => new Set(nearZones.map((z) => z.id)), [nearZones]);

  // 4) 출발지 날씨
  const weatherApi = useApi<WeatherData>(origin ? `/api/weather?lat=${origin.lat}&lng=${origin.lng}` : null);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2.5">
        <span className="text-xl" aria-hidden>🚲</span>
        <h1 className="whitespace-nowrap text-base font-bold text-zinc-900">Safe Bike Seoul</h1>
        <span className="hidden truncate text-xs text-zinc-500 sm:inline">서울 자전거 경로 · 따릉이 · 사고 통계 · 날씨</span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 min-h-0 w-full flex-1 space-y-3 overflow-y-auto bg-zinc-50 p-3 md:order-1 md:w-96 md:flex-none md:border-r md:border-zinc-200">
          <section className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
            <PlaceSearch label="출발지 검색" badge="출" badgeColor="#2563eb" value={origin} onChange={setOrigin} />
            <PlaceSearch label="목적지 검색" badge="도" badgeColor="#dc2626" value={dest} onChange={setDest} />
          </section>

          <RouteCard
            ready={!!station && !!dest} stationName={station?.name} loading={routeApi.loading} error={routeApi.error}
            outcomes={routeApi.data?.outcomes} selectedMode={activeMode} onSelect={setSelectedMode} guidance={activeRoute?.guidance ?? []}
            nearCounts={nearCounts} accidentYear={accidentApi.data?.baseYear} accidentsReady={!!accidentApi.data}
          />
          <StationCard
            hasOrigin={!!origin} loading={stationsApi.loading} error={stationsApi.error} stations={stations}
            selectedId={station?.id ?? null} onSelect={setPickedStationId} show={showStations} onToggle={setShowStations}
          />
          <WeatherCard hasOrigin={!!origin} loading={weatherApi.loading} error={weatherApi.error} data={weatherApi.data} />
          <AccidentCard
            loading={accidentApi.loading} error={accidentApi.error} data={accidentApi.data} nearZones={nearZones}
            hasRoute={!!activeRoute} show={showAccidents} onToggle={setShowAccidents}
          />
          <SourcesCard
            stationsFetchedAt={stationsApi.data?.fetchedAt} routeQueriedAt={routeApi.data?.queriedAt}
            accidentYear={accidentApi.data?.baseYear} weather={weatherApi.data}
          />
        </aside>

        <main className="relative order-1 h-[42dvh] shrink-0 md:order-2 md:h-auto md:flex-1">
          <MapView
            origin={origin} dest={dest} stations={stations} selectedStationId={station?.id ?? null}
            onSelectStation={setPickedStationId} routes={routes} selectedMode={activeMode}
            accidents={zones} nearAccidentIds={nearIds} showStations={showStations} showAccidents={showAccidents}
          />
        </main>
      </div>
    </div>
  );
}
