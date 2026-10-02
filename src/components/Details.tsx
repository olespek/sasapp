import { useEffect, useState } from 'react';
import { AIRCRAFT, getAircraft } from '../../shared/aircraft';
import { OBJECT_TYPES, getObjectType } from '../../shared/catalog';
import { formatArea, formatLength, measure } from '../../shared/geo';
import { STATUSES, STATUS_COLORS, STATUS_LABELS, type ObjectProps, type PlanObject } from '../../shared/types';
import type { api } from '../api';
import { TypeSwatch } from './Palette';

interface Props {
  object: PlanObject;
  canEdit: boolean;
  canEditAtAll: boolean;
  onEnableEdit(): void;
  onUpdate(id: string, patch: Parameters<typeof api.updateObject>[1]): void;
  onDelete(id: string): void;
  onClose(): void;
}

export function Details({ object: o, canEdit, canEditAtAll, onEnableEdit, onUpdate, onDelete, onClose }: Props) {
  const def = getObjectType(o.type);
  const spec = getAircraft(o.props.aircraftModel);
  const m = measure(o.geometry);
  const setProps = (props: Partial<ObjectProps>) => onUpdate(o.id, { props });
  const sameKind = OBJECT_TYPES.filter((t) => t.kind === def?.kind);

  return (
    <aside className="details card">
      <div className="details-head">
        {def && <TypeSwatch def={def} />}
        <div className="grow">
          <div className="details-type">{def?.label ?? o.type}</div>
          <div className="details-title">{o.name || <span className="muted">Uten navn</span>}</div>
        </div>
        <button className="icon-btn" onClick={onClose} title="Lukk">
          ✕
        </button>
      </div>

      <div className="details-body">
        {!canEdit && canEditAtAll && (
          <button className="btn small full" onClick={onEnableEdit}>
            Slå på redigering for å endre
          </button>
        )}

        <Field label="Navn">
          <TextInput value={o.name} disabled={!canEdit} placeholder={spec ? 'F.eks. registrering eller operatør' : 'F.eks. «Publikum sør»'} onCommit={(name) => onUpdate(o.id, { name })} />
        </Field>

        {sameKind.length > 1 && def?.kind !== 'aircraft' && (
          <Field label="Type">
            <select value={o.type} disabled={!canEdit} onChange={(e) => onUpdate(o.id, { type: e.target.value })}>
              {sameKind.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
        )}

        {def?.kind === 'aircraft' && (
          <>
            <Field label="Flytype">
              <select value={o.props.aircraftModel} disabled={!canEdit} onChange={(e) => setProps({ aircraftModel: e.target.value })}>
                {AIRCRAFT.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Retning (grader, 0 = nord)">
              <div className="row">
                <NumberInput value={o.props.heading ?? 0} disabled={!canEdit} onCommit={(heading) => setProps({ heading: heading ?? 0 })} />
                {canEdit && (
                  <>
                    <button className="btn small" title="Roter 15° mot klokka" onClick={() => setProps({ heading: (o.props.heading ?? 0) - 15 })}>
                      ⟲
                    </button>
                    <button className="btn small" title="Roter 15° med klokka" onClick={() => setProps({ heading: (o.props.heading ?? 0) + 15 })}>
                      ⟳
                    </button>
                  </>
                )}
              </div>
            </Field>
            {spec && (
              <div className="measure">
                {spec.category} · lengde {spec.length} m · {spec.rotor ? 'rotor' : 'spenn'} {spec.span} m · høyde {spec.height} m
              </div>
            )}
          </>
        )}

        {(m.area !== undefined || (def?.kind === 'line' && m.length !== undefined)) && (
          <div className="measure">
            {m.area !== undefined ? (
              <>
                Areal {formatArea(m.area)} · omkrets {formatLength(m.length ?? 0)}
              </>
            ) : (
              <>Lengde {formatLength(m.length ?? 0)}</>
            )}
          </div>
        )}

        <Field label="Status">
          <div className="status-row">
            {STATUSES.map((s) => (
              <button
                key={s}
                disabled={!canEdit}
                className={`status-chip ${o.props.status === s ? 'active' : ''}`}
                style={{ '--c': STATUS_COLORS[s] } as React.CSSProperties}
                onClick={() => setProps({ status: s })}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid2">
          <Field label="Ansvarlig">
            <TextInput value={o.props.responsible} disabled={!canEdit} onCommit={(responsible) => setProps({ responsible })} />
          </Field>
          <Field label="Leverandør">
            <TextInput value={o.props.supplier} disabled={!canEdit} onCommit={(supplier) => setProps({ supplier })} />
          </Field>
          <Field label="Antall">
            <NumberInput value={o.props.quantity} disabled={!canEdit} onCommit={(quantity) => setProps({ quantity })} />
          </Field>
          <Field label="Frist">
            <input type="date" value={o.props.dueDate ?? ''} disabled={!canEdit} onChange={(e) => setProps({ dueDate: e.target.value || null })} />
          </Field>
        </div>

        <Field label="Notat">
          <TextInput multiline value={o.props.notes} disabled={!canEdit} onCommit={(notes) => setProps({ notes })} />
        </Field>

        <div className="meta muted small">
          Opprettet {fmt(o.createdAt)} av {o.createdBy ?? 'ukjent'}
          <br />
          Sist endret {fmt(o.updatedAt)} av {o.updatedBy ?? 'ukjent'}
        </div>

        {canEdit && (
          <button
            className="btn danger full"
            onClick={() => {
              if (confirm(`Slette «${o.name || def?.label}»?`)) onDelete(o.id);
            }}
          >
            Slett objekt
          </button>
        )}
      </div>
    </aside>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** Tekstfelt som lagrer når feltet forlates eller Enter trykkes. */
function TextInput(props: { value: string; disabled?: boolean; placeholder?: string; multiline?: boolean; onCommit(v: string): void }) {
  const [v, setV] = useState(props.value);
  useEffect(() => setV(props.value), [props.value]);
  const commit = () => {
    if (v !== props.value) props.onCommit(v);
  };
  if (props.multiline) {
    return <textarea rows={3} value={v} disabled={props.disabled} onChange={(e) => setV(e.target.value)} onBlur={commit} />;
  }
  return (
    <input
      value={v}
      disabled={props.disabled}
      placeholder={props.placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

function NumberInput(props: { value: number | null; disabled?: boolean; onCommit(v: number | null): void }) {
  const str = props.value === null ? '' : String(props.value);
  const [v, setV] = useState(str);
  useEffect(() => setV(str), [str]);
  const commit = () => {
    const n = v.trim() === '' ? null : Number(v.replace(',', '.'));
    if (n !== null && !Number.isFinite(n)) return setV(str);
    if (n !== props.value) props.onCommit(n);
  };
  return (
    <input
      inputMode="decimal"
      value={v}
      disabled={props.disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
