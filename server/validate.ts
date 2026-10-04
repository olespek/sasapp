// Validering av data fra klienten.

import { getAircraft } from '../shared/aircraft.js';
import { geometryTypeFor, getObjectType } from '../shared/catalog.js';
import { normalizeHeading } from '../shared/geo.js';
import { STATUSES, defaultProps, type Geometry, type ObjectProps, type Position } from '../shared/types.js';

export class ValidationError extends Error {}

const fail = (msg: string): never => {
  throw new ValidationError(msg);
};

const MAX_POINTS = 5000;

function position(p: unknown): Position {
  if (!Array.isArray(p) || p.length < 2) fail('Ugyldig koordinat');
  const [lng, lat] = p as unknown[];
  if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) fail('Ugyldig koordinat');
  if (Math.abs(lng as number) > 180 || Math.abs(lat as number) > 90) fail('Koordinat utenfor gyldig område');
  return [lng as number, lat as number];
}

function positions(list: unknown, min: number): Position[] {
  if (!Array.isArray(list)) fail('Ugyldig koordinatliste');
  const arr = list as unknown[];
  if (arr.length < min) fail(`Geometrien må ha minst ${min} punkter`);
  if (arr.length > MAX_POINTS) fail('For mange punkter');
  return arr.map(position);
}

export function geometry(g: unknown, expectedType: Geometry['type']): Geometry {
  if (!g || typeof g !== 'object') fail('Geometri mangler');
  const { type, coordinates } = g as { type?: unknown; coordinates?: unknown };
  if (type !== expectedType) fail(`Feil geometritype: forventet ${expectedType}`);
  if (type === 'Point') return { type, coordinates: position(coordinates) };
  if (type === 'LineString') return { type, coordinates: positions(coordinates, 2) };
  if (!Array.isArray(coordinates) || coordinates.length < 1 || coordinates.length > 50) fail('Ugyldig polygon');
  const rings = (coordinates as unknown[]).map((r) => {
    const ring = positions(r, 3);
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
    if (ring.length < 4) fail('Et område må ha minst tre hjørner');
    return ring;
  });
  return { type: 'Polygon', coordinates: rings };
}

function str(v: unknown, max: number, field: string): string {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') fail(`${field} må være tekst`);
  return (v as string).slice(0, max);
}

export function name(v: unknown): string {
  return str(v, 200, 'Navn').trim();
}

export function objectType(v: unknown, opts: { allowRetired?: boolean } = {}) {
  if (typeof v !== 'string') return fail('Objekttype mangler');
  const def = getObjectType(v as string);
  if (!def) fail(`Ukjent objekttype: ${v}`);
  if (def!.retired && !opts.allowRetired) fail(`«${def!.label}» kan ikke lenger legges til`);
  return def!;
}

export function expectedGeometryType(typeId: string): Geometry['type'] {
  return geometryTypeFor(objectType(typeId, { allowRetired: true }).kind);
}

/** Slår sammen eksisterende egenskaper med en (delvis) oppdatering og validerer resultatet. */
export function props(input: unknown, base: ObjectProps = defaultProps(), isAircraft = false): ObjectProps {
  if (input !== undefined && (typeof input !== 'object' || input === null || Array.isArray(input))) fail('Ugyldige egenskaper');
  const p = (input ?? {}) as Record<string, unknown>;
  const out: ObjectProps = { ...base };
  if ('status' in p) {
    if (!STATUSES.includes(p.status as never)) fail('Ugyldig status');
    out.status = p.status as ObjectProps['status'];
  }
  if ('responsible' in p) out.responsible = str(p.responsible, 200, 'Ansvarlig');
  if ('supplier' in p) out.supplier = str(p.supplier, 200, 'Leverandør');
  if ('notes' in p) out.notes = str(p.notes, 5000, 'Notat');
  if ('quantity' in p) {
    const q = p.quantity;
    if (q === null || q === '') out.quantity = null;
    else if (typeof q === 'number' && Number.isFinite(q) && q >= 0 && q <= 1e7) out.quantity = q;
    else fail('Antall må være et positivt tall');
  }
  if ('dueDate' in p) {
    const d = p.dueDate;
    if (d === null || d === '') out.dueDate = null;
    else if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d))) out.dueDate = d;
    else fail('Frist må være en dato (ÅÅÅÅ-MM-DD)');
  }
  if (isAircraft) {
    if ('aircraftModel' in p) {
      if (!getAircraft(p.aircraftModel as string)) fail('Ukjent flytype');
      out.aircraftModel = p.aircraftModel as string;
    }
    if ('heading' in p) {
      if (typeof p.heading !== 'number' || !Number.isFinite(p.heading)) fail('Ugyldig retning');
      out.heading = Math.round(normalizeHeading(p.heading as number) * 10) / 10;
    }
    if (!out.aircraftModel) fail('Flytype mangler');
    out.heading ??= 0;
  } else {
    delete out.aircraftModel;
    delete out.heading;
  }
  return out;
}
