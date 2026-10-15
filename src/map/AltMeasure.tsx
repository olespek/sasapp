// Avstand i Figma-stil: hold Alt/Option for å se korteste avstand med en rød linje og etikett.
// - Med et objekt valgt: fra punktet under musepekeren på objektet man peker på, til nærmeste
//   punkt på det valgte objektet. Målestreken følger altså musen langs objektet.
// - Uten valgt objekt (eller mens man tegner): fra musepekeren til nærmeste objekt.

import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { aircraftShapes, getAircraft } from '../../shared/aircraft';
import { getObjectType } from '../../shared/catalog';
import { closestBetween, distance } from '../../shared/geo';
import type { PlanObject, Position } from '../../shared/types';
import { LABEL_ANCHOR, formatDistance } from './MeasureControl';

const RED = '#f24822';
const toLL = (p: Position): L.LatLngExpression => [p[1], p[0]];

/** Objektets form som punktliste: ett punkt, en linje eller en lukket omkrets. */
export function shapeOf(o: PlanObject): Position[] {
  const g = o.geometry;
  if (g.type === 'LineString') return g.coordinates;
  if (g.type === 'Polygon') return g.coordinates[0];
  const spec = getObjectType(o.type)?.kind === 'aircraft' ? getAircraft(o.props.aircraftModel) : undefined;
  if (spec) {
    const body = aircraftShapes(spec, g.coordinates, o.props.heading ?? 0).body;
    return [...body, body[0]];
  }
  return [g.coordinates];
}

interface Props {
  objects: PlanObject[];
  selectedId: string | null;
  /** Under tegning måles alltid fra musepekeren. */
  drawing: boolean;
}

export function AltMeasure({ objects, selectedId, drawing }: Props) {
  const map = useMap();
  const [alt, setAlt] = useState(false);
  const [cursor, setCursor] = useState<Position | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        e.preventDefault(); // hindrer at Alt åpner menylinjen i enkelte nettlesere
        setAlt(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(false);
    };
    const blur = () => setAlt(false);
    const move = (e: L.LeafletMouseEvent) => {
      setCursor([e.latlng.lng, e.latlng.lat]);
      if (e.originalEvent && !e.originalEvent.altKey) setAlt(false); // Alt sluppet utenfor vinduet
    };
    const out = () => setCursor(null);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    map.on('mousemove', move);
    map.on('mouseout', out);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      map.off('mousemove', move);
      map.off('mouseout', out);
    };
  }, [map]);

  useEffect(() => {
    layer.current ??= L.layerGroup().addTo(map);
    const g = layer.current;
    g.clearLayers();
    map.getContainer().classList.toggle('alt-measuring', alt);
    if (!alt || !cursor) return;

    const selected = !drawing && selectedId ? objects.find((o) => o.id === selectedId) : undefined;
    const others = objects.filter((o) => o.id !== selected?.id);
    // Målet er objektet nærmest musepekeren (det man «peker på»).
    let target: PlanObject | null = null;
    let targetDist = Infinity;
    for (const o of others) {
      const c = closestBetween([cursor], shapeOf(o));
      if (c && c.distance < targetDist) {
        targetDist = c.distance;
        target = o;
      }
    }
    if (!target) return;
    // Målingen følger musepekeren: fra punktet på målet der musen peker, til nærmeste punkt på
    // det valgte objektet (eller til musepekeren selv når ingenting er valgt).
    const onTarget = closestBetween([cursor], shapeOf(target));
    if (!onTarget) return;
    const result = selected ? closestBetween([onTarget.to], shapeOf(selected)) : onTarget;
    if (!result) return;

    // Marker målet.
    const ts = shapeOf(target);
    if (ts.length === 1) g.addLayer(L.circleMarker(toLL(ts[0]), { radius: 18, color: RED, weight: 1.5, fill: false, interactive: false }));
    else g.addLayer(L.polyline(ts.map(toLL), { color: RED, weight: 1.5, interactive: false }));
    if (selected) {
      const ss = shapeOf(selected);
      if (ss.length === 1) g.addLayer(L.circleMarker(toLL(ss[0]), { radius: 18, color: RED, weight: 1.5, fill: false, interactive: false }));
      else g.addLayer(L.polyline(ss.map(toLL), { color: RED, weight: 1.5, interactive: false }));
    }

    if (result.distance < 0.05 || distance(result.from, result.to) < 0.05) {
      g.addLayer(L.marker(toLL(result.to), { icon: LABEL_ANCHOR, interactive: false }).bindTooltip('0 m', { permanent: true, direction: 'top', className: 'alt-label' }));
      return;
    }
    // Avstandslinje med små endestreker, som i Figma.
    const a = map.latLngToLayerPoint(toLL(result.from));
    const b = map.latLngToLayerPoint(toLL(result.to));
    const len = a.distanceTo(b) || 1;
    const nx = ((b.y - a.y) / len) * 6;
    const ny = (-(b.x - a.x) / len) * 6;
    const tick = (p: L.Point) => [map.layerPointToLatLng(L.point(p.x - nx, p.y - ny)), map.layerPointToLatLng(L.point(p.x + nx, p.y + ny))];
    g.addLayer(L.polyline([toLL(result.from), toLL(result.to)], { color: RED, weight: 1.5, interactive: false }));
    g.addLayer(L.polyline(tick(a), { color: RED, weight: 1.5, interactive: false }));
    g.addLayer(L.polyline(tick(b), { color: RED, weight: 1.5, interactive: false }));
    const mid: Position = [(result.from[0] + result.to[0]) / 2, (result.from[1] + result.to[1]) / 2];
    g.addLayer(
      L.marker(toLL(mid), { icon: LABEL_ANCHOR, interactive: false, keyboard: false }).bindTooltip(formatDistance(result.distance), {
        permanent: true,
        direction: 'center',
        className: 'alt-label',
      }),
    );
  }, [map, alt, cursor, objects, selectedId, drawing]);

  useEffect(
    () => () => {
      layer.current?.remove();
      layer.current = null;
    },
    [],
  );

  return null;
}
