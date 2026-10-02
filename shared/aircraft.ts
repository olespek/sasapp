// Flykatalog for static display med forenklede siluetter i riktig målestokk.
//
// Hver siluett beskrives i et lokalt koordinatsystem der s er avstanden bakover
// fra nesen og w er avstanden ut fra senterlinjen, begge i meter. Skroget er en
// liste med stasjoner [s, halv bredde]; vinger og haleplan er flater som festes
// til skroget. Mål er hentet fra offentlige data og avrundet. For helikoptre
// tegnes rotordisken i tillegg, siden den bestemmer hvor mye plass flyet trenger.

import { offset } from './geo.js';
import type { Position } from './types.js';

/** Trapesformet flate (vinge/haleplan), speilet på begge sider. */
interface TrapezoidSurface {
  le: number; // s for forkant ved roten
  root: number; // kordelengde ved roten
  tip: number; // kordelengde ved tippen
  halfSpan: number; // fra senterlinjen til tippen
  sweep: number; // hvor langt bak tippens forkant ligger i forhold til rotens forkant
}

/** Flate gitt som punkter [w, s] fra forkant ved roten, ut til tippen og tilbake til bakkant ved roten. */
interface PointsSurface {
  points: [number, number][];
}

type Surface = TrapezoidSurface | PointsSurface;

export interface AircraftSpec {
  id: string;
  name: string;
  category: string;
  /** Totallengde i meter (inkl. rotor for helikopter). */
  length: number;
  /** Vingespenn eller rotordiameter i meter. */
  span: number;
  height: number;
  stations: [number, number][];
  surfaces: Surface[];
  rotor?: { s: number; diameter: number };
}

function ellipticWing(le: number, rootChord: number, halfSpan: number, rootHalfWidth: number, steps = 10): PointsSurface {
  const lead: [number, number][] = [];
  const trail: [number, number][] = [];
  const quarter = le + rootChord / 4;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = rootHalfWidth + (halfSpan - rootHalfWidth) * Math.sin((t * Math.PI) / 2);
    const chord = Math.max(rootChord * Math.sqrt(Math.max(0, 1 - (w / halfSpan) ** 2)), 0.15);
    lead.push([w, quarter - chord / 4]);
    trail.push([w, quarter + (chord * 3) / 4]);
  }
  return { points: [...lead, ...trail.reverse()] };
}

export const AIRCRAFT: AircraftSpec[] = [
  {
    id: 'f35a',
    name: 'Lockheed Martin F-35A Lightning II',
    category: 'Jagerfly',
    length: 15.7,
    span: 10.7,
    height: 4.4,
    stations: [[0, 0], [1, 0.35], [2.5, 0.75], [4.5, 1.3], [6, 1.6], [13.5, 1.4], [15.7, 0.6]],
    surfaces: [
      { le: 6.3, root: 5.6, tip: 1.7, halfSpan: 5.35, sweep: 3.0 },
      { le: 12.0, root: 3.2, tip: 1.2, halfSpan: 3.35, sweep: 1.6 },
    ],
  },
  {
    id: 'f16',
    name: 'General Dynamics F-16 Fighting Falcon',
    category: 'Jagerfly',
    length: 15.06,
    span: 9.96,
    height: 4.9,
    stations: [[0, 0], [1.5, 0.4], [3, 0.65], [4.5, 0.85], [6.2, 1.3], [12.5, 1.0], [15.06, 0.45]],
    surfaces: [
      { le: 6.2, root: 4.9, tip: 1.0, halfSpan: 4.98, sweep: 3.4 },
      { le: 11.6, root: 2.9, tip: 0.9, halfSpan: 2.78, sweep: 1.7 },
    ],
  },
  {
    id: 'c130j',
    name: 'Lockheed Martin C-130J Hercules',
    category: 'Transportfly',
    length: 29.79,
    span: 40.41,
    height: 11.84,
    stations: [[0, 0], [1, 1.2], [2.5, 1.9], [4.5, 2.15], [19, 2.15], [25, 1.4], [29.79, 0.4]],
    surfaces: [
      { le: 10.8, root: 4.9, tip: 2.4, halfSpan: 20.2, sweep: 0.8 },
      { le: 24.8, root: 3.6, tip: 1.6, halfSpan: 8.1, sweep: 1.6 },
    ],
  },
  {
    id: 'p8a',
    name: 'Boeing P-8A Poseidon',
    category: 'Maritimt patruljefly',
    length: 39.47,
    span: 37.64,
    height: 12.83,
    stations: [[0, 0], [1.5, 1.2], [4, 1.88], [28, 1.88], [35, 1.0], [39.47, 0.3]],
    surfaces: [
      { le: 14.6, root: 7.6, tip: 1.6, halfSpan: 18.82, sweep: 8.6 },
      { le: 33.0, root: 4.6, tip: 1.4, halfSpan: 7.2, sweep: 4.2 },
    ],
  },
  {
    id: 'nh90',
    name: 'NHIndustries NH90',
    category: 'Helikopter',
    length: 19.56,
    span: 16.3,
    height: 5.23,
    stations: [[0, 0], [0.8, 0.9], [2, 1.6], [8.5, 1.7], [9.5, 0.5], [15.5, 0.35], [16.13, 0.3]],
    surfaces: [{ le: 13.6, root: 1.0, tip: 0.8, halfSpan: 1.6, sweep: 0.2 }],
    rotor: { s: 5.6, diameter: 16.3 },
  },
  {
    id: 'bell412',
    name: 'Bell 412',
    category: 'Helikopter',
    length: 17.1,
    span: 14.02,
    height: 4.6,
    stations: [[0, 0], [0.8, 0.8], [2, 1.4], [5.5, 1.4], [6.5, 0.4], [12.5, 0.25], [12.92, 0.25]],
    surfaces: [{ le: 9.4, root: 0.8, tip: 0.6, halfSpan: 1.45, sweep: 0.1 }],
    rotor: { s: 3.9, diameter: 14.02 },
  },
  {
    id: 'spitfire',
    name: 'Supermarine Spitfire',
    category: 'Veteranfly',
    length: 9.47,
    span: 11.23,
    height: 3.86,
    stations: [[0, 0], [0.4, 0.35], [1.5, 0.5], [3.5, 0.55], [7.5, 0.3], [9.47, 0.15]],
    surfaces: [
      ellipticWing(2.2, 2.5, 5.615, 0.52),
      { le: 8.1, root: 1.1, tip: 0.5, halfSpan: 1.6, sweep: 0.3 },
    ],
  },
  {
    id: 'dc3',
    name: 'Douglas DC-3 / C-47 Dakota',
    category: 'Veteranfly',
    length: 19.66,
    span: 28.96,
    height: 5.16,
    stations: [[0, 0], [0.6, 0.7], [2, 1.2], [4, 1.35], [12, 1.3], [17, 0.6], [19.66, 0.2]],
    surfaces: [
      { le: 6.0, root: 4.4, tip: 1.7, halfSpan: 14.48, sweep: 2.1 },
      { le: 16.6, root: 2.4, tip: 1.0, halfSpan: 4.3, sweep: 1.0 },
    ],
  },
  {
    id: 'saab105',
    name: 'Saab 105',
    category: 'Skolefly',
    length: 10.8,
    span: 9.5,
    height: 2.7,
    stations: [[0, 0], [0.8, 0.55], [2, 0.8], [6, 0.8], [9, 0.45], [10.8, 0.3]],
    surfaces: [
      { le: 4.0, root: 2.6, tip: 1.2, halfSpan: 4.75, sweep: 0.8 },
      { le: 8.9, root: 1.4, tip: 0.7, halfSpan: 1.8, sweep: 0.8 },
    ],
  },
  {
    id: 'vampire',
    name: 'de Havilland Vampire',
    category: 'Veteranfly',
    length: 9.37,
    span: 11.58,
    height: 1.88,
    // Forenklet: halebommene er slått sammen til ett smalt skrog.
    stations: [[0, 0], [0.5, 0.5], [2, 0.7], [5.5, 0.7], [6, 0.3], [9.37, 0.3]],
    surfaces: [
      { le: 2.4, root: 3.0, tip: 1.3, halfSpan: 5.79, sweep: 0.8 },
      { le: 8.4, root: 0.97, tip: 0.97, halfSpan: 1.7, sweep: 0 },
    ],
  },
];

const BY_ID = new Map(AIRCRAFT.map((a) => [a.id, a]));

export function getAircraft(id: string | undefined): AircraftSpec | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Skrogets lengde (uten rotor). Midtpunktet til flyet ligger midt på denne. */
export function bodyLength(spec: AircraftSpec): number {
  return spec.stations[spec.stations.length - 1][0];
}

function halfWidthAt(stations: [number, number][], s: number): number {
  if (s <= stations[0][0]) return stations[0][1];
  for (let i = 1; i < stations.length; i++) {
    const [s1, w1] = stations[i];
    if (s <= s1) {
      const [s0, w0] = stations[i - 1];
      return w0 + ((w1 - w0) * (s - s0)) / (s1 - s0 || 1);
    }
  }
  return stations[stations.length - 1][1];
}

function surfacePoints(stations: [number, number][], surf: Surface): { le: number; te: number; pts: [number, number][] } {
  if ('points' in surf) {
    const pts = surf.points;
    return { le: pts[0][1], te: pts[pts.length - 1][1], pts };
  }
  const te = surf.le + surf.root;
  return {
    le: surf.le,
    te,
    pts: [
      [halfWidthAt(stations, surf.le), surf.le],
      [surf.halfSpan, surf.le + surf.sweep],
      [surf.halfSpan, surf.le + surf.sweep + surf.tip],
      [halfWidthAt(stations, te), te],
    ],
  };
}

/** Høyre halvdel av omrisset, fra nesen til halen, som [w, s]. */
export function halfOutline(spec: AircraftSpec): [number, number][] {
  const surfaces = spec.surfaces.map((s) => surfacePoints(spec.stations, s)).sort((a, b) => a.le - b.le);
  const out: [number, number][] = [];
  let si = 0;
  for (const [s, w] of spec.stations) {
    while (si < surfaces.length && surfaces[si].le <= s) {
      out.push(...surfaces[si].pts);
      si++;
    }
    const inside = surfaces.some((f) => s > f.le && s < f.te);
    if (!inside) out.push([w, s]);
  }
  while (si < surfaces.length) out.push(...surfaces[si++].pts);
  return out;
}

/** Lokale punkter [w, s] → kartposisjoner, rotert etter kurs og sentrert midt på skroget. */
function place(points: [number, number][], center: Position, heading: number, mid: number): Position[] {
  const h = (heading * Math.PI) / 180;
  const sin = Math.sin(h);
  const cos = Math.cos(h);
  return points.map(([w, s]) => {
    const f = mid - s; // fremover fra midtpunktet
    const east = w * cos + f * sin;
    const north = -w * sin + f * cos;
    return offset(center, east, north);
  });
}

export interface AircraftShapes {
  /** Lukket ring (første punkt gjentas ikke). */
  body: Position[];
  rotor?: Position[];
  /** Punkt rett foran nesen, brukt til rotasjonshåndtak. */
  nose: Position;
}

export function aircraftShapes(spec: AircraftSpec, center: Position, heading: number): AircraftShapes {
  const half = halfOutline(spec);
  const mirrored = half
    .slice()
    .reverse()
    .filter(([w]) => w > 0)
    .map(([w, s]) => [-w, s] as [number, number]);
  const outline = [...half.filter(([w], i) => w > 0 || i === 0 || i === half.length - 1), ...mirrored];
  const mid = bodyLength(spec) / 2;
  const shapes: AircraftShapes = {
    body: place(outline, center, heading, mid),
    nose: place([[0, -Math.max(3, spec.length * 0.12)]], center, heading, mid)[0],
  };
  if (spec.rotor) {
    const r = spec.rotor.diameter / 2;
    const ring: [number, number][] = [];
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      ring.push([Math.cos(a) * r, spec.rotor.s + Math.sin(a) * r]);
    }
    shapes.rotor = place(ring, center, heading, mid);
  }
  return shapes;
}
