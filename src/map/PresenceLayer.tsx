// Viser de andre innloggede brukernes musepeker (med initialer) og valgte objekt i kartet,
// og sender egen museposisjon og eget valg. Bare på PC med mus, og ikke via delingslenken.

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { shapeCenter } from '../../shared/geo';
import type { PlanObject, Position, Presence } from '../../shared/types';
import { api } from '../api';
import { shapeOf } from './AltMeasure';

/** Sender maks så ofte (ms). */
const SEND_EVERY = 125;
/** En peker som ikke har flyttet seg på så lenge (ms), skjules. */
const STALE_AFTER = 60_000;

const toLL = (p: Position): L.LatLngExpression => [p[1], p[0]];

function cursorIcon(p: Presence): L.DivIcon {
  return L.divIcon({
    className: 'presence-cursor',
    html:
      `<svg width="18" height="20" viewBox="0 0 18 20"><path d="M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z" fill="${p.color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>` +
      `<span style="background:${p.color}">${p.initials}</span>`,
    iconSize: [0, 0],
    iconAnchor: [1, 1],
  });
}

interface Props {
  others: Presence[];
  objects: PlanObject[];
  selectedId: string | null;
}

export function PresenceLayer({ others, objects, selectedId }: Props) {
  const map = useMap();
  const state = useRef({ cursor: null as [number, number] | null, selectedId, last: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });

  // Send egen posisjon (strupet) og eget valg.
  useEffect(() => {
    const s = state.current;
    const flush = () => {
      s.timer = 0;
      s.last = Date.now();
      api.presence({ cursor: s.cursor, selectedId: s.selectedId }).catch(() => {});
    };
    const schedule = () => {
      if (s.timer) return;
      const wait = Math.max(0, SEND_EVERY - (Date.now() - s.last));
      s.timer = setTimeout(flush, wait);
    };
    const move = (e: L.LeafletMouseEvent) => {
      s.cursor = [Math.round(e.latlng.lng * 1e7) / 1e7, Math.round(e.latlng.lat * 1e7) / 1e7];
      schedule();
    };
    const out = () => {
      s.cursor = null;
      schedule();
    };
    map.on('mousemove', move);
    map.getContainer().addEventListener('mouseleave', out);
    return () => {
      map.off('mousemove', move);
      map.getContainer().removeEventListener('mouseleave', out);
      if (s.timer) clearTimeout(s.timer);
    };
  }, [map]);

  useEffect(() => {
    state.current.selectedId = selectedId;
    api.presence({ cursor: state.current.cursor, selectedId }).catch(() => {});
  }, [selectedId]);

  // De andres pekere og valgte objekter.
  const layer = useRef<L.LayerGroup | null>(null);
  const cursors = useRef(new Map<number, { marker: L.Marker; key: string; seen: number }>());
  useEffect(() => {
    layer.current ??= L.layerGroup().addTo(map);
    const g = layer.current;
    const now = Date.now();
    const live = new Set<number>();
    for (const p of others) {
      if (!p.cursor) continue;
      live.add(p.id);
      const key = `${p.initials}|${p.color}`;
      const existing = cursors.current.get(p.id);
      if (existing && existing.key === key) {
        existing.marker.setLatLng(toLL(p.cursor));
        existing.seen = now;
      } else {
        existing?.marker.remove();
        const marker = L.marker(toLL(p.cursor), { icon: cursorIcon(p), interactive: false, keyboard: false, pmIgnore: true, zIndexOffset: 3000 } as L.MarkerOptions);
        g.addLayer(marker);
        cursors.current.set(p.id, { marker, key, seen: now });
      }
    }
    for (const [id, c] of cursors.current) {
      if (!live.has(id)) {
        c.marker.remove();
        cursors.current.delete(id);
      }
    }
  }, [map, others]);

  // Skjul pekere som har stått stille lenge (f.eks. en fane som er glemt åpen).
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      for (const c of cursors.current.values()) c.marker.setOpacity(now - c.seen > STALE_AFTER ? 0 : 1);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const selLayer = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    selLayer.current ??= L.layerGroup().addTo(map);
    const g = selLayer.current;
    g.clearLayers();
    for (const p of others) {
      const o = p.selectedId ? objects.find((x) => x.id === p.selectedId) : undefined;
      if (!o) continue;
      const shape = shapeOf(o);
      const style = { color: p.color, weight: 3, dashArray: '6 5', fill: false, interactive: false, pmIgnore: true } as L.PolylineOptions;
      if (shape.length === 1) g.addLayer(L.circleMarker(toLL(shape[0]), { ...style, radius: 20 } as L.CircleMarkerOptions));
      else if (o.geometry.type === 'LineString') g.addLayer(L.polyline(shape.map(toLL), style));
      else g.addLayer(L.polygon(shape.map(toLL), style));
      const at = o.geometry.type === 'LineString' ? shape[Math.floor(shape.length / 2)] : shapeCenter(o.geometry);
      g.addLayer(
        L.marker(toLL(at), {
          icon: L.divIcon({ className: 'presence-tag', html: `<span style="background:${p.color}">${p.initials}</span>`, iconSize: [0, 0] }),
          interactive: false,
          keyboard: false,
          pmIgnore: true,
          zIndexOffset: 2500,
        } as L.MarkerOptions),
      );
    }
  }, [map, others, objects]);

  useEffect(
    () => () => {
      layer.current?.remove();
      selLayer.current?.remove();
      layer.current = null;
      selLayer.current = null;
      cursors.current.clear();
    },
    [],
  );

  return null;
}
