import { useEffect, useState } from 'react';
import { ROLES, ROLE_LABELS, type Plan, type Role, type ShareSettings, type User } from '../../shared/types';
import { api, shareUrl } from '../api';
import type { MapApi } from '../map/PlanMap';

interface Props {
  plan: Plan;
  mapApi: React.MutableRefObject<MapApi | null>;
  toast(text: string, error?: boolean): void;
  fail(err: unknown): void;
}

export function AdminPanel({ plan, mapApi, toast, fail }: Props) {
  return (
    <div className="stack">
      <PlanSettings plan={plan} mapApi={mapApi} toast={toast} fail={fail} />
      <ShareSettingsBox toast={toast} fail={fail} />
      <Users toast={toast} fail={fail} />
    </div>
  );
}

function PlanSettings({ plan, mapApi, toast, fail }: Props) {
  const [name, setName] = useState(plan.name);
  useEffect(() => setName(plan.name), [plan.name]);

  const saveName = async () => {
    if (!name.trim() || name === plan.name) return;
    try {
      await api.updatePlan({ name: name.trim() });
      toast('Navnet er lagret');
    } catch (err) {
      fail(err);
    }
  };

  const saveView = async () => {
    const view = mapApi.current?.getView();
    if (!view) return;
    try {
      await api.updatePlan(view);
      toast('Startvisningen er lagret');
    } catch (err) {
      fail(err);
    }
  };

  return (
    <section className="admin-section">
      <h4>Plan</h4>
      <label className="field">
        <span>Navn</span>
        <div className="row">
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn small" onClick={saveName} disabled={!name.trim() || name === plan.name}>
            Lagre
          </button>
        </div>
      </label>
      <p className="muted small">
        Startvisning: det kartutsnittet alle ser når de åpner planen, og som ⌂-knappen går tilbake til. Flytt og zoom kartet dit du vil ha det, og trykk på knappen.
      </p>
      <button className="btn" onClick={saveView}>
        Bruk dagens kartutsnitt som startvisning
      </button>
    </section>
  );
}

function ShareSettingsBox({ toast, fail }: Pick<Props, 'toast' | 'fail'>) {
  const [share, setShare] = useState<ShareSettings | null>(null);
  useEffect(() => {
    api.share().then(setShare).catch(fail);
  }, [fail]);

  const update = async (patch: { enabled?: boolean; regenerate?: boolean }) => {
    try {
      setShare(await api.updateShare(patch));
    } catch (err) {
      fail(err);
    }
  };

  const copy = async () => {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(shareUrl(share.token));
      toast('Lenken er kopiert');
    } catch {
      toast('Kunne ikke kopiere – merk og kopier lenken manuelt', true);
    }
  };

  return (
    <section className="admin-section">
      <h4>Delingslenke (lesetilgang uten innlogging)</h4>
      {share && (
        <>
          <label className="check">
            <input type="checkbox" checked={share.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
            Delingslenken er {share.enabled ? 'på' : 'av'}
          </label>
          {share.enabled && (
            <>
              <input readOnly value={shareUrl(share.token)} onFocus={(e) => e.target.select()} />
              <div className="row">
                <button className="btn small" onClick={copy}>
                  Kopier lenke
                </button>
                <button
                  className="btn small"
                  onClick={() => confirm('Lage ny lenke? Den gamle slutter å virke umiddelbart.') && update({ regenerate: true })}
                >
                  Lag ny lenke
                </button>
              </div>
            </>
          )}
          <p className="muted small">
            Alle med lenken kan se kartet og objektlisten, inkludert ansvarlig, leverandør og notater, men kan ikke endre noe. Logg og versjoner vises ikke. Har lenken kommet på avveie, lag en ny.
          </p>
        </>
      )}
    </section>
  );
}

function Users({ toast, fail }: Pick<Props, 'toast' | 'fail'>) {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ username: '', name: '', role: 'editor' as Role, password: '' });

  const refresh = () => api.users().then(setUsers).catch(fail);
  useEffect(() => {
    refresh();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createUser(form);
      toast(`Opprettet ${form.name || form.username}`);
      setForm({ username: '', name: '', role: 'editor', password: '' });
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  const setRole = async (u: User, role: Role) => {
    try {
      await api.updateUser(u.id, { role });
      refresh();
    } catch (err) {
      fail(err);
      refresh();
    }
  };

  const resetPassword = async (u: User) => {
    const pw = prompt(`Nytt passord for ${u.name} (minst 8 tegn):`);
    if (!pw) return;
    try {
      await api.updateUser(u.id, { password: pw });
      toast('Passordet er endret');
    } catch (err) {
      fail(err);
    }
  };

  const remove = async (u: User) => {
    if (!confirm(`Slette brukeren ${u.name}?`)) return;
    try {
      await api.deleteUser(u.id);
      refresh();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <section className="admin-section">
      <h4>Brukere</h4>
      <p className="muted small">
        <b>Leser</b> kan se alt. <b>Redaktør</b> kan redigere når planen er åpen. <b>Administrator</b> kan alltid redigere, låse planen og styre brukere.
      </p>
      <ul className="users">
        {users.map((u) => (
          <li key={u.id}>
            <div className="grow">
              <div className="obj-name">{u.name}</div>
              <div className="muted small">{u.username}</div>
            </div>
            <select value={u.role} onChange={(e) => setRole(u, e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
            <button className="icon-btn" title="Sett nytt passord" onClick={() => resetPassword(u)}>
              🔑
            </button>
            <button className="icon-btn" title="Slett bruker" onClick={() => remove(u)}>
              🗑
            </button>
          </li>
        ))}
      </ul>
      <form className="stack card-inset" onSubmit={create}>
        <b className="small">Ny bruker</b>
        <input placeholder="Fullt navn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Brukernavn" autoComplete="off" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input placeholder="Passord (minst 8 tegn)" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <button className="btn primary" disabled={!form.username || form.password.length < 8}>
          Opprett bruker
        </button>
      </form>
    </section>
  );
}
