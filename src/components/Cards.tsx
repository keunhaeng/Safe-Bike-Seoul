import { formatDistance } from "@/lib/geo";
import type { AccidentData, AccidentZone, RouteMode, RouteOutcome, Station, WeatherData } from "@/lib/types";
import { ROUTE_COLOR, stationColor } from "./MapView";

export function Card({ title, source, children }: { title: string; source?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-zinc-900">{title}</h2>
        {source && <span className="text-[10px] text-zinc-400">{source}</span>}
      </div>
      {children}
    </section>
  );
}

const Muted = ({ children }: { children: React.ReactNode }) => <p className="text-sm text-zinc-500">{children}</p>;
const ErrorBox = ({ children }: { children: React.ReactNode }) => (
  <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs leading-relaxed text-red-700">{children}</p>
);

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-green-600" />
      {label}
    </label>
  );
}

/* ───────── 따릉이 대여소 ───────── */
export function StationCard(p: {
  hasOrigin: boolean; loading: boolean; error?: string; stations: Station[];
  selectedId: string | null; onSelect: (id: string) => void; show: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <Card title="출발지 주변 따릉이" source="서울 열린데이터광장 · 실시간">
      {!p.hasOrigin ? <Muted>출발지를 선택하면 가까운 대여소를 보여드려요.</Muted>
        : p.error ? <ErrorBox>{p.error}</ErrorBox>
        : p.loading ? <Muted>대여소를 불러오는 중…</Muted>
        : p.stations.length === 0 ? <Muted>반경 1.5km 안에 대여소가 없어요.</Muted>
        : (
          <>
            <Toggle checked={p.show} onChange={p.onToggle} label="지도에 표시" />
            <ul className="mt-2 divide-y divide-zinc-100">
              {p.stations.slice(0, 8).map((s) => (
                <li key={s.id}>
                  <button type="button" aria-pressed={s.id === p.selectedId} onClick={() => p.onSelect(s.id)}
                    className={`flex w-full items-center justify-between rounded px-1 py-2 text-left text-sm hover:bg-zinc-50 ${s.id === p.selectedId ? "bg-zinc-100" : ""}`}>
                    <span className="flex min-w-0 items-center gap-2 text-zinc-800">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: stationColor(s) }} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="ml-2 shrink-0 text-right text-xs text-zinc-500">
                      <b className="text-zinc-900">{s.bikes}</b>대 · {formatDistance(s.distanceM ?? 0)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-zinc-400">거리순 · 초록: 여유 · 주황: 3대 이하 · 회색: 없음. 누르면 그 대여소에서 경로를 찾아요.</p>
          </>
        )}
    </Card>
  );
}

/* ───────── 경로 ───────── */
const MODE_LABEL: Record<RouteMode, { name: string }> = {
  BIKE_ONLY: { name: "자전거도로 우선" },
  SHORTEST: { name: "최단 경로" },
};

export function RouteCard(p: {
  ready: boolean; stationName?: string; loading: boolean; error?: string; outcomes?: RouteOutcome[];
  selectedMode: RouteMode; onSelect: (m: RouteMode) => void; guidance: string[];
  nearCounts: Partial<Record<RouteMode, number>>; accidentYear?: number; accidentsReady: boolean;
}) {
  const ok = (m: RouteMode) => p.outcomes?.find((o) => o.mode === m && o.ok) as Extract<RouteOutcome, { ok: true }> | undefined;
  const bike = ok("BIKE_ONLY"), short = ok("SHORTEST");
  const diff = bike && short ? Math.round(bike.route.distanceM - short.route.distanceM) : null;
  return (
    <Card title="경로 비교" source="카카오맵 자전거 경로 API · 도로교통공단">
      {!p.ready ? <Muted>출발지 주변 대여소와 목적지를 선택하면 경로를 조회해요.</Muted>
        : p.loading ? <Muted>경로를 조회하는 중…</Muted>
        : p.error ? <ErrorBox>{p.error}</ErrorBox>
        : (
          <>
            <p className="mb-2 text-xs text-zinc-500">{p.stationName} 대여소 → 목적지 · 경로를 누르면 지도에 강조돼요</p>
            <div className="grid grid-cols-2 gap-2">
              {p.outcomes?.map((o) => {
                const label = MODE_LABEL[o.mode];
                const head = (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: ROUTE_COLOR[o.mode] }} />{label.name}
                  </span>
                );
                if (!o.ok) {
                  return (
                    <div key={o.mode} className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                      {head}
                      <p className="mt-1 text-xs text-red-700">표시할 수 없어요: {o.reason}</p>
                    </div>
                  );
                }
                const sel = o.mode === p.selectedMode;
                const near = p.nearCounts[o.mode];
                return (
                  <button key={o.mode} type="button" aria-pressed={sel} onClick={() => p.onSelect(o.mode)}
                    className={`rounded-lg border p-2.5 text-left transition ${sel ? "border-zinc-900 bg-zinc-50" : "border-zinc-200 hover:bg-zinc-50"}`}>
                    {head}
                    <dl className="mt-2 space-y-1 text-xs">
                      <div className="flex justify-between"><dt className="text-zinc-500">거리</dt><dd className="font-semibold text-zinc-900">{formatDistance(o.route.distanceM)}</dd></div>
                      <div className="flex justify-between"><dt className="text-zinc-500">예상 시간</dt><dd className="font-semibold text-zinc-900">{Math.round(o.route.timeSec / 60)}분</dd></div>
                      <div className="flex justify-between"><dt className="text-zinc-500">주변 사고다발지역</dt><dd className="font-semibold text-zinc-900">{p.accidentsReady && near !== undefined ? `${near}곳` : "–"}</dd></div>
                    </dl>
                  </button>
                );
              })}
            </div>
            {diff !== null && (
              <p className="mt-2 text-xs text-zinc-600">
                자전거도로 우선 경로는 최단 경로보다 {diff === 0 ? "거리가 같아요" : `${formatDistance(Math.abs(diff))} ${diff > 0 ? "더 길어요" : "더 짧아요"}`}.
              </p>
            )}
            <p className="mt-2 rounded-lg bg-zinc-100 p-2 text-[11px] leading-relaxed text-zinc-600">
              ‘주변 사고다발지역’은 경로에서 경계 100m 이내인 곳의 수입니다. 안전도나 위험도 점수가 <b>아니며</b>, 수가 적다고 더 안전하거나 많다고 더 위험하다고 말할 수 없어요.
              {p.accidentYear ? ` ${p.accidentYear}년 기준 과거 통계이고,` : ""} 교통량·노면·신호·시간대·날씨는 반영되지 않았어요. 실제 주행 전 현장 상황을 확인하세요.
            </p>
            {p.guidance.length > 0 && (
              <details className="mt-3 text-xs text-zinc-600">
                <summary className="cursor-pointer font-medium text-zinc-700">길 안내 {p.guidance.length}단계 (선택한 경로)</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-5">{p.guidance.map((g, i) => <li key={i}>{g}</li>)}</ol>
              </details>
            )}
          </>
        )}
    </Card>
  );
}

/* ───────── 사고다발지역 ───────── */
export function AccidentCard(p: {
  loading: boolean; error?: string; data?: AccidentData; nearZones: AccidentZone[]; hasRoute: boolean;
  show: boolean; onToggle: (v: boolean) => void;
}) {
  return (
    <Card title="자전거 사고다발지역" source="도로교통공단 · 과거 통계">
      {p.loading ? <Muted>사고다발지역을 불러오는 중…</Muted>
        : p.error ? <ErrorBox>{p.error}</ErrorBox>
        : p.data && (
          <>
            <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs leading-relaxed text-amber-900">
              ⚠️ <b>과거 사고 통계</b>입니다. 제공되는 최신 기준연도는 <b>{p.data.baseYear}년</b>(searchYearCd)이며, 지금의 위험을 뜻하지 않아요. 서울 {p.data.zones.length}곳.
              {p.data.failedDistricts > 0 && ` (${p.data.failedDistricts}개 구 조회 실패)`}
            </p>
            <Toggle checked={p.show} onChange={p.onToggle} label="지도에 표시" />
            <h3 className="mt-3 text-xs font-semibold text-zinc-700">선택한 경로 근처 (경계 100m 이내)</h3>
            {!p.hasRoute ? <Muted>경로를 조회하면 가까운 사고다발지역을 알려드려요.</Muted>
              : p.nearZones.length === 0 ? <Muted>가까운 사고다발지역이 없어요.</Muted>
              : (
                <ul className="mt-1 space-y-2">
                  {p.nearZones.map((z) => (
                    <li key={z.id} className="text-sm">
                      <p className="font-medium text-zinc-900">{z.title}</p>
                      <p className="text-xs text-zinc-500">사고 {z.accidents}건 · 사상자 {z.casualties}명{z.deaths ? ` · 사망 ${z.deaths}명` : ""}</p>
                    </li>
                  ))}
                </ul>
              )}
          </>
        )}
    </Card>
  );
}

/* ───────── 날씨 ───────── */
export function WeatherCard(p: { hasOrigin: boolean; loading: boolean; error?: string; data?: WeatherData }) {
  const d = p.data;
  return (
    <Card title="출발지 날씨" source="기상청 단기예보">
      {!p.hasOrigin ? <Muted>출발지를 선택하면 날씨를 보여드려요.</Muted>
        : p.loading ? <Muted>날씨를 불러오는 중…</Muted>
        : p.error ? <ErrorBox>{p.error}</ErrorBox>
        : d && (
          <>
            <div className="flex items-end gap-4">
              <div>
                <p className="text-xs text-zinc-500">기온</p>
                <p className="text-3xl font-bold text-zinc-900">{d.temp ?? "–"}°</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">강수확률</p>
                <p className="text-3xl font-bold text-sky-700">{d.pop ?? "–"}%</p>
              </div>
              <p className="pb-1 text-xs text-zinc-500">{[d.sky, d.precipitation && d.precipitation !== "없음" ? d.precipitation : null].filter(Boolean).join(" · ")}</p>
            </div>
            <dl className="mt-3 space-y-1 rounded-lg bg-zinc-50 p-2 text-xs text-zinc-600">
              <div className="flex justify-between"><dt>예보시각 (이 시각의 예보)</dt><dd className="font-semibold text-zinc-900">{d.forecastAt}</dd></div>
              <div className="flex justify-between"><dt>발표시각 (기상청이 발표한 때)</dt><dd className="font-semibold text-zinc-900">{d.announcedAt}</dd></div>
              <div className="flex justify-between"><dt>기상청 격자</dt><dd>nx {d.grid.nx}, ny {d.grid.ny}</dd></div>
            </dl>
          </>
        )}
    </Card>
  );
}

/* ───────── 데이터 출처·시각 ───────── */
const kst = (iso?: string) =>
  iso ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(iso)) : "–";

export function SourcesCard(p: {
  stationsFetchedAt?: string; routeQueriedAt?: string; accidentYear?: number; weather?: WeatherData;
}) {
  const rows: { name: string; source: string; time: string; note?: string }[] = [
    { name: "따릉이 대여 현황", source: "서울 열린데이터광장 · 공공자전거 실시간 대여정보(bikeList)", time: `조회 ${kst(p.stationsFetchedAt)}`, note: "API가 측정시각을 주지 않아 서버가 응답을 받은 시각이며, 최대 약 1분 캐시돼요." },
    { name: "자전거 경로", source: "카카오맵 REST API · 자전거 경로 조회", time: `조회 ${kst(p.routeQueriedAt)}` },
    { name: "사고다발지역", source: "한국도로교통공단 · 자전거 교통사고 다발지역(공공데이터포털)", time: p.accidentYear ? `기준연도 ${p.accidentYear}년 (과거 통계)` : "–" },
    { name: "날씨", source: "기상청 단기예보 조회서비스(공공데이터포털)", time: p.weather ? `발표 ${p.weather.announcedAt} · 예보 ${p.weather.forecastAt}` : "–" },
  ];
  return (
    <Card title="데이터 출처·시각">
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.name} className="text-xs">
            <p className="flex justify-between gap-2"><b className="text-zinc-800">{r.name}</b><span className="text-right text-zinc-600">{r.time}</span></p>
            <p className="text-zinc-500">{r.source}</p>
            {r.note && <p className="text-[11px] text-zinc-400">{r.note}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
        이 서비스는 공공 API의 정보를 그대로 보여주는 참고용이에요. 경로·지역의 실제 안전성을 판단하거나 보장하지 않아요.
      </p>
    </Card>
  );
}
