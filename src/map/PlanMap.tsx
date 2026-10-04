import { useEffect, useRef, useState } from 'react';
import { LayersControl, MapContainer, ScaleControl, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { getObjectType } from '../../shared/catalog';
import type { Geometry, Plan, PlanObject } from '../../shared/types';
import { MeasureControl } from './MeasureControl';
import { PlanLayer, pinIcon } from './planLayer';
import { Icon } from '../icons';

export interface MapApi {
  focus(id: string): void;
  getView(): { center: [number, number]; zoom: number };
  flyHome(): void;
}

interface Props {
  plan: Plan;
  objects: PlanObject[];
  selectedId: string | null;
  editable: boolean;
  hiddenGroups: Set<string>;
  showLabels: boolean;
  drawType: string | null;
  apiRef: React.MutableRefObject<MapApi | null>;
  onSelect(id: string | null): void;
  onGeometryChange(id: string, geometry: Geometry, heading?: number): void;
  onCreated(type: string, geometry: Geometry): void;
  onDrawCancel(): void;
}

const BASE_KEY = 'sasapp.baselayer';

const BASE_LAYERS = [
  {
    name: 'Flyfoto',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Flyfoto © Esri, Maxar, Earthstar Geographics',
    maxNativeZoom: 19,
  },
  {
    name: 'Kartverket topografisk',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png',
    attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
    maxNativeZoom: 18,
  },
  {
    name: 'Kartverket gråtone',
    url: 'https://cache.kartverket.no/v1/wmts/1.0.0/topograatone/default/webmercator/{z}/{y}/{x}.png',
    attribution: '© <a href="https://www.kartverket.no/">Kartverket</a>',
    maxNativeZoom: 18,
  },
  {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragsytere',
    maxNativeZoom: 19,
  },
];

function storedBase(): string {
  try {
    return localStorage.getItem(BASE_KEY) ?? BASE_LAYERS[0].name;
  } catch {
    return BASE_LAYERS[0].name;
  }
}

export function PlanMap(props: Props) {
  const [initialBase] = useState(storedBase);
  return (
    <MapContainer
      center={props.plan.center}
      zoom={props.plan.zoom}
      maxZoom={22}
      zoomControl={false}
      className="map"
      doubleClickZoom={false}
    >
      <LayersControl position="topright">
        {BASE_LAYERS.map((b) => (
          <LayersControl.BaseLayer key={b.name} name={b.name} checked={b.name === initialBase}>
            <TileLayer url={b.url} attribution={b.attribution} maxNativeZoom={b.maxNativeZoom} maxZoom={22} />
          </LayersControl.BaseLayer>
        ))}
      </LayersControl>
      <ScaleControl position="bottomleft" imperial={false} />
      <Controller {...props} />
    </MapContainer>
  );
}

function Controller(props: Props) {
  const map = useMap();
  const layerRef = useRef<PlanLayer | null>(null);
  const cbRef = useRef(props);
  cbRef.current = props;

  // Opprett laget én gang.
  useEffect(() => {
    const zoom = L.control.zoom({ position: 'topright', zoomInTitle: 'Zoom inn', zoomOutTitle: 'Zoom ut' }).addTo(map);
    map.pm.setLang('no');
    map.pm.setGlobalOptions({ snappable: true, snapDistance: 15 });
    const layer = new PlanLayer(map, {
      onSelect: (id) => cbRef.current.onSelect(id),
      onGeometryChange: (id, g, h) => cbRef.current.onGeometryChange(id, g, h),
    });
    layerRef.current = layer;
    const onBase = (e: L.LayersControlEvent) => {
      try {
        localStorage.setItem(BASE_KEY, e.name);
      } catch {
        /* ignorer */
      }
    };
    const onClick = () => {
      if (!cbRef.current.drawType) cbRef.current.onSelect(null);
    };
    map.on('baselayerchange', onBase as L.LeafletEventHandlerFn);
    map.on('click', onClick);
    // Leaflet merker ikke selv at kartet får ny størrelse (f.eks. når sidepanelet lukkes).
    const resize = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resize.observe(map.getContainer());
    return () => {
      resize.disconnect();
      map.off('baselayerchange', onBase as L.LeafletEventHandlerFn);
      map.off('click', onClick);
      zoom.remove();
      layer.destroy();
    };
  }, [map]);

  useEffect(() => {
    props.apiRef.current = {
      focus: (id) => layerRef.current?.focus(id),
      getView: () => {
        const c = map.getCenter();
        return { center: [Math.round(c.lat * 1e6) / 1e6, Math.round(c.lng * 1e6) / 1e6], zoom: map.getZoom() };
      },
      flyHome: () => map.flyTo(cbRef.current.plan.center, cbRef.current.plan.zoom),
    };
  }, [map, props.apiRef]);

  useEffect(() => layerRef.current?.setObjects(props.objects), [props.objects]);
  useEffect(() => layerRef.current?.setSelected(props.selectedId), [props.selectedId]);
  useEffect(() => layerRef.current?.setEditable(props.editable), [props.editable]);
  useEffect(() => layerRef.current?.setHiddenGroups(props.hiddenGroups), [props.hiddenGroups]);
  useEffect(() => layerRef.current?.setShowLabels(props.showLabels), [props.showLabels]);

  // Tegnemodus.
  useEffect(() => {
    const type = props.drawType;
    const def = type ? getObjectType(type) : undefined;
    if (!type || !def) return;

    const container = map.getContainer();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cbRef.current.onDrawCancel();
    };
    document.addEventListener('keydown', onKey);

    if (def.kind === 'aircraft') {
      container.classList.add('placing');
      const onClick = (e: L.LeafletMouseEvent) => {
        cbRef.current.onCreated(type, { type: 'Point', coordinates: [e.latlng.lng, e.latlng.lat] });
      };
      map.once('click', onClick);
      return () => {
        container.classList.remove('placing');
        map.off('click', onClick);
        document.removeEventListener('keydown', onKey);
      };
    }

    const pathOptions = { color: def.color, fillColor: def.color, fillOpacity: 0.25, dashArray: def.dash };
    const onCreate = (e: { layer: L.Layer }) => {
      const geometry = ((e.layer as L.Polyline | L.Marker).toGeoJSON(7) as GeoJSON.Feature).geometry as Geometry;
      e.layer.remove();
      cbRef.current.onCreated(type, geometry);
    };
    map.on('pm:create', onCreate as L.LeafletEventHandlerFn);
    if (def.kind === 'point') {
      map.pm.enableDraw('Marker', { markerStyle: { icon: pinIcon(def, null, false) }, continueDrawing: false });
    } else {
      map.pm.enableDraw(def.kind === 'line' ? 'Line' : 'Polygon', {
        pathOptions,
        templineStyle: { color: def.color },
        hintlineStyle: { color: def.color, dashArray: '5 5' },
        finishOn: 'dblclick',
        allowSelfIntersection: true,
      });
    }
    return () => {
      map.off('pm:create', onCreate as L.LeafletEventHandlerFn);
      map.pm.disableDraw();
      document.removeEventListener('keydown', onKey);
    };
  }, [map, props.drawType]);

  return (
    <>
      <LocateControl />
      <MeasureControl disabled={!!props.drawType} />
    </>
  );
}

/** Viser egen GPS-posisjon, nyttig ute på området. */
function LocateControl() {
  const map = useMap();
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) L.DomEvent.disableClickPropagation(ref.current);
  }, []);

  useEffect(() => {
    if (!on) return;
    const circle = L.circle([0, 0], { radius: 1, color: '#2563eb', weight: 1, fillOpacity: 0.15, interactive: false });
    const dot = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 2, fillColor: '#2563eb', fillOpacity: 1, interactive: false });
    let first = true;
    const onFound = (e: L.LocationEvent) => {
      circle.setLatLng(e.latlng).setRadius(e.accuracy).addTo(map);
      dot.setLatLng(e.latlng).addTo(map);
      if (first) map.setView(e.latlng, Math.max(map.getZoom(), 18));
      first = false;
      setError(null);
    };
    const onError = (e: L.ErrorEvent) => setError(e.message || 'Fant ikke posisjonen');
    map.on('locationfound', onFound);
    map.on('locationerror', onError);
    map.locate({ watch: true, enableHighAccuracy: true });
    return () => {
      map.stopLocate();
      map.off('locationfound', onFound);
      map.off('locationerror', onError);
      circle.remove();
      dot.remove();
    };
  }, [map, on]);

  return (
    <div className="locate" ref={ref}>
      <button className={`map-btn ${on ? 'active' : ''}`} title="Vis min posisjon" onClick={() => setOn(!on)}>
        <Icon name="locate-fixed" size={18} />
      </button>
      {error && on && <div className="locate-error">{error}</div>}
    </div>
  );
}
