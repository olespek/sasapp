import { describe, expect, it } from 'vitest';
import { AIRCRAFT, AIRCRAFT_CATEGORIES, aircraftShapes } from './aircraft.js';
import { FULL_OUTLINES, OUTLINES } from './aircraftOutlines.js';
import { getObjectType, panelCount } from './catalog.js';
import { bearing, closestBetween, constrainAngle, distance, mergeLines, nearestOnLine, offset, offsetLine, orientedBox, polygonArea, resizePolygon, shapeCenter, transformGeometry } from './geo.js';
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
    const { body, rotors } = aircraftShapes(spec, SOLA, 0); // nesen mot nord
    const xs = [...body, ...(rotors ?? []).flat()].map((p) => (p[0] - SOLA[0]) * 111320 * Math.cos((SOLA[1] * Math.PI) / 180));
    const ys = [...body, ...(rotors ?? []).flat()].map((p) => (p[1] - SOLA[1]) * 110574);
    const width = Math.max(...xs) - Math.min(...xs);
    const length = Math.max(...ys) - Math.min(...ys);
    expect(width).toBeGreaterThan(spec.span * 0.93);
    expect(width).toBeLessThan(spec.span * 1.07);
    // Totallengden for helikopter inkluderer halerotoren, som ikke tegnes.
    expect(length).toBeGreaterThan(spec.length * (spec.rotors ? 0.8 : 0.9));
    expect(length).toBeLessThan(spec.length * 1.1);
  });

  it('alle kategorier er med i rekkefølgen', () => {
    for (const a of AIRCRAFT) expect(AIRCRAFT_CATEGORIES).toContain(a.category);
    expect(new Set(AIRCRAFT.map((a) => a.id)).size).toBe(AIRCRAFT.length);
  });

  it('sporede omriss hører til en flytype og starter og slutter på midtlinjen', () => {
    for (const [id, pts] of Object.entries(OUTLINES)) {
      const spec = AIRCRAFT.find((a) => a.id === id);
      expect(spec, id).toBeDefined();
      expect(pts[0]).toEqual([0, 0]);
      expect(pts[pts.length - 1][0]).toBe(0);
      // Omriss med åpning mot midtlinjen (Vampire) ender ved åpningen, ikke ved halen.
      const tail = Math.max(...pts.map(([, s]) => s));
      // For helikopter er omrisset bare skroget; totallengden inkluderer rotorene.
      if (spec!.rotors) expect(tail).toBeLessThanOrEqual(spec!.length);
      else expect(tail).toBeCloseTo(spec!.length, 1);
    }
  });

  it('hele omriss hører til en flytype og går fra nese til hale', () => {
    for (const [id, pts] of Object.entries(FULL_OUTLINES)) {
      const spec = AIRCRAFT.find((a) => a.id === id);
      expect(spec, id).toBeDefined();
      expect(OUTLINES[id], id).toBeUndefined();
      expect(Math.min(...pts.map(([, s]) => s))).toBeCloseTo(0, 1);
      expect(Math.max(...pts.map(([, s]) => s))).toBeLessThanOrEqual(spec!.length);
    }
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
    expect(panelCount(getObjectType('gjerde_lavt'), 9)).toBe(3);
    expect(panelCount(getObjectType('gjerde_lavt'), 10)).toBe(4);
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

describe('korteste avstand mellom objekter', () => {
  it('punkt til linje', () => {
    const line: Position[] = [SOLA, offset(SOLA, 0, 300)];
    const c = closestBetween([offset(SOLA, 80, 150)], line)!;
    expect(c.distance).toBeCloseTo(80, 1);
  });

  it('linje til område, og retningen beholdes', () => {
    const line: Position[] = [SOLA, offset(SOLA, 0, 300)];
    const box: Position[] = [offset(SOLA, 50, 100), offset(SOLA, 90, 100), offset(SOLA, 90, 140), offset(SOLA, 50, 140), offset(SOLA, 50, 100)];
    const c = closestBetween(line, box)!;
    expect(c.distance).toBeCloseTo(50, 1);
    expect(nearestOnLine(c.from, line)!.distance).toBeLessThan(0.01); // from ligger på linjen
  });

  it('punkt til punkt', () => {
    expect(closestBetween([SOLA], [offset(SOLA, 30, 40)])!.distance).toBeCloseTo(50, 1);
  });
});

describe('flytte og rotere ferdige objekter', () => {
  const sq: Position[] = [offset(SOLA, -10, -5), offset(SOLA, 10, -5), offset(SOLA, 10, 5), offset(SOLA, -10, 5)];
  const poly = { type: 'Polygon' as const, coordinates: [[...sq, sq[0]]] };

  it('flytter uten å endre form', () => {
    const c = shapeCenter(poly);
    const moved = transformGeometry(poly, c, 0, 30, -20);
    const ring = (moved as typeof poly).coordinates[0];
    expect(distance(ring[0], ring[1])).toBeCloseTo(20, 1);
    expect(distance(c, shapeCenter(moved))).toBeCloseTo(Math.hypot(30, 20), 1);
  });

  it('roterer rundt midten med klokka', () => {
    const c = shapeCenter(poly);
    const rotated = transformGeometry(poly, c, 90) as typeof poly;
    const ring = rotated.coordinates[0];
    // Den lange siden (20 m) peker nå nord–sør, og midtpunktet står stille.
    expect(distance(ring[0], ring[1])).toBeCloseTo(20, 1);
    expect(bearing(ring[0], ring[1])).toBeCloseTo(180, 0);
    expect(distance(c, shapeCenter(rotated))).toBeLessThan(0.01);
  });
});

describe('lengde og bredde på områder', () => {
  const rect = (len: number, wid: number, angle: number) => {
    const c = shapeCenter({ type: 'Polygon', coordinates: [[SOLA, SOLA, SOLA, SOLA]] });
    const sq: Position[] = [offset(SOLA, -len / 2, -wid / 2), offset(SOLA, len / 2, -wid / 2), offset(SOLA, len / 2, wid / 2), offset(SOLA, -len / 2, wid / 2)];
    return transformGeometry({ type: 'Polygon', coordinates: [[...sq, sq[0]]] }, c, angle);
  };

  it('finner lengde og bredde også når området er rotert', () => {
    for (const angle of [0, 30, 75, 120]) {
      const box = orientedBox(rect(80, 25, angle))!;
      expect(box.length).toBeCloseTo(80, 1);
      expect(box.width).toBeCloseTo(25, 1);
    }
  });

  it('endrer lengde og bredde uten å flytte eller rotere området', () => {
    const g = rect(80, 25, 35);
    const before = orientedBox(g)!;
    const after = orientedBox(resizePolygon(g, 100, 10))!;
    expect(after.length).toBeCloseTo(100, 1);
    expect(after.width).toBeCloseTo(10, 1);
    expect(after.angle).toBeCloseTo(before.angle, 1);
    expect(distance(after.center, before.center)).toBeLessThan(0.05);
  });
});
