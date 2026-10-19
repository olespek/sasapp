import { useState } from 'react';
import { getObjectType } from '../../shared/catalog';
import type { Access, Activity, Note, Plan, PlanObject, User, Version } from '../../shared/types';
import { Icon } from '../icons';
import { Notes, timeAgo } from './Notes';
import { ActivityList, Summary, Versions, isOverdue } from './Sidebar';

interface Props {
  access: Access & { user: User };
  plan: Plan;
  objects: PlanObject[];
  activity: Activity[];
  notes: Note[];
  viewingVersion: Version | null;
  setViewingVersion(v: Version | null): void;
  onNoteChange(note: Note): void;
  onNoteDelete(id: number): void;
  /** Viser objektet i kartet. */
  onFocus(id: string): void;
  onOpenMap(): void;
  toast(text: string, error?: boolean): void;
  fail(err: unknown): void;
}

const ACTIVITY_STEP = 15;

/** Startsiden etter innlogging: notater, oversikt, siste endringer og versjoner i fullskjerm. */
export function Dashboard(props: Props) {
  const { access, plan, objects, activity, notes } = props;
  const [activityShown, setActivityShown] = useState(ACTIVITY_STEP);

  const aircraft = objects.filter((o) => getObjectType(o.type)?.kind === 'aircraft').length;
  const openTodos = notes.filter((n) => n.kind === 'todo' && !n.done).length;
  const overdue = objects.filter(isOverdue).length;
  const lastChange = activity[0];
  const firstName = access.user.name.trim().split(/\s+/)[0];

  return (
    <div className="dashboard">
      <div className="dash-inner">
        <div className="dash-head">
          <div>
            <h1>Hei, {firstName}</h1>
            <p className="muted">
              {plan.name}
              {lastChange && ` · sist endret ${timeAgo(lastChange.at)} av ${lastChange.user ?? 'ukjent'}`}
            </p>
          </div>
          <button className="btn primary" onClick={props.onOpenMap}>
            <Icon name="map" size={16} /> Åpne kartet
          </button>
        </div>

        <div className="stat-row">
          <Stat label="Objekter i planen" value={objects.length - aircraft} />
          <Stat label="Fly" value={aircraft} />
          <Stat label="Må gjøres" value={openTodos} accent={openTodos > 0} />
          {overdue > 0 && <Stat label="Over frist" value={overdue} accent />}
          <div className="stat">
            <span className="stat-value small-value">
              <Icon name={plan.locked ? 'lock' : 'lock-open'} size={18} /> {plan.locked ? 'Stengt' : 'Åpen'}
            </span>
            <span className="stat-label">{plan.locked ? `Stengt av ${plan.lockedBy ?? 'administrator'}` : 'Planen kan redigeres'}</span>
          </div>
        </div>

        <div className="dash-grid">
          <section className="dash-card dash-notes">
            <h2>
              <Icon name="sticky-note" size={18} /> Notater til neste mann
            </h2>
            <Notes notes={notes} user={access.user} onChange={props.onNoteChange} onDelete={props.onNoteDelete} fail={props.fail} />
          </section>

          <section className="dash-card">
            <h2>Oversikt</h2>
            <Summary objects={objects} onFocus={props.onFocus} />
          </section>

          <div className="dash-col">
            <section className="dash-card">
              <h2>Siste endringer</h2>
              <ActivityList activity={activity} objects={objects} onFocus={props.onFocus} limit={activityShown} />
              {activity.length > activityShown && (
                <button className="btn small" onClick={() => setActivityShown((n) => n + ACTIVITY_STEP * 2)}>
                  Vis flere
                </button>
              )}
            </section>
            <section className="dash-card">
              <h2>Versjoner</h2>
              <Versions
                access={access}
                viewingVersion={props.viewingVersion}
                setViewingVersion={props.setViewingVersion}
                toast={props.toast}
                fail={props.fail}
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`stat ${accent ? 'accent' : ''}`}>
      <span className="stat-value">{value.toLocaleString('nb-NO')}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}
