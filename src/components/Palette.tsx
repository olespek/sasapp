import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { AIRCRAFT } from '../../shared/aircraft';
import { ACTIVE_TYPES, GROUPS, type ObjectTypeDef } from '../../shared/catalog';

interface Props {
  open: boolean;
  setOpen(open: boolean): void;
  active: { type: string; model?: string } | null;
  onPick(type: string, model?: string): void;
}

const KIND_HINT: Record<string, string> = { point: 'punkt', line: 'linje', polygon: 'område', aircraft: 'fly' };

export function TypeSwatch({ def }: { def: ObjectTypeDef }) {
  const shape = def.kind === 'line' ? 'line' : def.kind === 'polygon' ? 'area' : 'dot';
  return (
    <span className={`swatch ${shape}`} style={{ '--c': def.color } as React.CSSProperties}>
      {shape !== 'line' && def.icon}
    </span>
  );
}

export function Palette({ open, setOpen, active, onPick }: Props) {
  const [openGroup, setOpenGroup] = useState<string | null>('publikum');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);

  return (
    <div className={`palette ${open ? '' : 'collapsed'}`} ref={ref}>
      <button className="palette-head" onClick={() => setOpen(!open)}>
        <span>＋ Legg til</span>
        <span>{open ? '‹' : '›'}</span>
      </button>
      {open && (
        <div className="palette-body">
          {GROUPS.map((g) => {
            const types = ACTIVE_TYPES.filter((t) => t.group === g.id);
            if (types.length === 0) return null;
            const expanded = openGroup === g.id;
            return (
              <div key={g.id} className="palette-group">
                <button className="palette-group-head" onClick={() => setOpenGroup(expanded ? null : g.id)}>
                  {g.label} <span className="muted">{expanded ? '−' : '+'}</span>
                </button>
                {expanded &&
                  types.map((t) =>
                    t.kind === 'aircraft' ? (
                      <div key={t.id} className="palette-sub">
                        <div className="muted small">Fly i målestokk</div>
                        {AIRCRAFT.map((a) => (
                          <button
                            key={a.id}
                            className={`palette-item ${active?.type === t.id && active.model === a.id ? 'active' : ''}`}
                            onClick={() => onPick(t.id, a.id)}
                            title={`${a.name} – ${a.length} m lang, ${a.span} m ${a.rotor ? 'rotordiameter' : 'vingespenn'}`}
                          >
                            <TypeSwatch def={t} />
                            <span className="grow">{a.name}</span>
                            <span className="muted small">{a.category}</span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        key={t.id}
                        className={`palette-item ${active?.type === t.id ? 'active' : ''}`}
                        onClick={() => onPick(t.id)}
                      >
                        <TypeSwatch def={t} />
                        <span className="grow">{t.label}</span>
                        <span className="muted small">{KIND_HINT[t.kind]}</span>
                      </button>
                    ),
                  )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
