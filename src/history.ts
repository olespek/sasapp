// Angre/gjør om for egne endringer i denne økten.
//
// Hver handling i historikken lagres som det som skal til for å angre den (f.eks. «slett objekt X»
// for å angre at X ble lagt til). Når en handling utføres, returneres motsatt handling, slik at
// angre og gjør om bare flytter handlinger mellom to stabler.

import type { PlanObject } from '../shared/types';
import { api } from './api';

type Fields = Pick<PlanObject, 'type' | 'name' | 'geometry' | 'props'>;

export type HistoryAction =
  /** Slett objektet. expectUpdatedAt: objektet skal ikke være endret av andre siden. */
  | { do: 'delete'; obj: PlanObject }
  /** Legg tilbake et slettet objekt med samme id. */
  | { do: 'restore'; obj: PlanObject }
  /** Sett objektet tilbake til tidligere verdier. */
  | { do: 'patch'; id: string; to: Fields; expectUpdatedAt: string };

export interface HistoryEntry {
  label: string;
  actions: HistoryAction[];
}

export class HistoryConflict extends Error {}

export const fieldsOf = (o: PlanObject): Fields => ({ type: o.type, name: o.name, geometry: o.geometry, props: o.props });

/** Sjekker at ingen andre har endret objektene siden, før noe utføres. */
export function checkConflicts(actions: HistoryAction[], current: PlanObject[]): void {
  const byId = new Map(current.map((o) => [o.id, o]));
  for (const a of actions) {
    if (a.do === 'restore') {
      if (byId.has(a.obj.id)) throw new HistoryConflict('Objektet finnes allerede');
      continue;
    }
    const id = a.do === 'delete' ? a.obj.id : a.id;
    const expected = a.do === 'delete' ? a.obj.updatedAt : a.expectUpdatedAt;
    const now = byId.get(id);
    if (!now) throw new HistoryConflict('Objektet er slettet av noen andre');
    if (now.updatedAt !== expected) throw new HistoryConflict(`«${now.name || 'objektet'}» er endret av noen andre etterpå`);
  }
}

/** Utfører en handling og returnerer handlingen som reverserer den. */
export async function perform(a: HistoryAction, current: PlanObject[]): Promise<{ inverse: HistoryAction; result: PlanObject | null; removedId?: string }> {
  if (a.do === 'delete') {
    const before = current.find((o) => o.id === a.obj.id) ?? a.obj;
    await api.deleteObject(a.obj.id);
    return { inverse: { do: 'restore', obj: before }, result: null, removedId: a.obj.id };
  }
  if (a.do === 'restore') {
    const o = a.obj;
    const created = await api.createObject({ id: o.id, type: o.type, name: o.name, geometry: o.geometry, props: o.props });
    return { inverse: { do: 'delete', obj: created }, result: created };
  }
  const before = current.find((o) => o.id === a.id)!;
  const after = await api.updateObject(a.id, a.to);
  return { inverse: { do: 'patch', id: a.id, to: fieldsOf(before), expectUpdatedAt: after.updatedAt }, result: after };
}
