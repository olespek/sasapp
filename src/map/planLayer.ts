// Tegner planobjektene i Leaflet og håndterer valg og redigering i kartet.
// Holdes imperativt (utenfor React) fordi Leaflet og Geoman eier sine egne lag.

import L from 'leaflet';
import { aircraftShapes, getAircraft } from '../../shared/aircraft';
import { getObjectType, type ObjectTypeDef } from '../../shared/catalog';
import { bearing, constrainAngle, normalizeHeading } from '../../shared/geo';
import { STATUS_COLORS, obstacleHeightText, type Geometry, type PlanObject, type Position } from '../../shared/types';
import { iconSvg } from '../icons';

export interface PlanLayerCallbacks {
  onSelect(id: string | null): void;
  onGeometryChange(id: string, geometry: Geometry, heading?: number): void;
}

interface Entry {
  key: string;
  layer: L.Layer;
  handles: L.Marker[];
}

/** Fremhevingsfarge for valgt objekt (samme røde som knappene). */
const SELECT_COLOR = '#ef3b3b';

const toLatLng = (p: Position): L.LatLngExpression => [p[1], p[0]];
const fromLatLng = (ll: L.LatLng): Position => [round(ll.lng), round(ll.lat)];
const round = (n: number) => Math.round(n * 1e7) / 1e7;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function pinIcon(def: ObjectTypeDef, o: PlanObject | null, selected: boolean): L.DivIcon {
  const tracked = !def.noTracking;
  const status = o && tracked ? `<span class="pin-status" style="background:${STATUS_COLORS[o.props.status]}"></span>` : '';
  const cls = ['pin', selected ? 'selected' : '', tracked && o?.props.status === 'idea' ? 'faded' : ''].join(' ');
  const hText = def.hasHeight && o ? obstacleHeightText(o.props) : null;
  const h = hText ? `<span class="pin-height">${escapeHtml(hText)}</span>` : '';
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="${cls}" style="--c:${def.color}">${iconSvg(def.icon, 16, 2.25)}${status}${h}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    tooltipAnchor: [0, -16],
  });
}

function handleIcon(icon: string, cls: string): L.DivIcon {
  return L.divIcon({ className: 'pin-wrap', html: `<div class="handle ${cls}">${iconSvg(icon, 15, 2.5)}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}

export class PlanLayer {
  private group: L.FeatureGroup;
  private entries = new Map<string, Entry>();
  private objects: PlanObject[] = [];
  private selected: string | null = null;
  private editable = false;
  private hidden = new Set<string>();
  private labels = false;

  constructor(
    private map: L.Map,
    private cb: PlanLayerCallbacks,
  ) {
    this.group = L.featureGroup().addTo(map);
  }

  destroy(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
    this.group.remove();
  }

  setObjects(objects: PlanObject[]): void {
    this.objects = objects;
    this.sync();
  }

  setSelected(id: string | null): void {
    this.selected = id;
    this.sync();
  }

  setEditable(editable: boolean): void {
    this.editable = editable;
    this.sync();
  }

  setHiddenGroups(groups: Set<string>): void {
    this.hidden = groups;
    this.sync();
  }

  setShowLabels(show: boolean): void {
    this.labels = show;
    this.sync();
  }

  /** Zoomer til et objekt. */
  focus(id: string): void {
    const o = this.objects.find((x) => x.id === id);
    if (!o) return;
    if (o.geometry.type === 'Point') {
      this.map.setView(toLatLng(o.geometry.coordinates), Math.max(this.map.getZoom(), 18));
    } else {
      const entry = this.entries.get(id);
      const bounds = entry && 'getBounds' in entry.layer ? (entry.layer as L.Polyline).getBounds() : null;
      if (bounds?.isValid()) this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 19 });
    }
  }

  private visible(o: PlanObject): boolean {
    const def = getObjectType(o.type);
    return !def || !this.hidden.has(def.group);
  }

  private sync(): void {
    const seen = new Set<string>();
    for (const o of this.objects) {
      if (!this.visible(o)) continue;
      seen.add(o.id);
      const selected = o.id === this.selected;
      const key = JSON.stringify([o.type, o.name, o.geometry, o.props.status, o.props.heading, o.props.aircraftModel, o.props.mslFt, o.props.aglFt, selected, selected && this.editable, this.labels]);
      const existing = this.entries.get(o.id);
      if (existing?.key === key) continue;
      if (existing) this.remove(o.id);
      this.add(o, key, selected);
    }
    for (const id of [...this.entries.keys()]) if (!seen.has(id)) this.remove(id);
  }

  private remove(id: string): void {
    const e = this.entries.get(id);
    if (!e) return;
    const pm = (e.layer as L.Layer & { pm?: { enabled(): boolean; disable(): void } }).pm;
    if (pm?.enabled()) pm.disable();
    this.group.removeLayer(e.layer);
    for (const h of e.handles) h.remove();
    this.entries.delete(id);
  }

  private add(o: PlanObject, key: string, selected: boolean): void {
    const def = getObjectType(o.type);
    if (!def) return;
    const editing = selected && this.editable;
    const handles: L.Marker[] = [];
    let layer: L.Layer;

    if (def.kind === 'aircraft' && o.geometry.type === 'Point') {
      layer = this.aircraftLayer(o, def, selected, editing, handles);
    } else if (o.geometry.type === 'Point') {
      const marker = L.marker(toLatLng(o.geometry.coordinates), { icon: pinIcon(def, o, selected), draggable: editing, pmIgnore: true } as L.MarkerOptions);
      if (editing) marker.on('dragend', () => this.cb.onGeometryChange(o.id, { type: 'Point', coordinates: fromLatLng(marker.getLatLng()) }));
      layer = marker;
    } else {
      const idea = !def.noTracking && o.props.status === 'idea';
      const style: L.PathOptions = {
        color: selected ? SELECT_COLOR : def.color,
        weight: def.kind === 'line' ? (def.weight ?? 4) + (selected ? 2 : 0) : selected ? 3 : 2,
        dashArray: def.dash,
        fillColor: def.color,
        fillOpacity: (def.fillOpacity ?? 0.28) * (idea ? 0.45 : 1),
        opacity: idea ? 0.6 : 1,
      };
      const path =
        o.geometry.type === 'LineString'
          ? L.polyline(o.geometry.coordinates.map(toLatLng), style)
          : L.polygon(o.geometry.coordinates.map((ring) => ring.slice(0, -1).map(toLatLng)), style);
      if (editing) {
        const emit = debounce(() => {
          const g = (path.toGeoJSON(7) as GeoJSON.Feature).geometry as Geometry;
          this.cb.onGeometryChange(o.id, g);
        }, 120);
        path.on('pm:edit pm:dragend', emit);
      }
      layer = path;
    }

    const label = o.name || def.label;
    const isArea = def.kind === 'polygon' || def.kind === 'aircraft';
    const hText = def.hasHeight ? obstacleHeightText(o.props) : null;
    const heightText = hText ? ` · ${hText}` : '';
    (layer as L.Path).bindTooltip(this.labels ? escapeHtml(label) : `<b>${escapeHtml(label)}</b><br>${escapeHtml(def.label + heightText)}`, {
      permanent: this.labels,
      direction: isArea && this.labels ? 'center' : 'top',
      className: this.labels ? 'map-label' : '',
      sticky: !this.labels && def.kind !== 'point',
    });
    layer.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      this.cb.onSelect(o.id);
    });

    this.group.addLayer(layer);
    if (editing && (def.kind === 'line' || def.kind === 'polygon')) {
      (layer as L.Polyline).pm.enable({ allowSelfIntersection: true, draggable: true, snappable: true });
      lockAngleOnVertexDrag(this.map, layer as L.Polyline, def.kind === 'polygon');
    }
    if (selected && 'bringToFront' in layer) (layer as L.Path).bringToFront();
    this.entries.set(o.id, { key, layer, handles });
  }

  private aircraftLayer(o: PlanObject, def: ObjectTypeDef, selected: boolean, editing: boolean, handles: L.Marker[]): L.Layer {
    const spec = getAircraft(o.props.aircraftModel);
    let center = (o.geometry as { coordinates: Position }).coordinates;
    let heading = o.props.heading ?? 0;
    const group = L.featureGroup();
    if (!spec) {
      group.addLayer(L.marker(toLatLng(center), { icon: pinIcon(def, o, selected), pmIgnore: true } as L.MarkerOptions));
      return group;
    }
    const color = selected ? SELECT_COLOR : def.color;
    let shapes = aircraftShapes(spec, center, heading);
    const body = L.polygon(shapes.body.map(toLatLng), {
      color,
      weight: selected ? 2.5 : 1.5,
      fillColor: def.color,
      fillOpacity: o.props.status === 'idea' ? 0.3 : 0.65,
      pmIgnore: true,
    } as L.PolylineOptions);
    const rotor = shapes.rotor
      ? L.polygon(shapes.rotor.map(toLatLng), { color, weight: 1, dashArray: '4 4', fillOpacity: 0.06, pmIgnore: true } as L.PolylineOptions)
      : null;
    if (rotor) group.addLayer(rotor);
    group.addLayer(body);

    if (editing) {
      const redraw = () => {
        shapes = aircraftShapes(spec, center, heading);
        body.setLatLngs(shapes.body.map(toLatLng));
        rotor?.setLatLngs(shapes.rotor!.map(toLatLng));
      };
      const move = L.marker(toLatLng(center), { icon: handleIcon('move', 'move'), draggable: true, pmIgnore: true, zIndexOffset: 1000 } as L.MarkerOptions);
      const rotate = L.marker(toLatLng(shapes.nose), { icon: handleIcon('rotate-cw', 'rotate'), draggable: true, pmIgnore: true, zIndexOffset: 1000 } as L.MarkerOptions);
      move.bindTooltip('Dra for å flytte');
      rotate.bindTooltip('Dra for å rotere');
      move.on('drag', () => {
        center = fromLatLng(move.getLatLng());
        redraw();
        rotate.setLatLng(toLatLng(shapes.nose));
      });
      rotate.on('drag', () => {
        heading = Math.round(normalizeHeading(bearing(center, fromLatLng(rotate.getLatLng()))) * 10) / 10;
        redraw();
      });
      const emit = () => {
        rotate.setLatLng(toLatLng(shapes.nose));
        this.cb.onGeometryChange(o.id, { type: 'Point', coordinates: center }, heading);
      };
      move.on('dragend', emit);
      rotate.on('dragend', emit);
      move.addTo(this.map);
      rotate.addTo(this.map);
      handles.push(move, rotate);
    }
    return group;
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(t);
    t = setTimeout(fn, ms);
  };
}

/**
 * Holder man Shift mens man drar et knekkpunkt, låses retningen fra nabopunktet til 45°-steg
 * i forhold til linjestykket før (0° = rett forlengelse, 90° = rett vinkel).
 * Endepunktet låses mot sitt eneste nabostykke; andre punkter mot stykket bak dem.
 */
function lockAngleOnVertexDrag(map: L.Map, layer: L.Polyline, closed: boolean): void {
  type DragStart = { markerEvent?: { target?: L.Marker }; indexPath?: number[] };
  layer.on('pm:markerdragstart', (ev) => {
    const e = ev as unknown as DragStart;
    const marker = e.markerEvent?.target;
    const path = e.indexPath;
    const draggable = (marker as unknown as { dragging?: { _draggable?: L.Draggable & { _newPos: L.Point } } })?.dragging?._draggable;
    if (!marker || !path || !draggable) return;
    const index = path[path.length - 1];
    const ring = (): L.LatLng[] => {
      const all = layer.getLatLngs() as unknown;
      return (closed ? (all as L.LatLng[][])[path.length > 1 ? path[0] : 0] : all) as L.LatLng[];
    };
    const pos = (ll: L.LatLng): Position => [ll.lng, ll.lat];
    let exact: Position | null = null;
    const onPredrag = (de: L.LeafletEvent) => {
      const orig = (de as unknown as { originalEvent?: MouseEvent }).originalEvent;
      exact = null;
      if (!orig?.shiftKey) return;
      const pts = ring();
      const n = pts.length;
      if (n < 2) return;
      let prev: L.LatLng;
      let before: L.LatLng | null;
      if (closed) {
        prev = pts[(index - 1 + n) % n];
        before = n > 2 ? pts[(index - 2 + n) % n] : null;
      } else if (index > 0) {
        prev = pts[index - 1];
        before = index > 1 ? pts[index - 2] : null;
      } else {
        prev = pts[1];
        before = n > 2 ? pts[2] : null;
      }
      const cursor = map.layerPointToLatLng(draggable._newPos);
      const c = constrainAngle(before ? pos(before) : null, pos(prev), pos(cursor));
      exact = c;
      draggable._newPos = map.latLngToLayerPoint(L.latLng(c[1], c[0]));
    };
    draggable.on('predrag', onPredrag);
    layer.once('pm:markerdragend', () => {
      draggable.off('predrag', onPredrag);
      // Kartet runder markøren av til hele piksler. Sett det nøyaktige punktet før endringen lagres.
      if (exact) {
        const ll = ring()[index];
        if (ll) {
          ll.lat = exact[1];
          ll.lng = exact[0];
          marker.setLatLng(ll);
          layer.redraw();
        }
      }
    });
  });
}
