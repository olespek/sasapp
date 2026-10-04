// Katalog over objekttyper som kan plasseres i kartet.
// Nye typer legges til her; id-en lagres på objektene og må ikke endres etterpå.

import type { GeometryKind } from './types.js';

export type ObjectKind = GeometryKind | 'aircraft';

export interface ObjectTypeDef {
  id: string;
  label: string;
  kind: ObjectKind;
  group: GroupId;
  color: string;
  /** Navn på Lucide-ikon (https://lucide.dev/icons/) som vises i markører, paletten og listene. */
  icon: string;
  /** Stiplet linje/kant (Leaflet dashArray). */
  dash?: string;
  /** Hvor tett fargen fyller et område (0–1, standard 0,28). */
  fillOpacity?: number;
  /** Linjebredde i kartet (standard 4 for linjer). */
  weight?: number;
  /** For gjerder: lengden på ett element i meter, brukes til å beregne antall elementer. */
  panelLength?: number;
  /** Utgått type: kan ikke legges til, men eksisterende objekter vises fortsatt. */
  retired?: boolean;
}

export type GroupId = 'publikum' | 'gjerde' | 'fastgjerde' | 'sikkerhet' | 'infrastruktur' | 'kommersielt' | 'logistikk' | 'fly';

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'publikum', label: 'Publikum' },
  { id: 'gjerde', label: 'Gjerde' },
  { id: 'fastgjerde', label: 'Fast gjerde' },
  { id: 'sikkerhet', label: 'Sikkerhet og beredskap' },
  { id: 'infrastruktur', label: 'Strøm og infrastruktur' },
  { id: 'kommersielt', label: 'Stander og servering' },
  { id: 'logistikk', label: 'Logistikk' },
  { id: 'fly', label: 'Fly' },
];

export const OBJECT_TYPES: ObjectTypeDef[] = [
  // Publikum
  { id: 'publikumsomrade', label: 'Publikumsområde', kind: 'polygon', group: 'publikum', color: '#2563eb', icon: 'users' },
  { id: 'vip', label: 'VIP-område', kind: 'polygon', group: 'publikum', color: '#ca8a04', icon: 'star' },
  { id: 'tribune', label: 'Spottertribune', kind: 'polygon', group: 'publikum', color: '#1f2937', icon: 'camera', fillOpacity: 0.6 },
  { id: 'inngang', label: 'Inngang', kind: 'point', group: 'publikum', color: '#16a34a', icon: 'log-in' },
  { id: 'utgang', label: 'Utgang', kind: 'point', group: 'publikum', color: '#0d9488', icon: 'log-out', retired: true },
  { id: 'toalett', label: 'Toalett', kind: 'point', group: 'publikum', color: '#0891b2', icon: 'toilet' },
  { id: 'toalettomrade', label: 'Toalettområde', kind: 'polygon', group: 'publikum', color: '#0891b2', icon: 'toilet' },
  { id: 'info', label: 'Informasjon', kind: 'point', group: 'publikum', color: '#2563eb', icon: 'info' },
  { id: 'gangvei', label: 'Gangvei', kind: 'line', group: 'publikum', color: '#64748b', icon: 'footprints', dash: '4 6', retired: true },

  // Gjerde (midlertidige gjerder som settes opp til showet). Id-en «gjerde» er beholdt for høyt gjerde
  // slik at gjerder tegnet før inndelingen fortsatt fungerer.
  { id: 'gjerde', label: 'Høyt gjerde (2000×3500)', kind: 'line', group: 'gjerde', color: '#111827', icon: 'fence', weight: 5, panelLength: 3.5 },
  { id: 'gjerde_lavt', label: 'Lavt gjerde (2000×1100)', kind: 'line', group: 'gjerde', color: '#64748b', icon: 'fence', weight: 4, panelLength: 2 },

  // Fast gjerde (områdegjerder som står der i dag)
  { id: 'fastgjerde', label: 'Fast gjerde', kind: 'line', group: 'fastgjerde', color: '#a16207', icon: 'brick-wall', dash: '2 6', weight: 5 },

  // Sikkerhet og beredskap
  { id: 'sperrebaand', label: 'Sperrebånd', kind: 'line', group: 'sikkerhet', color: '#dc2626', icon: 'construction', dash: '6 6' },
  { id: 'nodutgang', label: 'Nødutgang', kind: 'point', group: 'sikkerhet', color: '#15803d', icon: 'door-open' },
  { id: 'romningsvei', label: 'Rømningsvei', kind: 'line', group: 'sikkerhet', color: '#15803d', icon: 'route', dash: '10 6' },
  { id: 'forstehjelp', label: 'Førstehjelp', kind: 'point', group: 'sikkerhet', color: '#dc2626', icon: 'briefcase-medical' },
  { id: 'brannslukker', label: 'Brannslukker', kind: 'point', group: 'sikkerhet', color: '#b91c1c', icon: 'fire-extinguisher' },
  { id: 'vakt', label: 'Vaktpost', kind: 'point', group: 'sikkerhet', color: '#f59e0b', icon: 'shield' },
  { id: 'sikkerhetssone', label: 'Sikkerhetssone', kind: 'polygon', group: 'sikkerhet', color: '#ef4444', icon: 'triangle-alert', dash: '8 6' },
  { id: 'samleplass', label: 'Samleplass', kind: 'polygon', group: 'sikkerhet', color: '#22c55e', icon: 'flag' },
  { id: 'utrykningsvei', label: 'Utrykningsvei', kind: 'line', group: 'sikkerhet', color: '#e11d48', icon: 'ambulance', dash: '12 6' },

  // Strøm og infrastruktur
  { id: 'aggregat', label: 'Strømaggregat', kind: 'point', group: 'infrastruktur', color: '#eab308', icon: 'zap' },
  { id: 'stromskap', label: 'Strømskap/fordeling', kind: 'point', group: 'infrastruktur', color: '#facc15', icon: 'plug-zap' },
  { id: 'stromkabel', label: 'Strømkabel', kind: 'line', group: 'infrastruktur', color: '#eab308', icon: 'cable', dash: '2 5' },
  { id: 'vannpost', label: 'Vannpost', kind: 'point', group: 'infrastruktur', color: '#0284c7', icon: 'droplet' },
  { id: 'vannledning', label: 'Vannledning', kind: 'line', group: 'infrastruktur', color: '#0284c7', icon: 'waves', dash: '2 5' },
  { id: 'avfall', label: 'Avfall/container', kind: 'point', group: 'infrastruktur', color: '#78716c', icon: 'trash-2' },
  { id: 'lys', label: 'Lysmast', kind: 'point', group: 'infrastruktur', color: '#fde047', icon: 'lightbulb' },

  // Stander og servering
  { id: 'expo', label: 'Expo', kind: 'polygon', group: 'kommersielt', color: '#c026d3', icon: 'tag' },
  { id: 'stand', label: 'Stand', kind: 'polygon', group: 'kommersielt', color: '#a21caf', icon: 'store' },
  { id: 'mat', label: 'Mat og drikke', kind: 'polygon', group: 'kommersielt', color: '#ea580c', icon: 'utensils' },
  { id: 'kiosk', label: 'Kiosk/foodtruck', kind: 'point', group: 'kommersielt', color: '#ea580c', icon: 'ice-cream-cone' },
  { id: 'scene', label: 'Scene', kind: 'polygon', group: 'kommersielt', color: '#7c3aed', icon: 'mic-vocal' },
  { id: 'hoyttaler', label: 'Høyttaler', kind: 'point', group: 'kommersielt', color: '#7c3aed', icon: 'speaker' },

  // Logistikk
  { id: 'parkering', label: 'Bilparkering', kind: 'polygon', group: 'logistikk', color: '#0b5fd6', icon: 'car' },
  { id: 'hcparkering', label: 'HC-parkering', kind: 'polygon', group: 'logistikk', color: '#1e3a8a', icon: 'accessibility' },
  { id: 'lager', label: 'Lager/rigg', kind: 'polygon', group: 'logistikk', color: '#92400e', icon: 'package' },
  { id: 'kjorevei', label: 'Kjørevei', kind: 'line', group: 'logistikk', color: '#334155', icon: 'truck', dash: '14 8', retired: true },
  { id: 'port', label: 'Port/kjøreport', kind: 'point', group: 'logistikk', color: '#334155', icon: 'door-closed' },
  { id: 'telt', label: 'Telt', kind: 'polygon', group: 'logistikk', color: '#b45309', icon: 'tent' },

  // Fly
  { id: 'fly', label: 'Fly (static display)', kind: 'aircraft', group: 'fly', color: '#1e3a8a', icon: 'plane' },
  { id: 'displayline', label: 'Display line', kind: 'line', group: 'fly', color: '#ef3b3b', icon: 'plane-takeoff', dash: '16 6 2 6', weight: 3 },
  { id: 'flyparkering', label: 'Flyparkering', kind: 'polygon', group: 'fly', color: '#1d4ed8', icon: 'plane-landing', dash: '6 4' },
  { id: 'displayomrade', label: 'Static display-område', kind: 'polygon', group: 'fly', color: '#1e40af', icon: 'plane' },
];

const BY_ID = new Map(OBJECT_TYPES.map((t) => [t.id, t]));

export function getObjectType(id: string): ObjectTypeDef | undefined {
  return BY_ID.get(id);
}

/** Typer som kan legges til (utgåtte typer er tatt ut). */
export const ACTIVE_TYPES = OBJECT_TYPES.filter((t) => !t.retired);

/** Antall gjerdeelementer som trengs for en gitt lengde, eller null om typen ikke har elementlengde. */
export function panelCount(def: ObjectTypeDef | undefined, length: number): number | null {
  if (!def?.panelLength || length <= 0) return null;
  return Math.ceil(length / def.panelLength - 1e-9);
}

/** Geometritypen som hører til en objekttype. Fly lagres som punkt (midtpunkt). */
export function geometryTypeFor(kind: ObjectKind): 'Point' | 'LineString' | 'Polygon' {
  if (kind === 'line') return 'LineString';
  if (kind === 'polygon') return 'Polygon';
  return 'Point';
}
