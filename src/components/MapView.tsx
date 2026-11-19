"use client";

import { useEffect, useRef, useState } from "react";
import type { AccidentZone, LatLng, Place, RouteMode, RouteResult, Station } from "@/lib/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao: any;
  }
}

export type MapViewProps = {
  origin: Place | null;
  dest: Place | null;
  stations: Station[];
  selectedStationId: string | null;
  onSelectStation: (id: string) => void;
  routes: RouteResult[];
  selectedMode: RouteMode;
  accidents: AccidentZone[];
  nearAccidentIds: Set<string>;
  showStations: boolean;
  showAccidents: boolean;
};

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY;
const SEOUL_CENTER: LatLng = { lat: 37.5547, lng: 126.9857 };

export const ROUTE_COLOR: Record<RouteMode, string> = { BIKE_ONLY: "#16a34a", SHORTEST: "#2563eb" };

export function stationColor(s: Station): string {
  if (s.bikes === 0) return "#9ca3af";
  if (s.bikes <= 3) return "#f59e0b";
  return "#16a34a";
}

/* ───────────── Kakao SDK 로더 ───────────── */
let sdkPromise: Promise<void> | null = null;

function loadKakaoSdk(key: string): Promise<void> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    const done = () => window.kakao.maps.load(() => resolve());
    if (window.kakao?.maps?.load) return done();
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${key}&autoload=false`;
    script.async = true;
    script.onload = done;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Kakao Maps SDK 로드 실패 (JavaScript 키 / 등록 도메인을 확인하세요)"));
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
}

function pin(label: string, color: string, text?: string, opts?: { onClick?: () => void; ring?: boolean; title?: string }): HTMLElement {
  const el = document.createElement("div");
  if (opts?.title) el.title = opts.title;
  el.style.cssText = `display:flex;flex-direction:column;align-items:center;transform:translateY(-4px);${opts?.onClick ? "cursor:pointer" : "pointer-events:none"}`;
  const dot = document.createElement("div");
  dot.textContent = label;
  dot.style.cssText = `min-width:26px;height:26px;padding:0 6px;border-radius:13px;background:${color};color:#fff;font:700 12px/26px sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)${opts?.ring ? ",0 0 0 3px #111" : ""}`;
  el.appendChild(dot);
  if (text) {
    const t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = `margin-top:2px;padding:1px 6px;border-radius:4px;background:#fff;color:#111;font:600 11px sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.3);white-space:nowrap`;
    el.appendChild(t);
  }
  if (opts?.onClick) el.addEventListener("click", opts.onClick);
  return el;
}

/* ───────────── 카카오맵 ───────────── */
function KakaoMap(props: MapViewProps & { appKey: string; onError: (m: string) => void }) {
  const { appKey, onError, origin, dest, stations, selectedStationId, onSelectStation, routes, selectedMode, accidents, nearAccidentIds, showStations, showAccidents } = props;
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const overlays = useRef<any[]>([]);
  const [ready, setReady] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);

  // 컨테이너 크기가 바뀌면(모바일 회전·레이아웃 변경) 지도를 다시 맞춘다
  useEffect(() => {
    if (!ready || !box.current) return;
    const ro = new ResizeObserver(() => setLayoutTick((t) => t + 1));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    loadKakaoSdk(appKey)
      .then(() => {
        if (cancelled || !box.current) return;
        const { kakao } = window;
        map.current = new kakao.maps.Map(box.current, {
          center: new kakao.maps.LatLng(SEOUL_CENTER.lat, SEOUL_CENTER.lng),
          level: 7,
        });
        setReady(true);
      })
      .catch((e: Error) => !cancelled && onError(e.message));
    return () => {
      cancelled = true;
    };
  }, [appKey, onError]);

  useEffect(() => {
    if (!ready) return;
    const { kakao } = window;
    map.current.relayout();
    const ll = (p: LatLng) => new kakao.maps.LatLng(p.lat, p.lng);
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const add = (o: any) => {
      o.setMap(map.current);
      overlays.current.push(o);
    };
    const custom = (p: LatLng, content: HTMLElement, z = 1) =>
      add(new kakao.maps.CustomOverlay({ position: ll(p), content, yAnchor: 0.5, zIndex: z }));

    if (showAccidents) {
      accidents.forEach((a) => {
        const near = nearAccidentIds.has(a.id);
        add(
          new kakao.maps.Circle({
            center: ll(a),
            radius: Math.max(a.radiusM, 30),
            strokeWeight: near ? 3 : 1,
            strokeColor: "#dc2626",
            strokeOpacity: near ? 0.9 : 0.5,
            fillColor: "#dc2626",
            fillOpacity: near ? 0.35 : 0.15,
            zIndex: 1,
          }),
        );
        if (near) custom(a, pin("!", "#dc2626", `${a.accidents}건`, { title: `${a.title} · 사고 ${a.accidents}건 · 사상자 ${a.casualties}명` }), 8);
      });
    }

    const bounds = new kakao.maps.LatLngBounds();
    // 선택되지 않은 경로를 먼저(아래) 그린다
    [...routes].sort((a, b) => Number(a.mode === selectedMode) - Number(b.mode === selectedMode)).forEach((r) => {
      const selected = r.mode === selectedMode;
      add(
        new kakao.maps.Polyline({
          path: r.path.map(ll),
          strokeWeight: selected ? 7 : 4,
          strokeColor: ROUTE_COLOR[r.mode],
          strokeOpacity: selected ? 0.95 : 0.45,
          strokeStyle: selected ? "solid" : "shortdash",
          zIndex: selected ? 10 : 5,
        }),
      );
      if (selected) r.path.forEach((p) => bounds.extend(ll(p)));
    });

    if (showStations) {
      stations.forEach((s) => {
        const sel = s.id === selectedStationId;
        // 이름 라벨은 선택된 대여소에만 붙여 겹침을 줄이고, 나머지는 마우스를 올리면 이름이 보인다
        custom(s, pin(String(s.bikes), stationColor(s), sel ? s.name : undefined, { onClick: () => onSelectStation(s.id), ring: sel, title: `${s.name} · 자전거 ${s.bikes}대 / 거치대 ${s.racks}` }), sel ? 15 : 6);
        if (!routes.length) bounds.extend(ll(s));
      });
    }
    if (origin) { custom(origin, pin("출", "#2563eb", origin.name), 20); bounds.extend(ll(origin)); }
    if (dest) { custom(dest, pin("도", "#dc2626", dest.name), 20); bounds.extend(ll(dest)); }

    // 작은 화면(모바일)에서는 여백을 줄여야 경로가 보일 만큼 확대된다
    const pad = (box.current?.clientHeight ?? 600) < 420 ? 28 : 80;
    if (!bounds.isEmpty()) map.current.setBounds(bounds, pad, pad, pad, pad);
  }, [ready, origin, dest, stations, selectedStationId, onSelectStation, routes, selectedMode, accidents, nearAccidentIds, showStations, showAccidents, layoutTick]);

  return <div ref={box} className="h-full w-full" />;
}

/* ───────────── 키가 없거나 SDK 로드 실패 시 쓰는 SVG 미리보기 지도 ───────────── */
function FallbackMap({ origin, dest, stations, selectedStationId, onSelectStation, routes, selectedMode, accidents, nearAccidentIds, showStations, showAccidents, reason }: MapViewProps & { reason: string }) {
  // 보이는 모든 지점에 맞춰 영역 계산
  const pts: LatLng[] = [...(origin ? [origin] : []), ...(dest ? [dest] : []), ...routes.flatMap((r) => r.path), ...(routes.length ? [] : stations)];
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const pad = 0.006;
  const B = pts.length
    ? { minLat: Math.min(...lats) - pad, maxLat: Math.max(...lats) + pad, minLng: Math.min(...lngs) - pad, maxLng: Math.max(...lngs) + pad }
    : { minLat: 37.48, maxLat: 37.59, minLng: 126.915, maxLng: 127.09 };
  const W = 1000, H = 800;
  const proj = (p: LatLng) => ({
    x: ((p.lng - B.minLng) / (B.maxLng - B.minLng)) * W,
    y: ((B.maxLat - p.lat) / (B.maxLat - B.minLat)) * H,
  });
  const O = origin && proj(origin);
  const D = dest && proj(dest);
  return (
    <div className="relative h-full w-full overflow-hidden bg-sky-50">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="h-full w-full">
        <rect width={W} height={H} fill="#eef2e6" />
        {[...Array(9)].map((_, i) => <line key={`h${i}`} x1="0" x2={W} y1={i * 100} y2={i * 100} stroke="#d9dfd0" />)}
        {[...Array(11)].map((_, i) => <line key={`v${i}`} y1="0" y2={H} x1={i * 100} x2={i * 100} stroke="#d9dfd0" />)}
        {showAccidents && accidents.map((a) => {
          const q = proj(a);
          if (q.x < -20 || q.x > W + 20 || q.y < -20 || q.y > H + 20) return null;
          const near = nearAccidentIds.has(a.id);
          return <circle key={a.id} cx={q.x} cy={q.y} r={near ? 16 : 9} fill="#dc2626" fillOpacity={near ? 0.5 : 0.25} stroke="#dc2626" strokeWidth={near ? 3 : 1} />;
        })}
        {[...routes].sort((a, b) => Number(a.mode === selectedMode) - Number(b.mode === selectedMode)).map((r) => {
          const sel = r.mode === selectedMode;
          return (
            <polyline key={r.mode} points={r.path.map((p) => { const q = proj(p); return `${q.x},${q.y}`; }).join(" ")}
              fill="none" stroke={ROUTE_COLOR[r.mode]} strokeWidth={sel ? 8 : 4} strokeOpacity={sel ? 0.95 : 0.45}
              strokeDasharray={sel ? undefined : "12 8"} strokeLinecap="round" strokeLinejoin="round" />
          );
        })}
        {showStations && stations.map((s) => {
          const q = proj(s);
          const sel = s.id === selectedStationId;
          return (
            <g key={s.id} onClick={() => onSelectStation(s.id)} style={{ cursor: "pointer" }}>
              <circle cx={q.x} cy={q.y} r="15" fill={stationColor(s)} stroke={sel ? "#111" : "#fff"} strokeWidth={sel ? 4 : 3} />
              <text x={q.x} y={q.y + 5} textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">{s.bikes}</text>
            </g>
          );
        })}
        {O && <g><circle cx={O.x} cy={O.y} r="17" fill="#2563eb" stroke="#fff" strokeWidth="4" /><text x={O.x} y={O.y + 6} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff">출</text></g>}
        {D && <g><circle cx={D.x} cy={D.y} r="17" fill="#dc2626" stroke="#fff" strokeWidth="4" /><text x={D.x} y={D.y + 6} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff">도</text></g>}
      </svg>
      <div className="absolute left-3 top-3 max-w-xs rounded-lg bg-white/95 p-3 text-xs text-zinc-700 shadow">
        <p className="font-semibold text-zinc-900">미리보기 지도 (카카오맵 미연결)</p>
        <p className="mt-1">{reason}</p>
        <p className="mt-1">표시되는 대여소·경로·사고다발지역은 실제 API 데이터입니다.</p>
      </div>
    </div>
  );
}

export default function MapView(props: MapViewProps) {
  const [error, setError] = useState<string | null>(null);
  const useKakao = !!KAKAO_KEY && !error;
  return useKakao ? (
    <KakaoMap {...props} appKey={KAKAO_KEY} onError={setError} />
  ) : (
    <FallbackMap {...props} reason={error ?? "NEXT_PUBLIC_KAKAO_JS_KEY 가 설정되지 않았습니다."} />
  );
}
