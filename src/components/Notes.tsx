import { useState } from 'react';
import { initials, type Note, type NoteKind, type User } from '../../shared/types';
import { api } from '../api';
import { Icon } from '../icons';

type Filter = 'all' | 'open' | 'done';

const rtf = new Intl.RelativeTimeFormat('nb', { numeric: 'auto' });

/** «for 5 minutter siden», «i går», eller dato for eldre. */
export function timeAgo(iso: string): string {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  const a = Math.abs(s);
  if (a < 60) return 'nå nettopp';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 7 * 86400) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', year: 'numeric' });
}

const fullTime = (iso: string) => new Date(iso).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short' });

interface Props {
  notes: Note[];
  user: User;
  onChange(note: Note): void;
  onDelete(id: number): void;
  fail(err: unknown): void;
}

/** Notater til «neste mann»: oppgaver som må gjøres, og info om hva som er gjort. */
export function Notes({ notes, user, onChange, onDelete, fail }: Props) {
  const [kind, setKind] = useState<NoteKind>('todo');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const open = notes.filter((n) => n.kind === 'todo' && !n.done);
  const done = notes.filter((n) => n.kind === 'todo' && n.done);
  const shown = filter === 'open' ? open : filter === 'done' ? done : notes;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      onChange(await api.createNote(kind, text.trim()));
      setText('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack notes">
      <form className="note-form card-inset" onSubmit={submit}>
        <div className="seg" role="radiogroup" aria-label="Type notat">
          <button type="button" role="radio" aria-checked={kind === 'todo'} className={kind === 'todo' ? 'active' : ''} onClick={() => setKind('todo')}>
            <Icon name="list-todo" size={14} /> To do
          </button>
          <button type="button" role="radio" aria-checked={kind === 'info'} className={kind === 'info' ? 'active' : ''} onClick={() => setKind('info')}>
            <Icon name="info" size={14} /> Notat
          </button>
        </div>
        <textarea
          rows={3}
          placeholder={kind === 'todo' ? 'Hva må neste mann gjøre?' : 'Hva har du gjort, eller hva bør de andre vite?'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          maxLength={4000}
        />
        <div className="row between">
          <span className="muted small">Ctrl/⌘+Enter for å lagre</span>
          <button className="btn primary small" disabled={!text.trim() || busy}>
            Legg til
          </button>
        </div>
      </form>

      <div className="seg filter">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          Alle ({notes.length})
        </button>
        <button className={filter === 'open' ? 'active' : ''} onClick={() => setFilter('open')}>
          To do ({open.length})
        </button>
        <button className={filter === 'done' ? 'active' : ''} onClick={() => setFilter('done')}>
          Gjort ({done.length})
        </button>
      </div>

      {shown.length === 0 && (
        <p className="muted">{filter === 'open' ? 'Ingen åpne oppgaver.' : filter === 'done' ? 'Ingen oppgaver er krysset av ennå.' : 'Ingen notater ennå.'}</p>
      )}
      <ul className="note-list">
        {shown.map((n) => (
          <NoteItem key={n.id} note={n} canChange={user.role === 'admin' || user.id === n.createdById} onChange={onChange} onDelete={onDelete} fail={fail} />
        ))}
      </ul>
    </div>
  );
}

function NoteItem({ note, canChange, onChange, onDelete, fail }: { note: Note; canChange: boolean } & Pick<Props, 'onChange' | 'onDelete' | 'fail'>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);

  const update = async (patch: Parameters<typeof api.updateNote>[1]) => {
    try {
      onChange(await api.updateNote(note.id, patch));
      return true;
    } catch (err) {
      fail(err);
      return false;
    }
  };

  const save = async () => {
    if (!draft.trim()) return;
    if (draft.trim() === note.text || (await update({ text: draft.trim() }))) setEditing(false);
  };

  const remove = async () => {
    if (!confirm('Slette notatet?')) return;
    try {
      await api.deleteNote(note.id);
      onDelete(note.id);
    } catch (err) {
      fail(err);
    }
  };

  const todo = note.kind === 'todo';
  return (
    <li className={`note ${todo ? 'todo' : 'info'} ${note.done ? 'done' : ''}`}>
      <div className="note-head">
        <span className="avatar small" title={note.createdBy}>
          {initials(note.createdBy)}
        </span>
        <div className="grow">
          <b>{note.createdBy}</b>
          <span className="muted small" title={fullTime(note.createdAt)}>
            {' '}
            · {timeAgo(note.createdAt)}
          </span>
        </div>
        <span className={`note-kind ${todo ? 'todo' : 'info'}`}>{todo ? 'To do' : 'Notat'}</span>
        {canChange && !editing && (
          <>
            <button
              className="icon-btn small"
              title="Endre"
              onClick={() => {
                setDraft(note.text);
                setEditing(true);
              }}
            >
              <Icon name="pencil" size={15} />
            </button>
            <button className="icon-btn small" title="Slett" onClick={remove}>
              <Icon name="trash-2" size={15} />
            </button>
          </>
        )}
      </div>
      {editing ? (
        <div className="stack">
          <textarea
            rows={3}
            value={draft}
            autoFocus
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <div className="row end">
            <button className="btn small" onClick={() => setEditing(false)}>
              Avbryt
            </button>
            <button className="btn primary small" disabled={!draft.trim()} onClick={save}>
              Lagre
            </button>
          </div>
        </div>
      ) : (
        <div className="note-body">
          {todo && (
            <input type="checkbox" checked={note.done} title={note.done ? 'Marker som ikke gjort' : 'Marker som gjort'} onChange={(e) => update({ done: e.target.checked })} />
          )}
          <div className="note-text">{note.text}</div>
        </div>
      )}
      {todo && note.done && note.doneBy && note.doneAt && (
        <div className="muted small note-done" title={fullTime(note.doneAt)}>
          <Icon name="check" size={13} strokeWidth={2.5} /> Gjort av {note.doneBy} · {timeAgo(note.doneAt)}
        </div>
      )}
    </li>
  );
}
