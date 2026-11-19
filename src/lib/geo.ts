import type { LatLng } from "./types";

const R_M = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_M * Math.asin(Math.sqrt(h));
}

/** 점 p 에서 선분 a-b 까지의 최단 거리(m). 국지적 평면 근사를 쓴다. */
function pointToSegmentM(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = Math.cos(rad(p.lat)) * (Math.PI / 180) * R_M;
  const ky = (Math.PI / 180) * R_M;
  const ax = (a.lng - p.lng) * kx, ay = (a.lat - p.lat) * ky;
  const bx = (b.lng - p.lng) * kx, by = (b.lat - p.lat) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** 점에서 경로(폴리라인)까지의 최단 거리(m). */
export function distanceToPathM(p: LatLng, path: LatLng[]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return distanceM(p, path[0]);
  let min = Infinity;
  for (let i = 1; i < path.length; i++) {
    min = Math.min(min, pointToSegmentM(p, path[i - 1], path[i]));
  }
  return min;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
}
