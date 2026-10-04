import { useEffect, useMemo, useState } from 'react';
import { AIRCRAFT, getAircraft } from '../../shared/aircraft';
import { GROUPS, OBJECT_TYPES, getObjectType, panelCount } from '../../shared/catalog';
import { formatLength, measure } from '../../shared/geo';
import { STATUSES, STATUS_COLORS, STATUS_LABELS, type Access, type Activity, type Plan, type PlanObject, type Status, type Version, type VersionSummary } from '../../shared/types';
import { api } from '../api';
import type { MapApi } from '../map/PlanMap';
import { AdminPanel } from './AdminPanel';
import { TypeSwatch } from './Palette';

export type Tab = 'objects' | 'summary' | 'layers' | 'activity' | 'versions' | 'admin';

interface Props {
  tab: Tab;
  setTab(t: Tab): void;
  access: Access;
  plan: Plan;
  objects: PlanObject[];
  activity: Activity[];
  selectedId: string | null;
  hiddenGroups: Set<string>;
  setHiddenGroups(s: Set<string>): void;
  showLabels: boolean;
  setShowLabels(b: boolean): void;
  viewingVersion: Version | null;
  setViewingVersion(v: Version | null): void;
  onFocus(id: string): void;
  mapApi: React.MutableRefObject<MapApi | null>;
  toast(text: string, error?: boolean): void;
  fail(err: unknown): void;
  onClose(): void;
}

export function Sidebar(props: Props) {
  const { tab, setTab, access } = props;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'objects', label: 'Objekter' },
    { id: 'summary', label: 'Oversikt' },
    { id: 'layers', label: 'Lag' },
    ...(access.user
      ? [
          { id: 'activity' as Tab, label: 'Logg' },
          { id: 'versions' as Tab, label: 'Versjoner' },
        ]
      : []),
    ...(access.isAdmin ? [{ id: 'admin' as Tab, label: 'Admin' }] : []),
  ];
  const current = tabs.some((t) => t.id === tab) ? tab : 'objects';

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <nav className="tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={current === t.id} className={current === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </nav>
        <button className="icon-btn sidebar-close" onClick={props.onClose} title="Lukk panel">
          ✕
        </button>
      </div>
      <div className="sidebar-body">
        {current === 'objects' && <ObjectList {...props} />}
        {current === 'summary' && <Summary objects={props.objects} onFocus={props.onFocus} />}
        {current === 'layers' && <Layers {...props} />}
        {current === 'activity' && <ActivityList activity={props.activity} objects={props.objects} onFocus={props.onFocus} />}
        {current === 'versions' && <Versions {...props} />}
        {current === 'admin' && <AdminPanel plan={props.plan} mapApi={props.mapApi} toast={props.toast} fail={props.fail} />}
      </div>
    </aside>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const isOverdue = (o: PlanObject) => !!o.props.dueDate && o.props.dueDate < today() && !['done', 'installed'].includes(o.props.status);

function label(o: PlanObject): string {
  if (o.name) return o.name;
  const spec = getAircraft(o.props.aircraftModel);
  return spec ? spec.name : (getObjectType(o.type)?.label ?? o.type);
}

// ---------- Objektliste ----------

type Sort = 'type' | 'name' | 'status' | 'due';

function ObjectList({ objects, selectedId, onFocus }: Props) {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('');
  const [status, setStatus] = useState<'' | Status | 'overdue' | 'open'>('');
  const [sort, setSort] = useState<Sort>('type');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const typeOrder = new Map(OBJECT_TYPES.map((t, i) => [t.id, i]));
    return objects
      .filter((o) => {
        const def = getObjectType(o.type);
        if (group && def?.group !== group) return false;
        if (status === 'overdue' && !isOverdue(o)) return false;
        if (status === 'open' && ['done', 'installed', 'confirmed'].includes(o.props.status)) return false;
        if (status && status !== 'overdue' && status !== 'open' && o.props.status !== status) return false;
        if (!needle) return true;
        return [o.name, def?.label, o.props.responsible, o.props.supplier, o.props.notes, getAircraft(o.props.aircraftModel)?.name]
          .filter(Boolean)
          .some((s) => s!.toLowerCase().includes(needle));
      })
      .sort((a, b) => {
        if (sort === 'name') return label(a).localeCompare(label(b), 'nb');
        if (sort === 'status') return STATUSES.indexOf(a.props.status) - STATUSES.indexOf(b.props.status);
        if (sort === 'due') return (a.props.dueDate ?? '9999').localeCompare(b.props.dueDate ?? '9999');
        return (typeOrder.get(a.type) ?? 999) - (typeOrder.get(b.type) ?? 999) || label(a).localeCompare(label(b), 'nb');
      });
  }, [objects, q, group, status, sort]);

  return (
    <div className="stack">
      <input type="search" placeholder="Søk i navn, ansvarlig, leverandør …" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row">
        <select value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="">Alle kategorier</option>
          {GROUPS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="">Alle statuser</option>
          <option value="open">Ikke bekreftet</option>
          <option value="overdue">Over frist</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="row between muted small">
        <span>
          {rows.length} av {objects.length} objekter
        </span>
        <label className="inline">
          Sorter
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="type">Type</option>
            <option value="name">Navn</option>
            <option value="status">Status</option>
            <option value="due">Frist</option>
          </select>
        </label>
      </div>
      {objects.length === 0 && <p className="muted">Ingen objekter ennå. Slå på «Redigering» øverst og velg fra «Legg til» i kartet.</p>}
      <ul className="obj-list">
        {rows.map((o) => {
          const def = getObjectType(o.type);
          return (
            <li key={o.id} className={o.id === selectedId ? 'selected' : ''} onClick={() => onFocus(o.id)}>
              {def && <TypeSwatch def={def} />}
              <div className="grow">
                <div className="obj-name">{label(o)}</div>
                <div className="muted small">
                  {def?.label}
                  {o.props.responsible && ` · ${o.props.responsible}`}
                  {o.props.quantity !== null && ` · ${o.props.quantity} stk`}
                </div>
              </div>
              <div className="obj-side">
                <span className="status-dot" style={{ background: STATUS_COLORS[o.props.status] }} title={STATUS_LABELS[o.props.status]} />
                {o.props.dueDate && <span className={`small ${isOverdue(o) ? 'overdue' : 'muted'}`}>{o.props.dueDate.slice(5).split('-').reverse().join('.')}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------- Oppsummering ----------

function Summary({ objects, onFocus }: { objects: PlanObject[]; onFocus(id: string): void }) {
  const byType = useMemo(() => {
    const map = new Map<string, { count: number; qty: number; length: number; area: number; panels: number }>();
    for (const o of objects) {
      const r = map.get(o.type) ?? { count: 0, qty: 0, length: 0, area: 0, panels: 0 };
      const m = measure(o.geometry);
      r.count++;
      r.qty += o.props.quantity ?? 1;
      if (o.geometry.type === 'LineString') {
        r.length += m.length ?? 0;
        r.panels += panelCount(getObjectType(o.type), m.length ?? 0) ?? 0;
      }
      if (o.geometry.type === 'Polygon') r.area += m.area ?? 0;
      map.set(o.type, r);
    }
    return map;
  }, [objects]);

  const statusCounts = STATUSES.map((s) => ({ s, n: objects.filter((o) => o.props.status === s).length }));
  const overdue = objects.filter(isOverdue);
  const aircraft = AIRCRAFT.map((a) => ({ a, n: objects.filter((o) => o.props.aircraftModel === a.id).length })).filter((x) => x.n > 0);

  return (
    <div className="stack">
      <h4>Status</h4>
      {objects.length > 0 ? (
        <>
          <div className="status-bar">
            {statusCounts
              .filter((x) => x.n > 0)
              .map((x) => (
                <span key={x.s} style={{ flex: x.n, background: STATUS_COLORS[x.s] }} title={`${STATUS_LABELS[x.s]}: ${x.n}`} />
              ))}
          </div>
          <div className="legend">
            {statusCounts
              .filter((x) => x.n > 0)
              .map((x) => (
                <span key={x.s}>
                  <span className="status-dot" style={{ background: STATUS_COLORS[x.s] }} /> {STATUS_LABELS[x.s]} {x.n}
                </span>
              ))}
          </div>
        </>
      ) : (
        <p className="muted">Ingen objekter ennå.</p>
      )}

      {overdue.length > 0 && (
        <>
          <h4 className="overdue">Over frist ({overdue.length})</h4>
          <ul className="plain">
            {overdue.map((o) => (
              <li key={o.id}>
                <a onClick={() => onFocus(o.id)}>{label(o)}</a> <span className="muted small">frist {o.props.dueDate}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {GROUPS.map((g) => {
        const types = OBJECT_TYPES.filter((t) => t.group === g.id && byType.has(t.id));
        if (types.length === 0) return null;
        return (
          <div key={g.id}>
            <h4>{g.label}</h4>
            <table className="summary">
              <tbody>
                {types.map((t) => {
                  const r = byType.get(t.id)!;
                  return (
                    <tr key={t.id}>
                      <td className="sw">
                        <TypeSwatch def={t} />
                      </td>
                      <td className="label">
                        {t.label}
                        {t.kind !== 'aircraft' && <span className="sub">{countLabel(t.kind, r.count)}</span>}
                      </td>
                      <td className="num">
                        {t.kind === 'point' ? `${r.qty} stk` : t.kind === 'line' ? formatLength(r.length) : t.kind === 'polygon' ? `${m2(r.area)} m²` : `${r.count} fly`}
                        {t.kind === 'polygon' && r.area >= 1000 && <span className="sub">{daa(r.area)} daa</span>}
                        {t.kind === 'line' && t.panelLength && <span className="sub">ca. {r.panels} elementer</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {aircraft.length > 0 && (
        <>
          <h4>Fly på static display</h4>
          <table className="summary">
            <tbody>
              {aircraft.map(({ a, n }) => (
                <tr key={a.id}>
                  <td className="label">
                    {a.name}
                    <span className="sub">{a.category}</span>
                  </td>
                  <td className="num">{n} stk</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <p className="muted small">For punkter brukes «Antall» hvis det er fylt ut, ellers teller hvert punkt som 1.</p>
    </div>
  );
}

const m2 = (v: number) => Math.round(v).toLocaleString('nb-NO');
const daa = (v: number) => (v / 1000).toLocaleString('nb-NO', { maximumFractionDigits: 1 });

function countLabel(kind: string, n: number): string {
  if (kind === 'polygon') return n === 1 ? '1 område' : `${n} områder`;
  if (kind === 'line') return n === 1 ? '1 strekning' : `${n} strekninger`;
  return n === 1 ? '1 punkt' : `${n} punkter`;
}

// ---------- Lag ----------

function Layers({ objects, hiddenGroups, setHiddenGroups, showLabels, setShowLabels }: Props) {
  const toggle = (id: string) => {
    const next = new Set(hiddenGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHiddenGroups(next);
  };
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
        Vis navn i kartet
      </label>
      <h4>Kategorier</h4>
      {GROUPS.map((g) => {
        const n = objects.filter((o) => getObjectType(o.type)?.group === g.id).length;
        return (
          <label key={g.id} className="check">
            <input type="checkbox" checked={!hiddenGroups.has(g.id)} onChange={() => toggle(g.id)} />
            <span className="grow">{g.label}</span>
            <span className="muted small">{n}</span>
          </label>
        );
      })}
      <div className="row">
        <button className="btn small" onClick={() => setHiddenGroups(new Set())}>
          Vis alle
        </button>
        <button className="btn small" onClick={() => setHiddenGroups(new Set(GROUPS.map((g) => g.id)))}>
          Skjul alle
        </button>
      </div>
      <p className="muted small">Bakgrunnskart (flyfoto, Kartverket, OpenStreetMap) velges med lagknappen øverst til høyre i kartet.</p>
    </div>
  );
}

// ---------- Aktivitet ----------

function ActivityList({ activity, objects, onFocus }: { activity: Activity[]; objects: PlanObject[]; onFocus(id: string): void }) {
  const exists = new Set(objects.map((o) => o.id));
  if (activity.length === 0) return <p className="muted">Ingen aktivitet ennå.</p>;
  return (
    <ul className="activity">
      {activity.map((a) => (
        <li key={a.id}>
          <div>
            {a.objectId && exists.has(a.objectId) ? <a onClick={() => onFocus(a.objectId!)}>{a.summary}</a> : a.summary}
          </div>
          <div className="muted small">
            {a.user ?? 'ukjent'} · {new Date(a.at).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------- Versjoner ----------

function Versions({ access, viewingVersion, setViewingVersion, toast, fail }: Props) {
  const [list, setList] = useState<VersionSummary[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => api.versions().then(setList).catch(fail);
  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createVersion(name.trim(), note.trim());
      setName('');
      setNote('');
      toast('Versjonen er lagret');
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const view = async (id: number) => {
    try {
      setViewingVersion(await api.version(id));
    } catch (err) {
      fail(err);
    }
  };

  const restore = async (v: VersionSummary) => {
    if (!confirm(`Gjenopprette «${v.name}»? Dagens plan erstattes, men lagres først automatisk som egen versjon.`)) return;
    try {
      await api.restoreVersion(v.id);
      setViewingVersion(null);
      toast('Versjonen er gjenopprettet');
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (v: VersionSummary) => {
    if (!confirm(`Slette versjonen «${v.name}»?`)) return;
    try {
      await api.deleteVersion(v.id);
      if (viewingVersion?.id === v.id) setViewingVersion(null);
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <div className="stack">
      <p className="muted small">
        En versjon er et øyeblikksbilde av hele planen, f.eks. det som ble sendt til politi eller brannvesen. Den kan vises og gjenopprettes senere.
      </p>
      {access.canEdit && (
        <form className="stack card-inset" onSubmit={create}>
          <input placeholder="Navn, f.eks. «Rev. B – sendt brannvesenet»" value={name} onChange={(e) => setName(e.target.value)} />
          <textarea rows={2} placeholder="Notat (valgfritt)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn primary" disabled={!name.trim()}>
            Lagre versjon av planen nå
          </button>
        </form>
      )}
      {list.length === 0 && <p className="muted">Ingen versjoner lagret.</p>}
      <ul className="versions">
        {list.map((v) => (
          <li key={v.id} className={viewingVersion?.id === v.id ? 'selected' : ''}>
            <div className="obj-name">{v.name}</div>
            <div className="muted small">
              {new Date(v.createdAt).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })} · {v.createdBy ?? 'ukjent'} · {v.objectCount} objekter
            </div>
            {v.note && <div className="small">{v.note}</div>}
            <div className="row">
              {viewingVersion?.id === v.id ? (
                <button className="btn small" onClick={() => setViewingVersion(null)}>
                  Lukk visning
                </button>
              ) : (
                <button className="btn small" onClick={() => view(v.id)}>
                  Vis i kartet
                </button>
              )}
              {access.isAdmin && (
                <>
                  <button className="btn small" onClick={() => restore(v)}>
                    Gjenopprett
                  </button>
                  <button className="btn small danger" onClick={() => remove(v)}>
                    Slett
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
