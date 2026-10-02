// Tegner planobjektene i Leaflet og håndterer valg og redigering i kartet.
// Holdes imperativt (utenfor React) fordi Leaflet og Geoman eier sine egne lag.

import L from 'leaflet';
import { aircraftShapes, getAircraft } from '../../shared/aircraft';
import { getObjectType, type ObjectTypeDef } from '../../shared/catalog';
import { bearing, normalizeHeading } from '../../shared/geo';
import { STATUS_COLORS, type Geometry, type PlanObject, type Position } from '../../shared/types';

export interface PlanLayerCallbacks {
  onSelect(id: string | null): void;
  onGeometryChange(id: string, geometry: Geometry, heading?: number): void;
}

interface Entry {
  key: string;
  layer: L.Layer;
  handles: L.Marker[];
}

const toLatLng = (p: Position): L.LatLngExpression => [p[1], p[0]];
const fromLatLng = (ll: L.LatLng): Position => [round(ll.lng), round(ll.lat)];
const round = (n: number) => Math.round(n * 1e7) / 1e7;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function pinIcon(def: ObjectTypeDef, o: PlanObject | null, selected: boolean): L.DivIcon {
  const status = o ? `<span class="pin-status" style="background:${STATUS_COLORS[o.props.status]}"></span>` : '';
  const cls = ['pin', selected ? 'selected' : '', o?.props.status === 'idea' ? 'faded' : ''].join(' ');
  return L.divIcon({
    className: 'pin-wrap',
    html: `<div class="${cls}" style="--c:${def.color}"><span>${escapeHtml(def.icon)}</span>${status}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    tooltipAnchor: [0, -16],
  });
}

function handleIcon(symbol: string, cls: string): L.DivIcon {
  return L.divIcon({ className: 'pin-wrap', html: `<div class="handle ${cls}">${symbol}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
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
      const key = JSON.stringify([o.type, o.name, o.geometry, o.props.status, o.props.heading, o.props.aircraftModel, selected, selected && this.editable, this.labels]);
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
      const style: L.PathOptions = {
        color: selected ? '#f97316' : def.color,
        weight: def.kind === 'line' ? (selected ? 6 : 4) : selected ? 3 : 2,
        dashArray: def.dash,
        fillColor: def.color,
        fillOpacity: o.props.status === 'idea' ? 0.12 : 0.28,
        opacity: o.props.status === 'idea' ? 0.6 : 1,
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
    (layer as L.Path).bindTooltip(this.labels ? escapeHtml(label) : `<b>${escapeHtml(label)}</b><br>${escapeHtml(def.label)}`, {
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
    const color = selected ? '#f97316' : def.color;
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
      const move = L.marker(toLatLng(center), { icon: handleIcon('✥', 'move'), draggable: true, pmIgnore: true, zIndexOffset: 1000 } as L.MarkerOptions);
      const rotate = L.marker(toLatLng(shapes.nose), { icon: handleIcon('⟳', 'rotate'), draggable: true, pmIgnore: true, zIndexOffset: 1000 } as L.MarkerOptions);
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
