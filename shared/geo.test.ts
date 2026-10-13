import { describe, expect, it } from 'vitest';
import { AIRCRAFT, aircraftShapes } from './aircraft.js';
import { getObjectType, panelCount } from './catalog.js';
import { bearing, constrainAngle, distance, mergeLines, nearestOnLine, offset, offsetLine, polygonArea } from './geo.js';
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

describe('gjerdeelementer', () => {
  it('runder opp til hele elementer', () => {
    expect(panelCount(getObjectType('gjerde'), 35)).toBe(10);
    expect(panelCount(getObjectType('gjerde'), 35.1)).toBe(11);
    expect(panelCount(getObjectType('gjerde_lavt'), 9)).toBe(5);
    expect(panelCount(getObjectType('fastgjerde'), 100)).toBeNull();
  });
});

describe('vinkellås', () => {
  it('låser første linjestykke til 45° fra nord', () => {
    const p = constrainAngle(null, SOLA, offset(SOLA, 10, 9));
    expect(bearing(SOLA, p)).toBeCloseTo(45, 3);
  });

  it('gir rett vinkel mot forrige linjestykke, også når figuren er skrå', () => {
    const before = offset(SOLA, -20 * Math.sin(0.3), -20 * Math.cos(0.3)); // forrige stykke har kurs ca. 17°
    const p = constrainAngle(before, SOLA, offset(SOLA, 30, -3));
    const turn = Math.abs(bearing(SOLA, p) - bearing(before, SOLA));
    expect(turn).toBeCloseTo(90, 3);
  });

  it('beholder omtrent lengden når musen er nær den låste retningen', () => {
    const p = constrainAngle(null, SOLA, offset(SOLA, 1, 50));
    expect(distance(SOLA, p)).toBeCloseTo(50, 0);
    expect(bearing(SOLA, p) % 360).toBeCloseTo(0, 3);
  });
});

describe('parallell linje og avstand', () => {
  const straight: Position[] = [SOLA, offset(SOLA, 0, 500)]; // 500 m mot nord
  it('finner avstand og side', () => {
    const n = nearestOnLine(offset(SOLA, -100, 200), straight)!;
    expect(n.distance).toBeCloseTo(100, 1);
    expect(n.side).toBe(1); // vest er venstre når man går nordover
    expect(nearestOnLine(offset(SOLA, 30, 200), straight)!.side).toBe(-1);
  });

  it('forskyver en rett linje nøyaktig', () => {
    const o = offsetLine(straight, 100, 1);
    for (const p of o) expect(nearestOnLine(p, straight)!.distance).toBeCloseTo(100, 1);
    expect(toWest(o[0])).toBeCloseTo(100, 1);
  });

  it('holder 100 m til begge stykkene i et knekkpunkt', () => {
    const bent: Position[] = [SOLA, offset(SOLA, 0, 400), offset(SOLA, 300, 700)]; // 45° knekk
    const o = offsetLine(bent, 100, 1);
    // hvert punkt på den nye linjen skal være 100 m fra originalen
    for (let i = 1; i < o.length; i++) {
      for (const t of [0.1, 0.5, 0.9]) {
        const p: Position = [o[i - 1][0] + (o[i][0] - o[i - 1][0]) * t, o[i - 1][1] + (o[i][1] - o[i - 1][1]) * t];
        expect(nearestOnLine(p, bent)!.distance).toBeCloseTo(100, 0);
      }
    }
  });

  function toWest(p: Position): number {
    return -((p[0] - SOLA[0]) * Math.PI / 180 * 6378137 * Math.cos(SOLA[1] * Math.PI / 180));
  }
});

describe('slå sammen linjer', () => {
  it('kobler ved felles endepunkt uten dobbelt punkt', () => {
    const a: Position[] = [SOLA, offset(SOLA, 0, 100)];
    const b: Position[] = [offset(SOLA, 50, 150), offset(SOLA, 0, 100)]; // tegnet motsatt vei
    const m = mergeLines(a, b);
    expect(m).toHaveLength(3);
    expect(distance(m[0], SOLA)).toBeLessThan(0.01);
    expect(distance(m[2], offset(SOLA, 50, 150))).toBeLessThan(0.01);
  });

  it('kobler med et rett stykke når endene ikke møtes', () => {
    const a: Position[] = [SOLA, offset(SOLA, 0, 100)];
    const b: Position[] = [offset(SOLA, 0, 120), offset(SOLA, 0, 200)];
    expect(mergeLines(a, b)).toHaveLength(4);
  });
});
