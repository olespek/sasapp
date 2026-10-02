import { describe, expect, it } from 'vitest';
import { AIRCRAFT, aircraftShapes } from './aircraft.js';
import { bearing, distance, offset, polygonArea } from './geo.js';
import type { Position } from './types.js';

const SOLA: Position = [5.6442, 58.8873];

describe('geo', () => {
  it('offset og distance stemmer overens', () => {
    const p = offset(SOLA, 30, 40);
    expect(distance(SOLA, p)).toBeCloseTo(50, 1);
    expect(bearing(SOLA, offset(SOLA, 10, 0))).toBeCloseTo(90, 3);
  });

  it('areal av et 100 x 50 m rektangel', () => {
    const ring = [SOLA, offset(SOLA, 100, 0), offset(SOLA, 100, 50), offset(SOLA, 0, 50), SOLA];
    expect(polygonArea([ring])).toBeGreaterThan(4950);
    expect(polygonArea([ring])).toBeLessThan(5050);
  });
});

describe('flysiluetter', () => {
  it.each(AIRCRAFT.map((a) => [a.id, a] as const))('%s har riktig spennvidde og lengde', (_id, spec) => {
    const { body, rotor } = aircraftShapes(spec, SOLA, 0); // nesen mot nord
    const xs = [...body, ...(rotor ?? [])].map((p) => (p[0] - SOLA[0]) * 111320 * Math.cos((SOLA[1] * Math.PI) / 180));
    const ys = [...body, ...(rotor ?? [])].map((p) => (p[1] - SOLA[1]) * 110574);
    const width = Math.max(...xs) - Math.min(...xs);
    const length = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(spec.span * 0.93);
    expect(width).toBeLessThan(spec.span * 1.07);
    expect(length).toBeGreaterThan(spec.length * 0.9);
    expect(length).toBeLessThan(spec.length * 1.1);
  });

  it('roterer med kursen', () => {
    const spec = AIRCRAFT.find((a) => a.id === 'c130j')!;
    const { nose } = aircraftShapes(spec, SOLA, 90);
    expect(bearing(SOLA, nose)).toBeCloseTo(90, 0);
  });
});
