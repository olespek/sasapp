// Flykatalog med siluetter i riktig målestokk.
//
// Hver siluett beskrives i et lokalt koordinatsystem der s er avstanden bakover
// fra nesen og w er avstanden ut fra senterlinjen, begge i meter. Skroget er en
// liste med stasjoner [s, halv bredde]; vinger og haleplan er flater som festes
// til skroget. Mål er hentet fra offentlige data og avrundet. For helikoptre
// tegnes rotordisken i tillegg, siden den bestemmer hvor mye plass flyet trenger.

import { offset } from './geo.js';
import { FULL_OUTLINES, OUTLINES } from './aircraftOutlines.js';
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
  /** Nøyaktig omriss sporet fra tegning (høyre halvdel). Brukes i stedet for stations og surfaces. */
  outline?: [number, number][];
  /** Hele omrisset (ikke speilet) for fly som ikke er symmetriske, f.eks. NH90 med stabilisator på én side. */
  fullOutline?: [number, number][];
  /** Rotordisker (to for tandemrotor som Chinook). */
  rotors?: { s: number; diameter: number }[];
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
    id: 'c130j30',
    name: 'Lockheed Martin C-130J-30 Hercules',
    category: 'Transportfly',
    length: 34.69,
    span: 40.41,
    height: 11.84,
    // Omrisset er sporet fra tegning, se aircraftOutlines.ts.
    stations: [],
    surfaces: [],
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
    rotors: [{ s: 5.5, diameter: 16.3 }],
  },
  {
    id: 'aw101',
    name: 'AgustaWestland AW101',
    category: 'Helikopter',
    length: 22.81,
    span: 18.59,
    height: 6.65,
    // Omrisset (med stabilisator på styrbord side) er sporet fra tegning, se aircraftOutlines.ts.
    stations: [],
    surfaces: [],
    rotors: [{ s: 6.8, diameter: 18.59 }],
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
    rotors: [{ s: 4.1, diameter: 14.02 }],
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
    // Omrisset er sporet fra tegning, se aircraftOutlines.ts.
    stations: [],
    surfaces: [],
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
    // Brukes ikke: omrisset er sporet fra tegning (med åpning mellom halebommene), se aircraftOutlines.ts.
    stations: [[0, 0], [0.5, 0.5], [2, 0.7], [5.5, 0.7], [6, 0.3], [9.37, 0.3]],
    surfaces: [
      { le: 2.4, root: 3.0, tip: 1.3, halfSpan: 5.79, sweep: 0.8 },
      { le: 8.4, root: 0.97, tip: 0.97, halfSpan: 1.7, sweep: 0 },
    ],
  },
  // Jagerfly
  {
    id: 'f35b',
    name: 'Lockheed Martin F-35B Lightning II',
    category: 'Jagerfly',
    length: 15.6,
    span: 10.7,
    height: 4.36,
    stations: [[0, 0], [1, 0.35], [2.5, 0.75], [4.5, 1.3], [6, 1.6], [13.4, 1.4], [15.6, 0.6]],
    surfaces: [
      { le: 6.3, root: 5.6, tip: 1.7, halfSpan: 5.35, sweep: 3.0 },
      { le: 11.9, root: 3.2, tip: 1.2, halfSpan: 3.35, sweep: 1.6 },
    ],
  },
  {
    id: 'fa18c',
    name: 'McDonnell Douglas F/A-18C Hornet',
    category: 'Jagerfly',
    length: 17.07,
    span: 12.31,
    height: 4.66,
    stations: [[0, 0], [2, 0.5], [4, 0.8], [6, 1.0], [7.5, 1.6], [14, 1.5], [17.07, 0.8]],
    surfaces: [
      { le: 8.0, root: 4.6, tip: 1.7, halfSpan: 6.155, sweep: 2.0 },
      { le: 13.6, root: 3.2, tip: 1.2, halfSpan: 3.3, sweep: 1.6 },
    ],
  },
  {
    id: 'typhoon',
    name: 'Eurofighter Typhoon',
    category: 'Jagerfly',
    length: 15.96,
    span: 10.95,
    height: 5.28,
    stations: [[0, 0], [2, 0.45], [4, 0.75], [6, 1.2], [13.5, 1.2], [15.96, 0.6]],
    surfaces: [
      { le: 3.3, root: 1.6, tip: 0.7, halfSpan: 2.0, sweep: 1.0 },
      { le: 6.0, root: 8.0, tip: 1.3, halfSpan: 5.475, sweep: 5.7 },
    ],
  },
  {
    id: 'rafale',
    name: 'Dassault Rafale',
    category: 'Jagerfly',
    length: 15.27,
    span: 10.9,
    height: 5.34,
    stations: [[0, 0], [2, 0.4], [4, 0.7], [5.5, 1.2], [13, 1.1], [15.27, 0.5]],
    surfaces: [
      { le: 4.6, root: 1.6, tip: 0.6, halfSpan: 2.6, sweep: 1.2 },
      { le: 6.5, root: 7.5, tip: 1.5, halfSpan: 5.45, sweep: 4.7 },
    ],
  },
  {
    id: 'gripen',
    name: 'Saab JAS 39 Gripen C',
    category: 'Jagerfly',
    length: 14.1,
    span: 8.4,
    height: 4.5,
    stations: [[0, 0], [2, 0.45], [4, 0.7], [5.5, 1.0], [12.5, 0.9], [14.1, 0.5]],
    surfaces: [
      { le: 3.8, root: 1.8, tip: 0.8, halfSpan: 1.9, sweep: 1.2 },
      { le: 6.0, root: 6.2, tip: 1.4, halfSpan: 4.2, sweep: 3.2 },
    ],
  },
  {
    id: 'mirage2000',
    name: 'Dassault Mirage 2000',
    category: 'Jagerfly',
    length: 14.36,
    span: 9.13,
    height: 5.2,
    stations: [[0, 0], [2, 0.4], [4, 0.7], [5.5, 1.0], [13, 0.9], [14.36, 0.5]],
    surfaces: [{ le: 5.0, root: 8.6, tip: 1.4, halfSpan: 4.565, sweep: 6.2 }],
  },
  {
    id: 'tornado',
    name: 'Panavia Tornado IDS',
    category: 'Jagerfly',
    length: 16.72,
    span: 13.91,
    height: 5.95,
    // Vingene vist utslått (25°), slik flyet står parkert.
    stations: [[0, 0], [2.5, 0.5], [4.5, 0.9], [6, 1.5], [14, 1.4], [16.72, 0.6]],
    surfaces: [
      { le: 6.5, root: 4.5, tip: 1.2, halfSpan: 6.955, sweep: 2.6 },
      { le: 13.3, root: 3.0, tip: 1.0, halfSpan: 3.6, sweep: 2.0 },
    ],
  },
  {
    id: 'f5e',
    name: 'Northrop F-5E Tiger II',
    category: 'Jagerfly',
    length: 14.45,
    span: 8.13,
    height: 4.08,
    stations: [[0, 0], [2, 0.35], [4, 0.55], [6, 0.8], [7, 1.1], [12.5, 0.9], [14.45, 0.45]],
    surfaces: [
      { le: 7.0, root: 3.6, tip: 0.7, halfSpan: 4.065, sweep: 2.0 },
      { le: 12.0, root: 2.1, tip: 0.8, halfSpan: 2.15, sweep: 1.3 },
    ],
  },
  {
    id: 'f4e',
    name: 'McDonnell Douglas F-4E Phantom II',
    category: 'Jagerfly',
    length: 19.2,
    span: 11.7,
    height: 5.0,
    stations: [[0, 0], [2, 0.5], [4, 0.8], [6, 1.0], [7.5, 1.6], [13.5, 1.5], [16, 0.8], [19.2, 0.35]],
    surfaces: [
      { le: 8.0, root: 6.0, tip: 1.5, halfSpan: 5.85, sweep: 3.6 },
      { le: 15.8, root: 2.6, tip: 1.0, halfSpan: 2.7, sweep: 1.8 },
    ],
  },
  {
    id: 'av8b',
    name: 'McDonnell Douglas AV-8B Harrier II',
    category: 'Jagerfly',
    length: 14.12,
    span: 9.25,
    height: 3.55,
    stations: [[0, 0], [2, 0.45], [4, 0.75], [5, 1.4], [9, 1.4], [11, 0.6], [14.12, 0.35]],
    surfaces: [
      { le: 5.6, root: 3.9, tip: 1.2, halfSpan: 4.625, sweep: 1.6 },
      { le: 11.6, root: 1.9, tip: 0.7, halfSpan: 2.1, sweep: 1.4 },
    ],
  },
  // Transport, tank og overvåking
  {
    id: 'c17',
    name: 'Boeing C-17 Globemaster III',
    category: 'Transportfly',
    length: 53.04,
    span: 51.75,
    height: 16.79,
    stations: [[0, 0], [2, 2.2], [6, 3.4], [38, 3.4], [48, 2.2], [53.04, 0.6]],
    surfaces: [
      { le: 19.0, root: 10.0, tip: 3.0, halfSpan: 25.875, sweep: 10.5 },
      { le: 45.5, root: 6.0, tip: 2.5, halfSpan: 9.9, sweep: 5.0 },
    ],
  },
  {
    id: 'a400m',
    name: 'Airbus A400M Atlas',
    category: 'Transportfly',
    length: 45.1,
    span: 42.4,
    height: 14.7,
    stations: [[0, 0], [1.5, 2.0], [5, 2.75], [30, 2.75], [40, 1.6], [45.1, 0.5]],
    surfaces: [
      { le: 17.0, root: 6.5, tip: 2.5, halfSpan: 21.2, sweep: 4.8 },
      { le: 38.5, root: 5.0, tip: 2.2, halfSpan: 9.5, sweep: 3.5 },
    ],
  },
  {
    id: 'c27j',
    name: 'Leonardo C-27J Spartan',
    category: 'Transportfly',
    length: 22.7,
    span: 28.7,
    height: 9.64,
    stations: [[0, 0], [1, 1.2], [3, 1.65], [15, 1.65], [20, 0.9], [22.7, 0.3]],
    surfaces: [
      { le: 8.0, root: 3.0, tip: 1.6, halfSpan: 14.35, sweep: 0.6 },
      { le: 19.4, root: 2.8, tip: 1.2, halfSpan: 5.0, sweep: 1.3 },
    ],
  },
  {
    id: 'a330mrtt',
    name: 'Airbus A330 MRTT',
    category: 'Tankfly',
    length: 58.8,
    span: 60.3,
    height: 17.4,
    stations: [[0, 0], [2.5, 1.8], [7, 2.82], [42, 2.82], [52, 1.5], [58.8, 0.5]],
    surfaces: [
      { le: 20.0, root: 12.0, tip: 2.5, halfSpan: 30.15, sweep: 16.0 },
      { le: 49.0, root: 6.5, tip: 2.2, halfSpan: 9.6, sweep: 6.5 },
    ],
  },
  {
    id: 'kc135',
    name: 'Boeing KC-135 Stratotanker',
    category: 'Tankfly',
    length: 41.53,
    span: 39.88,
    height: 12.7,
    stations: [[0, 0], [2, 1.3], [6, 1.83], [30, 1.83], [37, 1.0], [41.53, 0.4]],
    surfaces: [
      { le: 13.5, root: 8.5, tip: 2.0, halfSpan: 19.94, sweep: 12.6 },
      { le: 34.3, root: 4.6, tip: 1.5, halfSpan: 6.1, sweep: 5.0 },
    ],
  },
  {
    id: 'e3',
    name: 'Boeing E-3 Sentry (AWACS)',
    category: 'Overvåkingsfly',
    length: 46.61,
    span: 44.42,
    height: 12.6,
    stations: [[0, 0], [2, 1.4], [6, 1.88], [34, 1.88], [42, 1.0], [46.61, 0.4]],
    surfaces: [
      { le: 15.5, root: 9.5, tip: 2.2, halfSpan: 22.21, sweep: 14.0 },
      { le: 38.0, root: 5.0, tip: 1.6, halfSpan: 6.85, sweep: 5.5 },
    ],
  },
  {
    id: 'b52h',
    name: 'Boeing B-52H Stratofortress',
    category: 'Bombefly',
    length: 48.5,
    span: 56.4,
    height: 12.4,
    stations: [[0, 0], [2, 1.3], [5, 1.65], [33, 1.6], [44, 0.8], [48.5, 0.4]],
    surfaces: [
      { le: 16.0, root: 11.0, tip: 2.8, halfSpan: 28.2, sweep: 18.5 },
      { le: 40.0, root: 5.5, tip: 2.0, halfSpan: 7.6, sweep: 5.5 },
    ],
  },
  // Helikopter
  {
    id: 'ch47',
    name: 'Boeing CH-47 Chinook',
    category: 'Helikopter',
    length: 30.14,
    span: 18.29,
    height: 5.77,
    stations: [[0, 0], [0.8, 1.1], [2, 1.9], [14.5, 1.9], [15.54, 1.3]],
    surfaces: [],
    rotors: [
      { s: 1.75, diameter: 18.29 },
      { s: 13.6, diameter: 18.29 },
    ],
  },
  {
    id: 'mh60r',
    name: 'Sikorsky MH-60R Seahawk',
    category: 'Helikopter',
    length: 19.75,
    span: 16.36,
    height: 5.18,
    stations: [[0, 0], [0.8, 0.9], [2, 1.2], [6.5, 1.2], [7.5, 0.45], [14, 0.3], [15.26, 0.3]],
    surfaces: [{ le: 13.4, root: 0.9, tip: 0.8, halfSpan: 2.2, sweep: 0 }],
    rotors: [{ s: 5.1, diameter: 16.36 }],
  },
  {
    id: 'uh1h',
    name: 'Bell UH-1H Iroquois (Huey)',
    category: 'Helikopter',
    length: 17.4,
    span: 14.63,
    height: 4.39,
    stations: [[0, 0], [0.8, 0.8], [2, 1.3], [5.2, 1.3], [6.2, 0.4], [12, 0.25], [12.77, 0.25]],
    surfaces: [{ le: 9.4, root: 0.7, tip: 0.6, halfSpan: 1.4, sweep: 0 }],
    rotors: [{ s: 3.9, diameter: 14.63 }],
  },
  // Veteranfly
  {
    id: 'p51d',
    name: 'North American P-51D Mustang',
    category: 'Veteranfly',
    length: 9.83,
    span: 11.28,
    height: 4.08,
    stations: [[0, 0], [0.3, 0.4], [1.5, 0.55], [4, 0.6], [8, 0.3], [9.83, 0.15]],
    surfaces: [
      { le: 2.6, root: 2.6, tip: 1.2, halfSpan: 5.64, sweep: 0.6 },
      { le: 8.6, root: 1.2, tip: 0.6, halfSpan: 2.0, sweep: 0.3 },
    ],
  },
  {
    id: 'f4u',
    name: 'Vought F4U Corsair',
    category: 'Veteranfly',
    length: 10.26,
    span: 12.5,
    height: 4.5,
    stations: [[0, 0], [0.3, 0.6], [1.5, 0.65], [4.5, 0.6], [8.5, 0.3], [10.26, 0.15]],
    surfaces: [
      { le: 2.6, root: 2.8, tip: 1.1, halfSpan: 6.25, sweep: 0.8 },
      { le: 9.1, root: 1.15, tip: 0.6, halfSpan: 2.6, sweep: 0.3 },
    ],
  },
  {
    id: 'bf109g',
    name: 'Messerschmitt Bf 109 G',
    category: 'Veteranfly',
    length: 8.95,
    span: 9.925,
    height: 2.6,
    stations: [[0, 0], [0.3, 0.45], [1.5, 0.5], [3.5, 0.5], [7.5, 0.25], [8.95, 0.1]],
    surfaces: [
      { le: 2.0, root: 2.3, tip: 1.1, halfSpan: 4.9625, sweep: 0.6 },
      { le: 7.9, root: 1.0, tip: 0.6, halfSpan: 1.5, sweep: 0.25 },
    ],
  },
  {
    id: 'me262',
    name: 'Messerschmitt Me 262',
    category: 'Veteranfly',
    length: 10.6,
    span: 12.6,
    height: 3.5,
    stations: [[0, 0], [1, 0.5], [3, 0.7], [6, 0.65], [9.5, 0.3], [10.6, 0.15]],
    surfaces: [
      { le: 3.6, root: 3.0, tip: 1.3, halfSpan: 6.3, sweep: 1.8 },
      { le: 9.3, root: 1.1, tip: 0.6, halfSpan: 1.65, sweep: 0.5 },
    ],
  },
  {
    id: 't6',
    name: 'North American T-6 Texan / Harvard',
    category: 'Veteranfly',
    length: 8.84,
    span: 12.81,
    height: 3.57,
    stations: [[0, 0], [0.3, 0.6], [1.5, 0.65], [4, 0.6], [7.5, 0.25], [8.84, 0.1]],
    surfaces: [
      { le: 2.0, root: 2.6, tip: 1.1, halfSpan: 6.405, sweep: 0.9 },
      { le: 7.6, root: 1.2, tip: 0.6, halfSpan: 2.7, sweep: 0.3 },
    ],
  },
  {
    id: 't33',
    name: 'Lockheed T-33 Shooting Star',
    category: 'Veteranfly',
    length: 11.51,
    span: 11.85,
    height: 3.56,
    stations: [[0, 0], [1, 0.4], [3, 0.65], [6, 0.7], [10, 0.35], [11.51, 0.25]],
    surfaces: [
      { le: 3.8, root: 3.0, tip: 1.4, halfSpan: 5.925, sweep: 0.8 },
      { le: 10.2, root: 1.2, tip: 0.6, halfSpan: 2.4, sweep: 0.3 },
    ],
  },
  {
    id: 'f86',
    name: 'North American F-86 Sabre',
    category: 'Veteranfly',
    length: 11.4,
    span: 11.3,
    height: 4.5,
    stations: [[0, 0], [0.5, 0.5], [2, 0.7], [5, 0.75], [10, 0.4], [11.4, 0.3]],
    surfaces: [
      { le: 3.6, root: 2.9, tip: 1.3, halfSpan: 5.65, sweep: 3.4 },
      { le: 9.4, root: 1.5, tip: 0.6, halfSpan: 2.0, sweep: 1.1 },
    ],
  },
  {
    id: 'cf104',
    name: 'Lockheed CF-104 Starfighter',
    category: 'Veteranfly',
    length: 16.66,
    span: 6.63,
    height: 4.11,
    stations: [[0, 0], [3, 0.5], [6, 0.75], [8, 0.85], [15, 0.75], [16.66, 0.5]],
    surfaces: [
      { le: 8.2, root: 2.9, tip: 1.4, halfSpan: 3.315, sweep: 0.6 },
      { le: 14.0, root: 2.0, tip: 1.0, halfSpan: 1.8, sweep: 0.9 },
    ],
  },
  {
    id: 'a4',
    name: 'Douglas A-4 Skyhawk',
    category: 'Veteranfly',
    length: 12.22,
    span: 8.38,
    height: 4.57,
    stations: [[0, 0], [1.5, 0.4], [3.5, 0.6], [5, 0.75], [10, 0.7], [12.22, 0.35]],
    surfaces: [
      { le: 4.4, root: 4.7, tip: 1.0, halfSpan: 4.19, sweep: 2.6 },
      { le: 10.6, root: 1.4, tip: 0.6, halfSpan: 1.7, sweep: 0.8 },
    ],
  },
  {
    id: 'ov10',
    name: 'North American OV-10 Bronco',
    category: 'Veteranfly',
    length: 12.67,
    span: 12.19,
    height: 4.62,
    // Brukes ikke: omrisset er sporet fra tegning (med åpning mellom halebommene), se aircraftOutlines.ts.
    stations: [[0, 0], [1, 0.5], [3, 0.65], [6, 0.6], [6.5, 0.3], [12.67, 0.3]],
    surfaces: [
      { le: 3.6, root: 2.1, tip: 2.1, halfSpan: 6.095, sweep: 0 },
      { le: 11.4, root: 1.2, tip: 1.2, halfSpan: 2.2, sweep: 0 },
    ],
  },
  {
    id: 'dc6',
    name: 'Douglas DC-6',
    category: 'Veteranfly',
    length: 30.66,
    span: 35.81,
    height: 8.66,
    stations: [[0, 0], [0.8, 0.9], [3, 1.6], [5, 1.65], [20, 1.65], [27, 0.9], [30.66, 0.3]],
    surfaces: [
      { le: 10.0, root: 5.6, tip: 1.8, halfSpan: 17.905, sweep: 2.5 },
      { le: 26.8, root: 3.0, tip: 1.3, halfSpan: 5.8, sweep: 1.0 },
    ],
  },
  {
    id: 'norseman',
    name: 'Noorduyn Norseman',
    category: 'Veteranfly',
    length: 9.86,
    span: 15.75,
    height: 3.07,
    stations: [[0, 0], [0.4, 0.6], [1.5, 0.7], [4, 0.7], [8.5, 0.25], [9.86, 0.1]],
    surfaces: [
      { le: 1.8, root: 2.0, tip: 1.4, halfSpan: 7.875, sweep: 0.3 },
      { le: 8.6, root: 1.2, tip: 0.7, halfSpan: 2.4, sweep: 0.3 },
    ],
  },
  {
    id: 'storch',
    name: 'Fieseler Fi 156 Storch',
    category: 'Veteranfly',
    length: 9.9,
    span: 14.25,
    height: 3.05,
    stations: [[0, 0], [0.3, 0.45], [1.5, 0.55], [3.5, 0.5], [8.5, 0.2], [9.9, 0.1]],
    surfaces: [
      { le: 1.8, root: 2.1, tip: 2.1, halfSpan: 7.125, sweep: 0 },
      { le: 8.9, root: 1.0, tip: 0.6, halfSpan: 2.0, sweep: 0.3 },
    ],
  },
  {
    id: 'tigermoth',
    name: 'de Havilland Tiger Moth',
    category: 'Veteranfly',
    length: 7.29,
    span: 8.94,
    height: 2.68,
    // Toplan sett ovenfra: bare øvre vinge vises.
    stations: [[0, 0], [0.3, 0.4], [1, 0.45], [3, 0.45], [6.5, 0.2], [7.29, 0.1]],
    surfaces: [
      { le: 1.1, root: 1.45, tip: 1.45, halfSpan: 4.47, sweep: 0.4 },
      { le: 6.4, root: 0.8, tip: 0.5, halfSpan: 1.4, sweep: 0.2 },
    ],
  },
  {
    id: 'jungmann',
    name: 'Bücker Bü 131 Jungmann',
    category: 'Veteranfly',
    length: 6.62,
    span: 7.4,
    height: 2.25,
    // Toplan sett ovenfra: bare øvre vinge vises.
    stations: [[0, 0], [0.3, 0.4], [1, 0.42], [3, 0.4], [6, 0.15], [6.62, 0.1]],
    surfaces: [
      { le: 1.0, root: 1.1, tip: 1.1, halfSpan: 3.7, sweep: 0.5 },
      { le: 5.8, root: 0.7, tip: 0.45, halfSpan: 1.1, sweep: 0.2 },
    ],
  },
  {
    id: 'j3cub',
    name: 'Piper J-3 Cub',
    category: 'Veteranfly',
    length: 6.83,
    span: 10.74,
    height: 2.03,
    stations: [[0, 0], [0.3, 0.4], [1.2, 0.4], [3, 0.38], [6, 0.15], [6.83, 0.1]],
    surfaces: [
      { le: 1.0, root: 1.6, tip: 1.6, halfSpan: 5.37, sweep: 0 },
      { le: 6.0, root: 0.75, tip: 0.5, halfSpan: 1.5, sweep: 0.15 },
    ],
  },
  {
    id: 'f5a',
    name: 'Northrop F-5A Freedom Fighter',
    category: 'Veteranfly',
    length: 14.38,
    span: 7.7,
    height: 4.01,
    stations: [[0, 0], [2, 0.35], [4, 0.55], [6.5, 0.75], [7.2, 0.9], [12.5, 0.85], [14.38, 0.45]],
    surfaces: [
      { le: 7.2, root: 3.4, tip: 0.7, halfSpan: 3.85, sweep: 1.9 },
      { le: 12.0, root: 2.0, tip: 0.8, halfSpan: 2.0, sweep: 1.2 },
    ],
  },
  {
    id: 'yak50',
    name: 'Yakovlev Yak-50',
    category: 'Veteranfly',
    length: 7.68,
    span: 9.5,
    height: 3.16,
    stations: [[0, 0], [0.3, 0.55], [1.2, 0.6], [3, 0.5], [6.8, 0.2], [7.68, 0.1]],
    surfaces: [
      { le: 1.4, root: 2.0, tip: 1.2, halfSpan: 4.75, sweep: 0.3 },
      { le: 6.75, root: 0.85, tip: 0.55, halfSpan: 1.6, sweep: 0.2 },
    ],
  },
  {
    id: 'yak52',
    name: 'Yakovlev Yak-52',
    category: 'Skolefly',
    length: 7.745,
    span: 9.3,
    height: 2.7,
    stations: [[0, 0], [0.3, 0.5], [1.2, 0.55], [3.2, 0.5], [6.8, 0.2], [7.745, 0.1]],
    surfaces: [
      { le: 1.6, root: 1.9, tip: 1.2, halfSpan: 4.65, sweep: 0.3 },
      { le: 6.85, root: 0.85, tip: 0.55, halfSpan: 1.6, sweep: 0.2 },
    ],
  },
  {
    id: 'safir',
    name: 'Saab 91 Safir',
    category: 'Skolefly',
    length: 7.95,
    span: 10.6,
    height: 2.2,
    stations: [[0, 0], [0.3, 0.45], [1.3, 0.55], [3.2, 0.5], [7, 0.2], [7.95, 0.1]],
    surfaces: [
      { le: 1.7, root: 1.8, tip: 1.0, halfSpan: 5.3, sweep: 0.4 },
      { le: 7.0, root: 0.9, tip: 0.5, halfSpan: 1.6, sweep: 0.2 },
    ],
  },
  {
    id: 'broussard',
    name: 'Max Holste MH.1521 Broussard',
    category: 'Veteranfly',
    length: 8.65,
    span: 13.75,
    height: 2.79,
    stations: [[0, 0], [0.3, 0.6], [1.5, 0.7], [3.5, 0.65], [7.5, 0.25], [8.65, 0.15]],
    surfaces: [
      { le: 1.8, root: 2.1, tip: 1.4, halfSpan: 6.875, sweep: 0.3 },
      { le: 7.6, root: 1.0, tip: 1.0, halfSpan: 2.2, sweep: 0 },
    ],
  },
  // Småfly (omrissene er sporet fra tegning, se aircraftOutlines.ts)
  {
    id: 'pa18',
    name: 'Piper PA-18 Super Cub',
    category: 'Småfly',
    length: 6.88,
    span: 10.73,
    height: 2.02,
    stations: [],
    surfaces: [],
  },
  {
    id: 'c152',
    name: 'Cessna 152',
    category: 'Småfly',
    length: 7.34,
    span: 10.11,
    height: 2.59,
    stations: [],
    surfaces: [],
  },
  {
    id: 'c172',
    name: 'Cessna 172 Skyhawk',
    category: 'Småfly',
    length: 8.28,
    span: 11.0,
    height: 2.72,
    stations: [],
    surfaces: [],
  },
];

/** Rekkefølgen kategoriene vises i. */
export const AIRCRAFT_CATEGORIES = ['Jagerfly', 'Transportfly', 'Tankfly', 'Overvåkingsfly', 'Maritimt patruljefly', 'Bombefly', 'Helikopter', 'Skolefly', 'Småfly', 'Veteranfly'];

/** Flytypene gruppert etter kategori, i visningsrekkefølge. */
export function aircraftByCategory(): { category: string; aircraft: AircraftSpec[] }[] {
  return AIRCRAFT_CATEGORIES.map((category) => ({ category, aircraft: AIRCRAFT.filter((a) => a.category === category) })).filter((g) => g.aircraft.length > 0);
}

for (const a of AIRCRAFT) {
  if (OUTLINES[a.id]) a.outline = OUTLINES[a.id];
  if (FULL_OUTLINES[a.id]) a.fullOutline = FULL_OUTLINES[a.id];
}

const BY_ID = new Map(AIRCRAFT.map((a) => [a.id, a]));

export function getAircraft(id: string | undefined): AircraftSpec | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Skrogets lengde (uten rotor). Midtpunktet til flyet ligger midt på denne. */
export function bodyLength(spec: AircraftSpec): number {
  const traced = spec.fullOutline ?? spec.outline;
  if (traced) return Math.max(...traced.map(([, s]) => s));
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
  if (spec.outline) return spec.outline;
  const surfaces = spec.surfaces.map((s) => surfacePoints(spec.stations, s)).sort((a, b) => a.le - b.le);
  const out: [number, number][] = [];
  let si = 0;
  for (const [s, w] of spec.stations) {
    while (si < surfaces.length && surfaces[si].le < s) {
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
  rotors?: Position[][];
  /** Punkt rett foran nesen, brukt til rotasjonshåndtak. */
  nose: Position;
}

export function aircraftShapes(spec: AircraftSpec, center: Position, heading: number): AircraftShapes {
  let outline: [number, number][];
  if (spec.fullOutline) outline = spec.fullOutline;
  else {
    const half = halfOutline(spec);
    const mirrored = half
      .slice()
      .reverse()
      .filter(([w]) => w > 0)
      .map(([w, s]) => [-w, s] as [number, number]);
    outline = [...half.filter(([w], i) => w > 0 || i === 0 || i === half.length - 1), ...mirrored];
  }
  const mid = bodyLength(spec) / 2;
  const shapes: AircraftShapes = {
    body: place(outline, center, heading, mid),
    nose: place([[0, -Math.max(3, spec.length * 0.12)]], center, heading, mid)[0],
  };
  if (spec.rotors) {
    shapes.rotors = spec.rotors.map((rotor) => {
      const r = rotor.diameter / 2;
      const ring: [number, number][] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        ring.push([Math.cos(a) * r, rotor.s + Math.sin(a) * r]);
      }
      return place(ring, center, heading, mid);
    });
  }
  return shapes;
}
