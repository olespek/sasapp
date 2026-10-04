import { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { distance } from '../../shared/geo';
import type { Position } from '../../shared/types';
import { Icon } from '../icons';

/** Avstand med desimal for korte strekninger, slik at små mål blir presise. */
export function formatDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 2 })} km`;
  if (m >= 100) return `${Math.round(m).toLocaleString('nb-NO')} m`;
  return `${m.toLocaleString('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}

const toPos = (ll: L.LatLng): Position => [ll.lng, ll.lat];

function total(points: Position[]): number {
  let sum = 0;
  for (let i = 1; i < points.length; i++) sum += distance(points[i - 1], points[i]);
  return sum;
}

/**
 * Måleverktøy: klikk punkter i kartet for å måle avstand. Dobbeltklikk eller «Ferdig» avslutter,
 * og neste klikk starter en ny måling. Målingen lagres ikke.
 */
export function MeasureControl({ disabled }: { disabled: boolean }) {
  const map = useMap();
  const [on, setOn] = useState(false);
  const [points, setPoints] = useState<Position[]>([]);
  const [finished, setFinished] = useState(false);
  const [cursor, setCursor] = useState<Position | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const state = useRef({ points, finished });
  state.current = { points, finished };

  useEffect(() => {
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);

  // Slå av når man begynner å tegne objekter.
  useEffect(() => {
    if (disabled && on) setOn(false);
  }, [disabled, on]);

  // Musehendelser mens verktøyet er på.
  useEffect(() => {
    if (!on) return;
    const container = map.getContainer();
    container.classList.add('measuring');
    const onClick = (e: L.LeafletMouseEvent) => {
      const p = toPos(e.latlng);
      const { points: pts, finished: done } = state.current;
      if (done) {
        setPoints([p]);
        setFinished(false);
        return;
      }
      const last = pts[pts.length - 1];
      if (last && distance(last, p) < 0.05) return; // dobbeltklikk gir to like klikk
      setPoints([...pts, p]);
    };
    const onDbl = () => {
      if (state.current.points.length > 1) setFinished(true);
    };
    const onMove = (e: L.LeafletMouseEvent) => setCursor(toPos(e.latlng));
    const onOut = () => setCursor(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOn(false);
    };
    map.on('click', onClick);
    map.on('dblclick', onDbl);
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    document.addEventListener('keydown', onKey);
    return () => {
      container.classList.remove('measuring');
      map.off('click', onClick);
      map.off('dblclick', onDbl);
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
      document.removeEventListener('keydown', onKey);
      setPoints([]);
      setFinished(false);
      setCursor(null);
    };
  }, [map, on]);

  // Tegn målingen.
  useEffect(() => {
    layer.current ??= L.layerGroup().addTo(map);
    const g = layer.current;
    g.clearLayers();
    if (!on || points.length === 0) return;
    const ll = (p: Position): L.LatLngExpression => [p[1], p[0]];
    const line = finished || !cursor ? points : [...points, cursor];
    if (line.length > 1) {
      g.addLayer(L.polyline(line.map(ll), { color: '#ffffff', weight: 6, opacity: 0.9, interactive: false }));
      g.addLayer(L.polyline(line.map(ll), { color: '#ef3b3b', weight: 3, dashArray: '8 6', interactive: false }));
    }
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const mid: Position = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      g.addLayer(
        L.marker(ll(mid), { opacity: 0, interactive: false, keyboard: false }).bindTooltip(formatDistance(distance(a, b)), {
          permanent: true,
          direction: 'center',
          className: 'measure-label',
        }),
      );
    }
    for (const p of points) {
      g.addLayer(L.circleMarker(ll(p), { radius: 5, color: '#ef3b3b', weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false }));
    }
  }, [map, on, points, finished, cursor]);

  useEffect(
    () => () => {
      layer.current?.remove();
      layer.current = null;
    },
    [],
  );

  const sum = total(finished || !cursor ? points : [...points, cursor]);
  const hint =
    points.length === 0
      ? 'Klikk i kartet for å starte målingen.'
      : finished
        ? 'Klikk i kartet for å starte en ny måling.'
        : 'Klikk for flere punkter. Dobbeltklikk eller trykk «Ferdig» for å avslutte.';

  return (
    <div ref={ref}>
      <div className="measure-btn">
        <button
          className={`map-btn ${on ? 'active' : ''}`}
          title="Mål avstand"
          disabled={disabled}
          onClick={() => setOn(!on)}
        >
          <Icon name="ruler" size={18} />
        </button>
      </div>
      {on && (
        <div className="measure-panel">
          <div className="measure-total">
            <span className="muted small">Avstand</span>
            <b>{formatDistance(sum)}</b>
          </div>
          <div className="measure-hint small">{hint}</div>
          <div className="row">
            {!finished && points.length > 1 && (
              <button className="btn small" onClick={() => setFinished(true)}>
                <Icon name="check" size={14} /> Ferdig
              </button>
            )}
            {points.length > 0 && (
              <button
                className="btn small"
                onClick={() => {
                  setPoints([]);
                  setFinished(false);
                }}
              >
                <Icon name="eraser" size={14} /> Nullstill
              </button>
            )}
            <button className="btn small" onClick={() => setOn(false)}>
              <Icon name="x" size={14} /> Lukk
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
