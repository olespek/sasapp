// Delte typer mellom server og klient.

export type Role = 'admin' | 'editor' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  editor: 'Redaktør',
  viewer: 'Leser',
};

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
}

export type GeometryKind = 'point' | 'line' | 'polygon';

export type Geometry =
  | { type: 'Point'; coordinates: [number, number] }
  | { type: 'LineString'; coordinates: [number, number][] }
  | { type: 'Polygon'; coordinates: [number, number][][] };

export type Status = 'idea' | 'planned' | 'ordered' | 'confirmed' | 'installed' | 'done' | 'issue';

export interface ObjectProps {
  status: Status;
  responsible: string;
  supplier: string;
  quantity: number | null;
  dueDate: string | null;
  notes: string;
}

export interface PlanObject {
  id: string;
  planId: number;
  type: string;
  name: string;
  geometry: Geometry;
  props: ObjectProps;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: number;
  name: string;
  locked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  center: [number, number]; // [lat, lng]
  zoom: number;
  createdAt: string;
}

export interface VersionSummary {
  id: number;
  planId: number;
  name: string;
  note: string;
  objectCount: number;
  createdBy: string | null;
  createdAt: string;
}

export interface Version extends VersionSummary {
  objects: PlanObject[];
}

export interface Activity {
  id: number;
  planId: number;
  user: string | null;
  action: string;
  objectId: string | null;
  summary: string;
  at: string;
}

export interface AppConfig {
  publicView: boolean;
}

/** Kan brukeren endre objektene i planen? */
export function canEditPlan(user: Pick<User, 'role'> | null | undefined, plan: Pick<Plan, 'locked'>): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return user.role === 'editor' && !plan.locked;
}

export function defaultProps(): ObjectProps {
  return { status: 'planned', responsible: '', supplier: '', quantity: null, dueDate: null, notes: '' };
}

/** Server-sendte hendelser for sanntidsoppdatering. */
export type ServerEvent =
  | { kind: 'object-upsert'; object: PlanObject }
  | { kind: 'object-delete'; id: string }
  | { kind: 'objects-reset' }
  | { kind: 'plan'; plan: Plan }
  | { kind: 'activity'; activity: Activity };
