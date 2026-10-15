// Klikk og dra for å tegne et rettvinklet område (nord–sør/øst–vest) mens man tegner et område.
// Gjelder bare før første knekkpunkt er satt; vanlige klikk tegner knekkpunkt som før.
// Shift gir kvadrat. Bredde og høyde vises mens man drar.

import L from 'leaflet';
import { distance } from '../../shared/geo';
import type { Geometry, Position } from '../../shared/types';
import { LABEL_ANCHOR, formatDistance } from './MeasureControl';

/** Hvor langt (piksler) musen må flyttes før det regnes som draging og ikke klikk. */
const DRAG_PX = 6;

const toPos = (ll: L.LatLng): Position => [Math.round(ll.lng * 1e7) / 1e7, Math.round(ll.lat * 1e7) / 1e7];

export interface RectDrag {
  stop(): void;
}

export function createRectDrag(map: L.Map, color: string, onDone: (geometry: Geometry) => void): RectDrag {
  const container = map.getContainer();
  const polygonDraw = () => (map.pm.Draw as unknown as { Polygon?: { _layer?: L.Polyline } }).Polygon;
  const hasVertices = () => ((polygonDraw()?._layer?.getLatLngs() as L.LatLng[] | undefined) ?? []).length > 0;

  const preview = L.polygon([], { color, fillColor: color, fillOpacity: 0.25, weight: 2, interactive: false });
  const labels = L.layerGroup();
  let start: { point: L.Point; latlng: L.LatLng } | null = null;
  let dragging = false;
  let corners: L.LatLng[] = [];
  let suppressClick = false;
  let mapDragWasOn = false;

  const label = (a: L.LatLng, b: L.LatLng) => {
    const d = distance(toPos(a), toPos(b));
    labels.addLayer(
      L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { icon: LABEL_ANCHOR, interactive: false, keyboard: false }).bindTooltip(formatDistance(d), {
        permanent: true,
        direction: 'center',
        className: 'measure-label live',
      }),
    );
  };

  const cornersFor = (e: MouseEvent): L.LatLng[] => {
    let p = map.mouseEventToContainerPoint(e);
    const s = start!.point;
    if (e.shiftKey) {
      // Kvadrat: like lang side i meter, ikke i piksler (piksler er ikke kvadratiske langt nord).
      const a = start!.latlng;
      const b = map.containerPointToLatLng(p);
      const w = distance(toPos(a), toPos(L.latLng(a.lat, b.lng)));
      const h = distance(toPos(a), toPos(L.latLng(b.lat, a.lng)));
      const side = Math.max(w, h);
      const sx = Math.sign(p.x - s.x) || 1;
      const sy = Math.sign(p.y - s.y) || 1;
      const east = (side / (6371008.8 * Math.cos((a.lat * Math.PI) / 180))) * (180 / Math.PI);
      const north = (side / 6371008.8) * (180 / Math.PI);
      const c = L.latLng(a.lat - sy * north, a.lng + sx * east);
      p = map.latLngToContainerPoint(c);
    }
    const a = start!.latlng;
    const c = map.containerPointToLatLng(p);
    return [a, L.latLng(a.lat, c.lng), c, L.latLng(c.lat, a.lng)];
  };

  const onDown = (e: MouseEvent) => {
    if (e.button !== 0 || hasVertices()) return;
    const target = e.target as HTMLElement;
    if (target.closest('.leaflet-control, .leaflet-marker-icon')) return;
    start = { point: map.mouseEventToContainerPoint(e), latlng: map.mouseEventToLatLng(e) };
    dragging = false;
    // Hindrer at kartet panorerer mens man drar ut boksen.
    mapDragWasOn = map.dragging.enabled();
    map.dragging.disable();
    L.DomUtil.disableTextSelection(); // ellers markeres tekst på siden mens man drar
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const onMove = (e: MouseEvent) => {
    if (!start) return;
    if (!dragging && map.mouseEventToContainerPoint(e).distanceTo(start.point) < DRAG_PX) return;
    dragging = true;
    corners = cornersFor(e);
    preview.setLatLngs(corners);
    if (!map.hasLayer(preview)) preview.addTo(map);
    labels.clearLayers();
    label(corners[0], corners[1]);
    label(corners[1], corners[2]);
    if (!map.hasLayer(labels)) labels.addTo(map);
  };

  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (mapDragWasOn) map.dragging.enable();
    L.DomUtil.enableTextSelection();
    const wasDrag = dragging;
    start = null;
    dragging = false;
    preview.remove();
    labels.clearLayers();
    labels.remove();
    if (!wasDrag) return; // vanlig klikk: Geoman setter knekkpunkt
    suppressClick = true; // klikket som følger etter slipp skal ikke bli et knekkpunkt
    setTimeout(() => (suppressClick = false), 0);
    const ring = corners.map(toPos);
    if (distance(ring[0], ring[1]) < 0.5 || distance(ring[1], ring[2]) < 0.5) return;
    onDone({ type: 'Polygon', coordinates: [[...ring, ring[0]]] });
  };

  const onClickCapture = (e: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.stopPropagation();
    e.preventDefault();
  };

  container.addEventListener('mousedown', onDown, true);
  container.addEventListener('click', onClickCapture, true);

  return {
    stop() {
      container.removeEventListener('mousedown', onDown, true);
      container.removeEventListener('click', onClickCapture, true);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (start && mapDragWasOn) map.dragging.enable();
      if (start) L.DomUtil.enableTextSelection();
      preview.remove();
      labels.remove();
    },
  };
}
