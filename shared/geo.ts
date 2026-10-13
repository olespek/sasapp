// Enkle geodetiske beregninger. Nøyaktig nok (cm-nivå) for avstander på en flyplass.

import type { Geometry, Position } from './types.js';

const EARTH_RADIUS = 6378137; // meter (WGS84, samme som Leaflet)
const RAD = Math.PI / 180;

/** Avstand i meter mellom to [lng, lat]-posisjoner. */
export function distance(a: Position, b: Position): number {
  const dLat = (b[1] - a[1]) * RAD;
  const dLng = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLength(coords: Position[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) sum += distance(coords[i - 1], coords[i]);
  return sum;
}

/** Areal i m² av en lukket ring (sfærisk tilnærming, som Leaflet.GeometryUtil.geodesicArea). */
export function ringArea(ring: Position[]): number {
  const n = ring.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p1 = ring[i];
    const p2 = ring[(i + 1) % n];
    area += (p2[0] - p1[0]) * RAD * (2 + Math.sin(p1[1] * RAD) + Math.sin(p2[1] * RAD));
  }
  return Math.abs((area * EARTH_RADIUS * EARTH_RADIUS) / 2);
}

export function polygonArea(rings: Position[][]): number {
  if (rings.length === 0) return 0;
  let a = ringArea(rings[0]);
  for (let i = 1; i < rings.length; i++) a -= ringArea(rings[i]);
  return Math.max(0, a);
}

export interface Measure {
  length?: number; // meter
  area?: number; // m²
}

export function measure(g: Geometry): Measure {
  if (g.type === 'LineString') return { length: lineLength(g.coordinates) };
  if (g.type === 'Polygon') return { area: polygonArea(g.coordinates), length: lineLength(g.coordinates[0] ?? []) };
  return {};
}

/** Flytter en posisjon et antall meter øst og nord. */
export function offset(origin: Position, east: number, north: number): Position {
  const lat = origin[1] + (north / EARTH_RADIUS) / RAD;
  const lng = origin[0] + (east / (EARTH_RADIUS * Math.cos(origin[1] * RAD))) / RAD;
  return [lng, lat];
}

/** Meter øst/nord fra origin til p (lokal flat tilnærming). */
export function toLocal(origin: Position, p: Position): { east: number; north: number } {
  return {
    east: (p[0] - origin[0]) * RAD * EARTH_RADIUS * Math.cos(origin[1] * RAD),
    north: (p[1] - origin[1]) * RAD * EARTH_RADIUS,
  };
}

/** Kompassretning (0–360, 0 = nord) fra a til b. */
export function bearing(a: Position, b: Position): number {
  const { east, north } = toLocal(a, b);
  return normalizeHeading(Math.atan2(east, north) / RAD);
}

export function normalizeHeading(h: number): number {
  const r = h % 360;
  return r < 0 ? r + 360 : r;
}

export function formatLength(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

export function formatArea(m2: number): string {
  const m = `${Math.round(m2).toLocaleString('nb-NO')} m²`;
  return m2 >= 1000 ? `${m} (${(m2 / 1000).toFixed(1).replace('.', ',')} daa)` : m;
}

/**
 * Låser retningen fra `prev` mot `cursor` til nærmeste multiplum av `step` grader.
 * Med `before` (punktet før `prev`) regnes vinkelen relativt til forrige linjestykke, slik at man
 * får rette (90°) eller 45°-hjørner uansett hvordan figuren ligger. Uten regnes den fra nord.
 * Lengden blir cursorens projeksjon på den låste retningen.
 */
export function constrainAngle(before: Position | null, prev: Position, cursor: Position, step = 45): Position {
  const v = toLocal(prev, cursor);
  const len = Math.hypot(v.east, v.north);
  if (len === 0) return prev;
  const base = before ? bearing(before, prev) : 0;
  const angle = Math.atan2(v.east, v.north) / RAD;
  const snapped = base + Math.round((angle - base) / step) * step;
  const dist = Math.max(0, len * Math.cos((angle - snapped) * RAD));
  return offset(prev, dist * Math.sin(snapped * RAD), dist * Math.cos(snapped * RAD));
}

// ---------- Linjer: avstand og parallell forskyvning ----------

interface XY {
  x: number; // øst, meter
  y: number; // nord, meter
}

const toXY = (origin: Position, p: Position): XY => {
  const l = toLocal(origin, p);
  return { x: l.east, y: l.north };
};
const fromXY = (origin: Position, v: XY): Position => offset(origin, v.x, v.y);

export interface NearestOnLine {
  /** Korteste avstand i meter fra punktet til linjen. */
  distance: number;
  /** Nærmeste punkt på linjen. */
  point: Position;
  /** Hvilket linjestykke (indeks i koordinatlisten) som er nærmest. */
  segment: number;
  /** 1 hvis punktet ligger til venstre for linjen i tegneretningen, -1 til høyre. */
  side: 1 | -1;
}

/** Nærmeste punkt på en linje (polyline) fra et punkt. */
export function nearestOnLine(p: Position, coords: Position[]): NearestOnLine | null {
  if (coords.length < 2) return null;
  const origin = coords[0];
  const q = toXY(origin, p);
  let best: NearestOnLine | null = null;
  for (let i = 1; i < coords.length; i++) {
    const a = toXY(origin, coords[i - 1]);
    const b = toXY(origin, coords[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
    const c = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(q.x - c.x, q.y - c.y);
    if (!best || d < best.distance) {
      const cross = dx * (q.y - a.y) - dy * (q.x - a.x);
      best = { distance: d, point: fromXY(origin, c), segment: i - 1, side: cross >= 0 ? 1 : -1 };
    }
  }
  return best;
}

/**
 * Parallell linje i fast avstand. side 1 = venstre for tegneretningen, -1 = høyre.
 * Knekkpunktene forskyves slik at hvert linjestykke ligger nøyaktig `dist` meter fra originalen.
 */
export function offsetLine(coords: Position[], dist: number, side: 1 | -1): Position[] {
  if (coords.length < 2) return coords.slice();
  const origin = coords[0];
  const pts = coords.map((c) => toXY(origin, c));
  const normals: XY[] = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: (-dy / len) * side, y: (dx / len) * side }); // venstrenormal ganger side
  }
  const out: XY[] = [];
  for (let i = 0; i < pts.length; i++) {
    if (i === 0 || i === pts.length - 1) {
      const n = normals[i === 0 ? 0 : normals.length - 1];
      out.push({ x: pts[i].x + n.x * dist, y: pts[i].y + n.y * dist });
      continue;
    }
    // Gjæringspunkt: summen av normalene, skalert slik at avstanden til begge stykkene blir dist.
    const n1 = normals[i - 1];
    const n2 = normals[i];
    const mx = n1.x + n2.x;
    const my = n1.y + n2.y;
    const dot = mx * n1.x + my * n1.y;
    const scale = dot < 0.1 ? dist / 0.1 : dist / dot; // begrens svært spisse vinkler
    out.push({ x: pts[i].x + mx * scale, y: pts[i].y + my * scale });
  }
  return out.map((v) => fromXY(origin, v));
}

/**
 * Slår sammen to linjer til én ved de nærmeste endepunktene. Ligger endepunktene innen 0,5 m
 * fra hverandre, blir de ett knekkpunkt; ellers kobles de med et rett stykke.
 */
export function mergeLines(a: Position[], b: Position[]): Position[] {
  const rev = (l: Position[]) => l.slice().reverse();
  const options: [Position[], Position[]][] = [
    [a, b],
    [a, rev(b)],
    [rev(a), b],
    [rev(a), rev(b)],
  ];
  let best = options[0];
  let bestD = Infinity;
  for (const [x, y] of options) {
    const d = distance(x[x.length - 1], y[0]);
    if (d < bestD) {
      bestD = d;
      best = [x, y];
    }
  }
  const [first, second] = best;
  // Behold retningen til den første linjen der det er mulig.
  const merged = bestD < 0.5 ? [...first, ...second.slice(1)] : [...first, ...second];
  return first === a || first[0] === a[0] ? merged : rev(merged);
}
