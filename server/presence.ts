import { initials, type Position, type Presence, type User } from '../shared/types.js';

/** Farger for andres musepekere. Rødt er holdt av til eget valg. */
const COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#db2777', '#ca8a04'];

/** Hvem som er inne akkurat nå, med musepeker og valgt objekt. Holdes bare i minnet. */
export class PresenceStore {
  private byUser = new Map<number, Presence>();

  update(user: User, cursor: Position | null, selectedId: string | null): Presence {
    const p: Presence = {
      id: user.id,
      name: user.name,
      initials: initials(user.name),
      color: COLORS[user.id % COLORS.length],
      cursor,
      selectedId,
    };
    this.byUser.set(user.id, p);
    return p;
  }

  remove(id: number): boolean {
    return this.byUser.delete(id);
  }

  all(): Presence[] {
    return [...this.byUser.values()];
  }
}
