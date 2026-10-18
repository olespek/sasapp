import { useCallback, useEffect, useRef, useState } from 'react';
import { getObjectType } from '../shared/catalog';
import { canEditPlan, ROLE_LABELS, type Access, type Activity, type Geometry, type Plan, type PlanObject, type Presence, type Version } from '../shared/types';
import { ApiError, api, shareToken, subscribe } from './api';
import { Details } from './components/Details';
import { Login } from './components/Login';
import { Logo } from './components/Logo';
import { Icon } from './icons';
import { PasswordDialog } from './components/PasswordDialog';
import { Palette } from './components/Palette';
import { Sidebar, type Tab } from './components/Sidebar';
import { PlanMap, type MapApi } from './map/PlanMap';
import type { LineTool } from './map/LineTools';
import { HistoryConflict, checkConflicts, fieldsOf, perform, type HistoryAction, type HistoryEntry } from './history';
import { mergeLines } from '../shared/geo';

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
  // Andre innloggede brukeres musepeker og valg. Bare på PC med mus, og ikke via delingslenken.
  const [presences, setPresences] = useState<Presence[]>([]);
  const presenceOn = !!initialAccess.user && !initialAccess.viaShare && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [draw, setDraw] = useState<{ type: string; model?: string } | null>(null);
  const [lineTool, setLineTool] = useState<LineTool | null>(null);
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [historyBusy, setHistoryBusy] = useState(false);
  const objectsRef = useRef<PlanObject[]>([]);
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
      } else if (e.kind === 'presence-all') {
        setPresences(e.presences);
      } else if (e.kind === 'presence') {
        setPresences((list) => [...list.filter((p) => p.id !== e.presence.id), e.presence]);
      } else if (e.kind === 'presence-leave') {
        setPresences((list) => list.filter((p) => p.id !== e.id));
      }
    }, reload);
  }, [reload]);

  const canEdit = access.canEdit && !viewingVersion;
  const editing = canEdit && editMode;

  useEffect(() => {
    if (!editing) {
      setDraw(null);
      setLineTool(null);
    }
  }, [editing]);

  // Hurtigtaster: Ctrl/⌘+Z angrer, Ctrl/⌘+Shift+Z eller Ctrl+Y gjør om. Under tegning fjerner
  // Ctrl/⌘+Z og Backspace siste punkt i stedet.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if ((mod && key === 'z' && !e.shiftKey) || (!mod && e.key === 'Backspace')) {
        if (mapApi.current?.removeLastVertex()) {
          e.preventDefault();
          return;
        }
        if (e.key === 'Backspace') return;
        e.preventDefault();
        runHistory('undo');
      } else if (mod && ((key === 'z' && e.shiftKey) || key === 'y')) {
        e.preventDefault();
        runHistory('redo');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    if (!lineTool) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLineTool(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lineTool]);

  const shownObjects = viewingVersion ? viewingVersion.objects : objects;
  const selected = shownObjects.find((o) => o.id === selectedId) ?? null;

  const upsertLocal = (o: PlanObject) => setObjects((list) => list.map((x) => (x.id === o.id ? o : x)));
  objectsRef.current = objects;

  /** Legg en endring i angre-historikken. actions er det som skal til for å angre den. */
  const record = (label: string, actions: HistoryAction[]) => {
    setUndoStack((s) => [...s.slice(-99), { label, actions }]);
    setRedoStack([]);
  };
  const labelOf = (o: Pick<PlanObject, 'name' | 'type'>) => o.name || getObjectType(o.type)?.label || 'objekt';

  const runHistory = async (from: 'undo' | 'redo') => {
    const stack = from === 'undo' ? undoStack : redoStack;
    const entry = stack[stack.length - 1];
    if (!entry || historyBusy) return;
    setHistoryBusy(true);
    const pop = () => (from === 'undo' ? setUndoStack : setRedoStack)((s) => s.slice(0, -1));
    try {
      checkConflicts(entry.actions, objectsRef.current);
      const inverses: HistoryAction[] = [];
      let current = objectsRef.current;
      for (const a of entry.actions) {
        const { inverse, result, removedId } = await perform(a, current);
        inverses.unshift(inverse);
        if (removedId) current = current.filter((o) => o.id !== removedId);
        if (result) current = current.some((o) => o.id === result.id) ? current.map((o) => (o.id === result.id ? result : o)) : [...current, result];
      }
      setObjects(current);
      pop();
      (from === 'undo' ? setRedoStack : setUndoStack)((s) => [...s, { label: entry.label, actions: inverses }]);
      toast(`${from === 'undo' ? 'Angret' : 'Gjort om'}: ${entry.label}`);
    } catch (err) {
      if (err instanceof HistoryConflict) {
        pop();
        toast(`Kan ikke ${from === 'undo' ? 'angre' : 'gjøre om'}: ${err.message}`, true);
      } else fail(err);
    } finally {
      setHistoryBusy(false);
    }
  };

  const onCreated = async (type: string, geometry: Geometry) => {
    const model = draw?.model;
    setDraw(null);
    try {
      const props = getObjectType(type)?.kind === 'aircraft' ? { aircraftModel: model, heading: 0 } : undefined;
      const created = await api.createObject({ type, name: '', geometry, props });
      setObjects((list) => (list.some((o) => o.id === created.id) ? list : [...list, created]));
      setSelectedId(created.id);
      record(`La til ${labelOf(created)}`, [{ do: 'delete', obj: created }]);
    } catch (err) {
      fail(err);
    }
  };

  const onGeometryChange = async (id: string, geometry: Geometry, heading?: number) => {
    const current = objects.find((o) => o.id === id);
    if (!current) return;
    upsertLocal({ ...current, geometry, props: heading !== undefined ? { ...current.props, heading } : current.props });
    try {
      const after = await api.updateObject(id, { geometry, ...(heading !== undefined ? { props: { heading } } : {}) });
      upsertLocal(after);
      record(`${heading !== undefined ? 'Flyttet/rotert' : 'Endret form på'} ${labelOf(after)}`, [{ do: 'patch', id, to: fieldsOf(current), expectUpdatedAt: after.updatedAt }]);
      return after;
    } catch (err) {
      upsertLocal(current);
      fail(err);
    }
  };

  const onParallel = async (typeId: string, geometry: Geometry) => {
    setLineTool(null);
    try {
      const created = await api.createObject({ type: typeId, name: '', geometry });
      setObjects((list) => (list.some((o) => o.id === created.id) ? list : [...list, created]));
      setSelectedId(created.id);
      record(`Laget parallell linje (${labelOf(created)})`, [{ do: 'delete', obj: created }]);
      toast('Parallell linje er laget');
    } catch (err) {
      fail(err);
    }
  };

  const onExtend = async (id: string, geometry: Geometry) => {
    setLineTool(null);
    await onGeometryChange(id, geometry);
    setSelectedId(id);
  };

  /** Klikk på en annen linje mens «Slå sammen» er aktivt. */
  const onMergeWith = async (sourceId: string, targetId: string) => {
    const a = objects.find((o) => o.id === sourceId);
    const b = objects.find((o) => o.id === targetId);
    if (!a || !b || a.geometry.type !== 'LineString' || b.geometry.type !== 'LineString') {
      toast('Velg en linje å slå sammen med', true);
      return;
    }
    const nameA = a.name || getObjectType(a.type)?.label;
    const nameB = b.name || getObjectType(b.type)?.label;
    if (!confirm(`Slå sammen «${nameA}» og «${nameB}» til én linje? «${nameB}» slettes, og den nye linjen beholder typen og detaljene til «${nameA}».`)) return;
    setLineTool(null);
    try {
      const geometry: Geometry = { type: 'LineString', coordinates: mergeLines(a.geometry.coordinates, b.geometry.coordinates) };
      const after = await api.updateObject(a.id, { geometry });
      upsertLocal(after);
      await api.deleteObject(b.id);
      record(`Slo sammen ${labelOf(a)} og ${labelOf(b)}`, [
        { do: 'restore', obj: b },
        { do: 'patch', id: a.id, to: fieldsOf(a), expectUpdatedAt: after.updatedAt },
      ]);
      setObjects((list) => list.filter((o) => o.id !== b.id));
      setSelectedId(a.id);
      toast('Linjene er slått sammen');
    } catch (err) {
      fail(err);
    }
  };

  const onMapSelect = (id: string | null) => {
    if (lineTool?.kind === 'merge') {
      if (id && id !== lineTool.sourceId) onMergeWith(lineTool.sourceId, id);
      return;
    }
    if (lineTool) return;
    setSelectedId(id);
  };

  const onUpdate = async (id: string, patch: Parameters<typeof api.updateObject>[1]) => {
    const before = objectsRef.current.find((o) => o.id === id);
    try {
      const after = await api.updateObject(id, patch);
      upsertLocal(after);
      if (before) record(`Endret ${labelOf(after)}`, [{ do: 'patch', id, to: fieldsOf(before), expectUpdatedAt: after.updatedAt }]);
    } catch (err) {
      fail(err);
    }
  };

  const onDelete = async (id: string) => {
    const before = objectsRef.current.find((o) => o.id === id);
    try {
      await api.deleteObject(id);
      if (before) record(`Slettet ${labelOf(before)}`, [{ do: 'restore', obj: before }]);
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
        {editing && (
          <div className="history-btns">
            <button
              className="icon-btn"
              disabled={!undoStack.length || historyBusy}
              title={undoStack.length ? `Angre: ${undoStack[undoStack.length - 1].label} (Ctrl/⌘+Z)` : 'Ingenting å angre'}
              onClick={() => runHistory('undo')}
            >
              <Icon name="undo-2" size={18} />
            </button>
            <button
              className="icon-btn"
              disabled={!redoStack.length || historyBusy}
              title={redoStack.length ? `Gjør om: ${redoStack[redoStack.length - 1].label} (Ctrl/⌘+Shift+Z)` : 'Ingenting å gjøre om'}
              onClick={() => runHistory('redo')}
            >
              <Icon name="redo-2" size={18} />
            </button>
          </div>
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
          onSelect={onMapSelect}
          onGeometryChange={onGeometryChange}
          onCreated={onCreated}
          onDrawCancel={() => setDraw(null)}
          lineTool={lineTool}
          onParallel={onParallel}
          onExtend={onExtend}
          others={presenceOn ? presences.filter((p) => p.id !== access.user?.id) : null}
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
        {lineTool && <LineToolHint tool={lineTool} onCancel={() => setLineTool(null)} />}

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
            onStartTool={(t) => {
              setDraw(null);
              setLineTool(t);
            }}
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

function LineToolHint({ tool, onCancel }: { tool: LineTool; onCancel: () => void }) {
  const text =
    tool.kind === 'parallel'
      ? `Parallell linje ${tool.distance.toLocaleString('nb-NO')} m: flytt musen til siden linjen skal ligge på, og klikk for å lage den.`
      : tool.kind === 'extend'
        ? 'Forleng: klikk på enden (+) du vil fortsette fra, og tegn videre. Shift: 45°/90°. Alt/Option: avstand. Dobbeltklikk for å avslutte.'
        : 'Slå sammen: klikk på linjen som skal slås sammen med denne.';
  return (
    <div className="draw-hint">
      {text}
      <button className="btn small" onClick={onCancel}>
        Avbryt (Esc)
      </button>
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
          ? 'Klikk for hvert knekkpunkt. Shift: 45°/90°. Alt/Option: avstand. Backspace: angre punkt. Dobbeltklikk for å avslutte.'
          : 'Klikk og dra for et rettvinklet område (Shift: kvadrat), eller klikk for hvert hjørne. Shift: 45°/90°. Alt/Option: avstand. Backspace: angre punkt. Klikk på første punkt for å avslutte.';
  return (
    <div className="draw-hint">
      <b>{def.label}:</b> {text}
      <button className="btn small" onClick={onCancel}>
        Avbryt (Esc)
      </button>
    </div>
  );
}
