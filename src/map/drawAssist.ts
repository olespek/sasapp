// Hjelp under tegning av linjer og områder med Geoman:
// - viser lengden på hvert linjestykke live mens man tegner
// - holder man inne Shift, låses retningen til 45°/90° i forhold til forrige linjestykke
//
// Geoman leser posisjonen fra musehendelsen. Vi registrerer derfor en lytter FØR Geoman som
// justerer e.latlng når Shift er nede, og en lytter ETTER Geoman som tegner lengdene.

import L from 'leaflet';
import { constrainAngle, distance } from '../../shared/geo';
import type { Position } from '../../shared/types';
import { formatDistance } from './MeasureControl';

type Shape = 'Line' | 'Polygon';

interface DrawInternals {
  _layer?: L.Polyline;
  _hintMarker?: L.Marker;
}

const toPos = (ll: L.LatLng): Position => [ll.lng, ll.lat];
const toLL = (p: Position): L.LatLngExpression => [p[1], p[0]];

export interface DrawAssist {
  /** Kalles etter at Geoman har startet tegningen. */
  start(): void;
  stop(): void;
}

/** Må kalles FØR map.pm.enableDraw, slik at vinkellåsen får justere posisjonen før Geoman ser den. */
export function createDrawAssist(map: L.Map, shape: Shape): DrawAssist {
  const draw = () => (map.pm.Draw as unknown as Record<Shape, DrawInternals>)[shape];
  const placed = (): Position[] => ((draw()?._layer?.getLatLngs() as L.LatLng[] | undefined) ?? []).map(toPos);

  const constrain = (e: L.LeafletMouseEvent) => {
    if (!e.originalEvent?.shiftKey) return;
    const pts = placed();
    if (pts.length === 0) return;
    const c = constrainAngle(pts.length > 1 ? pts[pts.length - 2] : null, pts[pts.length - 1], toPos(e.latlng));
    e.latlng = L.latLng(c[1], c[0]);
  };

  const labels = L.layerGroup();
  const label = (a: Position, b: Position, cls = 'measure-label') => {
    const d = distance(a, b);
    if (d < 0.05) return;
    const mid: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    labels.addLayer(
      L.marker(toLL(mid), { opacity: 0, interactive: false, keyboard: false }).bindTooltip(formatDistance(d), {
        permanent: true,
        direction: 'center',
        className: cls,
      }),
    );
  };

  const render = () => {
    labels.clearLayers();
    const pts = placed();
    if (pts.length === 0) return;
    for (let i = 1; i < pts.length; i++) label(pts[i - 1], pts[i]);
    const hint = draw()?._hintMarker?.getLatLng();
    if (!hint) return;
    const h = toPos(hint);
    label(pts[pts.length - 1], h, 'measure-label live');
    if (shape === 'Polygon' && pts.length >= 2) label(h, pts[0], 'measure-label closing');
  };

  map.on('mousemove', constrain);
  map.on('click', constrain);

  return {
    start() {
      labels.addTo(map);
      map.on('mousemove', render);
      map.on('click', render);
    },
    stop() {
      map.off('mousemove', constrain);
      map.off('click', constrain);
      map.off('mousemove', render);
      map.off('click', render);
      labels.remove();
    },
  };
}
