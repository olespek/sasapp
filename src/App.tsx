import { useCallback, useEffect, useRef, useState } from 'react';
import { getObjectType } from '../shared/catalog';
import { canEditPlan, ROLE_LABELS, type Access, type Activity, type Geometry, type Plan, type PlanObject, type Version } from '../shared/types';
import { ApiError, api, shareToken, subscribe } from './api';
import { Details } from './components/Details';
import { Login } from './components/Login';
import { Logo } from './components/Logo';
import { Icon } from './icons';
import { PasswordDialog } from './components/PasswordDialog';
import { Palette } from './components/Palette';
import { Sidebar, type Tab } from './components/Sidebar';
import { PlanMap, type MapApi } from './map/PlanMap';

type Toast = { id: number; text: string; error?: boolean };

export function App() {
  const [access, setAccess] = useState<Access | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      if (!me.user && !me.viaShare) {
        setNeedLogin(!shareToken);
        setLoadError(shareToken ? 'Delingslenken er ugyldig eller slått av.' : null);
        setAccess(null);
        return;
      }
      setAccess(me);
      setNeedLogin(false);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Kunne ikke laste');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) return <div className="center-screen"><div className="card"><h2>Sola Airshow – arenaplan</h2><p>{loadError}</p></div></div>;
  if (needLogin) return <Login onLoggedIn={load} />;
  if (!access) return <div className="center-screen muted">Laster …</div>;
  return <Planner initialAccess={access} onLoggedOut={load} />;
}

function Planner({ initialAccess, onLoggedOut }: { initialAccess: Access; onLoggedOut: () => void }) {
  const [access, setAccess] = useState(initialAccess);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [objects, setObjects] = useState<PlanObject[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draw, setDraw] = useState<{ type: string; model?: string } | null>(null);
  const [hiddenGroups, setHiddenGroups] = useState<Set<string>>(new Set());
  const [showLabels, setShowLabels] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<Version | null>(null);
  const [tab, setTab] = useState<Tab>('objects');
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 900);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const mapApi = useRef<MapApi | null>(null);

  const toast = useCallback((text: string, error = false) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 6000 : 3000);
  }, []);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401 && !access.viaShare) {
        onLoggedOut();
        return;
      }
      toast(err instanceof Error ? err.message : 'Noe gikk galt', true);
    },
    [toast, access.viaShare, onLoggedOut],
  );

  const reload = useCallback(async () => {
    try {
      const res = await api.plan();
      setPlan(res.plan);
      setObjects(res.objects);
      setAccess(res.access);
      if (res.access.user) setActivity(await api.activity());
    } catch (err) {
      fail(err);
    }
  }, [fail]);

  useEffect(() => {
    reload();
    return subscribe((e) => {
      if (e.kind === 'object-upsert') {
        setObjects((list) => {
          const i = list.findIndex((o) => o.id === e.object.id);
          if (i === -1) return [...list, e.object];
          const copy = list.slice();
          copy[i] = e.object;
          return copy;
        });
      } else if (e.kind === 'object-delete') {
        setObjects((list) => list.filter((o) => o.id !== e.id));
        setSelectedId((id) => (id === e.id ? null : id));
      } else if (e.kind === 'objects-reset') {
        reload();
      } else if (e.kind === 'plan') {
        setPlan(e.plan);
        setAccess((a) => ({ ...a, canEdit: canEditPlan(a.user, e.plan) }));
      } else if (e.kind === 'activity') {
        setActivity((list) => [e.activity, ...list].slice(0, 300));
      }
    }, reload);
  }, [reload]);

  const canEdit = access.canEdit && !viewingVersion;
  const editing = canEdit && editMode;

  useEffect(() => {
    if (!editing) setDraw(null);
  }, [editing]);

  const shownObjects = viewingVersion ? viewingVersion.objects : objects;
  const selected = shownObjects.find((o) => o.id === selectedId) ?? null;

  const upsertLocal = (o: PlanObject) => setObjects((list) => list.map((x) => (x.id === o.id ? o : x)));

  const onCreated = async (type: string, geometry: Geometry) => {
    const model = draw?.model;
    setDraw(null);
    try {
      const props = getObjectType(type)?.kind === 'aircraft' ? { aircraftModel: model, heading: 0 } : undefined;
      const created = await api.createObject({ type, name: '', geometry, props });
      setObjects((list) => (list.some((o) => o.id === created.id) ? list : [...list, created]));
      setSelectedId(created.id);
    } catch (err) {
      fail(err);
    }
  };

  const onGeometryChange = async (id: string, geometry: Geometry, heading?: number) => {
    const current = objects.find((o) => o.id === id);
    if (!current) return;
    upsertLocal({ ...current, geometry, props: heading !== undefined ? { ...current.props, heading } : current.props });
    try {
      upsertLocal(await api.updateObject(id, { geometry, ...(heading !== undefined ? { props: { heading } } : {}) }));
    } catch (err) {
      upsertLocal(current);
      fail(err);
    }
  };

  const onUpdate = async (id: string, patch: Parameters<typeof api.updateObject>[1]) => {
    try {
      upsertLocal(await api.updateObject(id, patch));
    } catch (err) {
      fail(err);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api.deleteObject(id);
      setObjects((list) => list.filter((o) => o.id !== id));
      setSelectedId(null);
    } catch (err) {
      fail(err);
    }
  };

  const focus = (id: string) => {
    setSelectedId(id);
    mapApi.current?.focus(id);
    if (window.innerWidth <= 900) setSidebarOpen(false);
  };

  const toggleLock = async () => {
    if (!plan) return;
    const locking = !plan.locked;
    if (locking && !confirm('Låse planen? Da kan bare administratorer gjøre endringer.')) return;
    try {
      setPlan(await api.setLocked(locking));
      toast(locking ? 'Planen er låst' : 'Planen er åpnet for redigering');
    } catch (err) {
      fail(err);
    }
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    onLoggedOut();
  };

  if (!plan) return <div className="center-screen muted">Laster plan …</div>;

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <header className="topbar">
        <button className="icon-btn" title="Meny" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Icon name="menu" size={20} />
        </button>
        <div className="brand">
          <Logo />
          <span className="brand-name">{plan.name}</span>
        </div>
        <span className={`badge ${plan.locked ? 'locked' : 'open'}`} title={plan.locked && plan.lockedBy ? `Låst av ${plan.lockedBy}` : undefined}>
          <Icon name={plan.locked ? 'lock' : 'lock-open'} size={12} strokeWidth={2.5} />
          {plan.locked ? 'Låst' : 'Åpen for redigering'}
        </span>
        <div className="spacer" />
        {access.canEdit && !viewingVersion && (
          <label className="switch" title="Slå på for å tegne og flytte objekter">
            <input type="checkbox" checked={editMode} onChange={(e) => setEditMode(e.target.checked)} />
            <span>Redigering</span>
          </label>
        )}
        {access.isAdmin && (
          <button className="btn" onClick={toggleLock}>
            {plan.locked ? 'Lås opp' : 'Lås plan'}
          </button>
        )}
        {access.user ? (
          <div className="user-menu">
            <details>
              <summary>
                <span className="avatar">{access.user.name.slice(0, 1).toUpperCase()}</span>
                <span className="user-name">{access.user.name}</span>
              </summary>
              <div className="menu">
                <div className="muted small">{ROLE_LABELS[access.user.role]}</div>
                <button onClick={() => setPasswordOpen(true)}>Bytt passord</button>
                <button onClick={logout}>Logg ut</button>
              </div>
            </details>
          </div>
        ) : (
          <span className="badge">Kun visning</span>
        )}
      </header>

      <Sidebar
        tab={tab}
        setTab={setTab}
        access={access}
        plan={plan}
        objects={shownObjects}
        activity={activity}
        selectedId={selectedId}
        hiddenGroups={hiddenGroups}
        setHiddenGroups={setHiddenGroups}
        showLabels={showLabels}
        setShowLabels={setShowLabels}
        viewingVersion={viewingVersion}
        setViewingVersion={(v) => {
          setViewingVersion(v);
          setSelectedId(null);
        }}
        onFocus={focus}
        mapApi={mapApi}
        toast={toast}
        fail={fail}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="map-area">
        <PlanMap
          plan={plan}
          objects={shownObjects}
          selectedId={selectedId}
          editable={editing}
          hiddenGroups={hiddenGroups}
          showLabels={showLabels}
          drawType={draw?.type ?? null}
          apiRef={mapApi}
          onSelect={setSelectedId}
          onGeometryChange={onGeometryChange}
          onCreated={onCreated}
          onDrawCancel={() => setDraw(null)}
        />

        <button className="map-btn home-btn" title="Til hovedområdet" onClick={() => mapApi.current?.flyHome()}>
          <Icon name="house" size={18} />
        </button>

        {viewingVersion && (
          <div className="banner">
            Viser versjon «{viewingVersion.name}» ({new Date(viewingVersion.createdAt).toLocaleString('nb-NO')}) – kun visning
            <button className="btn small" onClick={() => setViewingVersion(null)}>
              Tilbake til gjeldende plan
            </button>
          </div>
        )}
        {!viewingVersion && plan.locked && !access.isAdmin && access.user && access.user.role !== 'viewer' && (
          <div className="banner subtle">Planen er låst av {plan.lockedBy ?? 'administrator'}. Endringer er ikke mulig nå.</div>
        )}

        {editing && (
          <Palette
            open={paletteOpen}
            setOpen={setPaletteOpen}
            active={draw}
            onPick={(type, model) => {
              setSelectedId(null);
              setDraw(draw?.type === type && draw.model === model ? null : { type, model });
            }}
          />
        )}
        {draw && <DrawHint type={draw.type} onCancel={() => setDraw(null)} />}

        {selected && (
          <Details
            key={selected.id}
            object={selected}
            canEdit={editing}
            canEditAtAll={canEdit}
            onEnableEdit={() => setEditMode(true)}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onClose={() => setSelectedId(null)}
          />
        )}

        <div className="toasts">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
              {t.text}
            </div>
          ))}
        </div>
      </main>

      {passwordOpen && <PasswordDialog onClose={() => setPasswordOpen(false)} toast={toast} />}
    </div>
  );
}

function DrawHint({ type, onCancel }: { type: string; onCancel: () => void }) {
  const def = getObjectType(type);
  if (!def) return null;
  const text =
    def.kind === 'point'
      ? 'Klikk i kartet for å plassere.'
      : def.kind === 'aircraft'
        ? 'Klikk i kartet der flyet skal stå. Du kan rotere det etterpå.'
        : def.kind === 'line'
          ? 'Klikk for hvert knekkpunkt. Dobbeltklikk eller klikk på siste punkt for å avslutte.'
          : 'Klikk for hvert hjørne. Klikk på første punkt eller dobbeltklikk for å avslutte.';
  return (
    <div className="draw-hint">
      <b>{def.label}:</b> {text}
      <button className="btn small" onClick={onCancel}>
        Avbryt (Esc)
      </button>
    </div>
  );
}
