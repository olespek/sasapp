// Verktøy for linjer som jobber direkte i kartet:
// - parallell linje i fast avstand (klikk på siden den skal ligge)
// - forleng en linje fra en av endene, slik at f.eks. 45°-knekker blir en del av samme objekt
// «Slå sammen» trenger klikk på objekter og håndteres i App.

import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { getObjectType } from '../../shared/catalog';
import { nearestOnLine, offsetLine } from '../../shared/geo';
import type { Geometry, PlanObject, Position } from '../../shared/types';
import { iconSvg } from '../icons';
import { createDrawAssist } from './drawAssist';
import { LABEL_ANCHOR, formatDistance } from './MeasureControl';

export type LineTool =
  | { kind: 'parallel'; sourceId: string; typeId: string; distance: number }
  | { kind: 'extend'; sourceId: string }
  | { kind: 'merge'; sourceId: string };

const toLL = (p: Position): L.LatLngExpression => [p[1], p[0]];

interface Props {
  tool: LineTool | null;
  objects: PlanObject[];
  onParallel(typeId: string, geometry: Geometry): void;
  onExtend(id: string, geometry: Geometry): void;
}

export function LineTools({ tool, objects, onParallel, onExtend }: Props) {
  const map = useMap();
  const cb = useRef({ onParallel, onExtend, objects });
  cb.current = { onParallel, onExtend, objects };

  const source = tool ? objects.find((o) => o.id === tool.sourceId) : undefined;
  const coords = source?.geometry.type === 'LineString' ? source.geometry.coordinates : null;
  const key = tool && coords ? JSON.stringify([tool, coords]) : null;

  useEffect(() => {
    if (!tool || !coords || tool.kind === 'merge') return;
    const container = map.getContainer();
    const g = L.layerGroup().addTo(map);

    if (tool.kind === 'parallel') {
      const def = getObjectType(tool.typeId);
      const color = def?.color ?? '#ef3b3b';
      container.classList.add('tool-active');
      let side: 1 | -1 = 1;
      const render = () => {
        g.clearLayers();
        const line = offsetLine(coords, tool.distance, side);
        g.addLayer(L.polyline(line.map(toLL), { color: '#fff', weight: 7, opacity: 0.8, interactive: false }));
        g.addLayer(L.polyline(line.map(toLL), { color, weight: 4, dashArray: def?.dash ?? '8 6', interactive: false }));
        // Avstandsmarkører fra originalen til den nye linjen ved hvert knekkpunkt.
        for (let i = 0; i < coords.length; i++) {
          const n = nearestOnLine(line[i], coords);
          if (!n) continue;
          g.addLayer(L.polyline([toLL(n.point), toLL(line[i])], { color, weight: 1.5, dashArray: '3 4', interactive: false }));
        }
        const mid = Math.floor(line.length / 2);
        const a = line[Math.max(0, mid - 1)];
        const b = line[mid];
        g.addLayer(
          L.marker(toLL([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), { icon: LABEL_ANCHOR, interactive: false, keyboard: false }).bindTooltip(
            `${formatDistance(tool.distance)} fra linjen`,
            { permanent: true, direction: 'center', className: 'measure-label live' },
          ),
        );
      };
      const onMove = (e: L.LeafletMouseEvent) => {
        const n = nearestOnLine([e.latlng.lng, e.latlng.lat], coords);
        if (n && n.side !== side) {
          side = n.side;
          render();
        }
      };
      const onClick = () => {
        cb.current.onParallel(tool.typeId, { type: 'LineString', coordinates: offsetLine(coords, tool.distance, side) });
      };
      render();
      map.on('mousemove', onMove);
      map.on('click', onClick);
      return () => {
        container.classList.remove('tool-active');
        map.off('mousemove', onMove);
        map.off('click', onClick);
        g.remove();
      };
    }

    // Forleng: velg ende, tegn videre derfra.
    const def = getObjectType(source!.type);
    container.classList.add('tool-active');
    let assist: ReturnType<typeof createDrawAssist> | null = null;
    let drawing = false;
    let onCreate: ((e: { layer: L.Polyline }) => void) | null = null;
    const startFrom = (end: 'start' | 'end') => {
      drawing = true;
      g.clearLayers();
      container.classList.remove('tool-active');
      const anchor = end === 'end' ? coords[coords.length - 1] : coords[0];
      const before = end === 'end' ? coords[coords.length - 2] : coords[1];
      assist = createDrawAssist(map, 'Line', { before });
      map.pm.enableDraw('Line', {
        pathOptions: { color: def?.color, dashArray: def?.dash },
        templineStyle: { color: def?.color },
        hintlineStyle: { color: def?.color, dashArray: '5 5' },
        finishOn: 'dblclick',
        allowSelfIntersection: true,
      });
      assist.start();
      (map.pm.Draw as unknown as { Line: { _createVertex(e: { latlng: L.LatLng }): void } }).Line._createVertex({ latlng: L.latLng(anchor[1], anchor[0]) });
      onCreate = (e: { layer: L.Polyline }) => {
        const added = ((e.layer.toGeoJSON(7) as GeoJSON.Feature).geometry as unknown as { coordinates: Position[] }).coordinates;
        e.layer.remove();
        const merged = end === 'end' ? [...coords, ...added.slice(1)] : [...added.slice(1).reverse(), ...coords];
        cb.current.onExtend(source!.id, { type: 'LineString', coordinates: merged });
      };
      map.once('pm:create', onCreate as L.LeafletEventHandlerFn);
    };
    for (const end of ['start', 'end'] as const) {
      const p = end === 'end' ? coords[coords.length - 1] : coords[0];
      const m = L.marker(toLL(p), {
        icon: L.divIcon({ className: 'pin-wrap tool-handle', html: `<div class="handle rotate">${iconSvg('plus', 15, 2.5)}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] }),
        zIndexOffset: 2000,
        pmIgnore: true,
      } as L.MarkerOptions);
      m.bindTooltip('Forleng herfra', { direction: 'top', offset: [0, -14] });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        startFrom(end);
      });
      g.addLayer(m);
    }
    return () => {
      container.classList.remove('tool-active');
      if (onCreate) map.off('pm:create', onCreate as L.LeafletEventHandlerFn);
      if (drawing) map.pm.disableDraw();
      assist?.stop();
      g.remove();
    };
  }, [map, key]);

  return null;
}
