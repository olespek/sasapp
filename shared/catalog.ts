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
  /** Kort symbol som vises i punktmarkører og i paletten. */
  icon: string;
  /** Stiplet linje/kant (Leaflet dashArray). */
  dash?: string;
}

export type GroupId = 'publikum' | 'sikkerhet' | 'infrastruktur' | 'kommersielt' | 'logistikk' | 'fly';

export const GROUPS: { id: GroupId; label: string }[] = [
  { id: 'publikum', label: 'Publikum' },
  { id: 'sikkerhet', label: 'Sikkerhet og beredskap' },
  { id: 'infrastruktur', label: 'Strøm og infrastruktur' },
  { id: 'kommersielt', label: 'Stander og servering' },
  { id: 'logistikk', label: 'Logistikk' },
  { id: 'fly', label: 'Fly' },
];

export const OBJECT_TYPES: ObjectTypeDef[] = [
  // Publikum
  { id: 'publikumsomrade', label: 'Publikumsområde', kind: 'polygon', group: 'publikum', color: '#2563eb', icon: '👥' },
  { id: 'vip', label: 'VIP-område', kind: 'polygon', group: 'publikum', color: '#ca8a04', icon: '⭐' },
  { id: 'tribune', label: 'Tribune', kind: 'polygon', group: 'publikum', color: '#4f46e5', icon: '🪑' },
  { id: 'inngang', label: 'Inngang', kind: 'point', group: 'publikum', color: '#16a34a', icon: '➜' },
  { id: 'utgang', label: 'Utgang', kind: 'point', group: 'publikum', color: '#0d9488', icon: '⇠' },
  { id: 'toalett', label: 'Toalett', kind: 'point', group: 'publikum', color: '#0891b2', icon: 'WC' },
  { id: 'toalettomrade', label: 'Toalettområde', kind: 'polygon', group: 'publikum', color: '#0891b2', icon: 'WC' },
  { id: 'info', label: 'Informasjon', kind: 'point', group: 'publikum', color: '#2563eb', icon: 'i' },
  { id: 'gangvei', label: 'Gangvei', kind: 'line', group: 'publikum', color: '#64748b', icon: '┄', dash: '4 6' },

  // Sikkerhet og beredskap
  { id: 'gjerde', label: 'Gjerde', kind: 'line', group: 'sikkerhet', color: '#111827', icon: '┼' },
  { id: 'sperrebaand', label: 'Sperrebånd', kind: 'line', group: 'sikkerhet', color: '#dc2626', icon: '⋯', dash: '6 6' },
  { id: 'nodutgang', label: 'Nødutgang', kind: 'point', group: 'sikkerhet', color: '#15803d', icon: '🚪' },
  { id: 'romningsvei', label: 'Rømningsvei', kind: 'line', group: 'sikkerhet', color: '#15803d', icon: '⇢', dash: '10 6' },
  { id: 'forstehjelp', label: 'Førstehjelp', kind: 'point', group: 'sikkerhet', color: '#dc2626', icon: '✚' },
  { id: 'brannslukker', label: 'Brannslukker', kind: 'point', group: 'sikkerhet', color: '#b91c1c', icon: '🧯' },
  { id: 'vakt', label: 'Vaktpost', kind: 'point', group: 'sikkerhet', color: '#f59e0b', icon: '👮' },
  { id: 'sikkerhetssone', label: 'Sikkerhetssone', kind: 'polygon', group: 'sikkerhet', color: '#ef4444', icon: '⚠', dash: '8 6' },
  { id: 'samleplass', label: 'Samleplass', kind: 'polygon', group: 'sikkerhet', color: '#22c55e', icon: '⊕' },
  { id: 'utrykningsvei', label: 'Utrykningsvei', kind: 'line', group: 'sikkerhet', color: '#e11d48', icon: '🚑', dash: '12 6' },

  // Strøm og infrastruktur
  { id: 'aggregat', label: 'Strømaggregat', kind: 'point', group: 'infrastruktur', color: '#eab308', icon: '⚡' },
  { id: 'stromskap', label: 'Strømskap/fordeling', kind: 'point', group: 'infrastruktur', color: '#facc15', icon: '🔌' },
  { id: 'stromkabel', label: 'Strømkabel', kind: 'line', group: 'infrastruktur', color: '#eab308', icon: '〰', dash: '2 5' },
  { id: 'vannpost', label: 'Vannpost', kind: 'point', group: 'infrastruktur', color: '#0284c7', icon: '💧' },
  { id: 'vannledning', label: 'Vannledning', kind: 'line', group: 'infrastruktur', color: '#0284c7', icon: '〰', dash: '2 5' },
  { id: 'avfall', label: 'Avfall/container', kind: 'point', group: 'infrastruktur', color: '#78716c', icon: '🗑' },
  { id: 'lys', label: 'Lysmast', kind: 'point', group: 'infrastruktur', color: '#fde047', icon: '💡' },

  // Stander og servering
  { id: 'expo', label: 'Expo-/standområde', kind: 'polygon', group: 'kommersielt', color: '#c026d3', icon: '🏷' },
  { id: 'stand', label: 'Stand', kind: 'polygon', group: 'kommersielt', color: '#a21caf', icon: '▣' },
  { id: 'mat', label: 'Mat og drikke', kind: 'polygon', group: 'kommersielt', color: '#ea580c', icon: '🍔' },
  { id: 'kiosk', label: 'Kiosk/foodtruck', kind: 'point', group: 'kommersielt', color: '#ea580c', icon: '🍦' },
  { id: 'scene', label: 'Scene', kind: 'polygon', group: 'kommersielt', color: '#7c3aed', icon: '🎤' },
  { id: 'hoyttaler', label: 'Høyttaler', kind: 'point', group: 'kommersielt', color: '#7c3aed', icon: '🔊' },

  // Logistikk
  { id: 'parkering', label: 'Parkering', kind: 'polygon', group: 'logistikk', color: '#475569', icon: 'P' },
  { id: 'lager', label: 'Lager/rigg', kind: 'polygon', group: 'logistikk', color: '#92400e', icon: '📦' },
  { id: 'kjorevei', label: 'Kjørevei', kind: 'line', group: 'logistikk', color: '#334155', icon: '═', dash: '14 8' },
  { id: 'port', label: 'Port/kjøreport', kind: 'point', group: 'logistikk', color: '#334155', icon: '⛩' },
  { id: 'telt', label: 'Telt', kind: 'polygon', group: 'logistikk', color: '#b45309', icon: '⛺' },

  // Fly
  { id: 'fly', label: 'Fly (static display)', kind: 'aircraft', group: 'fly', color: '#1e3a8a', icon: '✈' },
  { id: 'flyparkering', label: 'Flyparkering', kind: 'polygon', group: 'fly', color: '#1d4ed8', icon: '🛬', dash: '6 4' },
  { id: 'displayomrade', label: 'Static display-område', kind: 'polygon', group: 'fly', color: '#1e40af', icon: '✈' },
];

const BY_ID = new Map(OBJECT_TYPES.map((t) => [t.id, t]));

export function getObjectType(id: string): ObjectTypeDef | undefined {
  return BY_ID.get(id);
}

/** Geometritypen som hører til en objekttype. Fly lagres som punkt (midtpunkt). */
export function geometryTypeFor(kind: ObjectKind): 'Point' | 'LineString' | 'Polygon' {
  if (kind === 'line') return 'LineString';
  if (kind === 'polygon') return 'Polygon';
  return 'Point';
}
