// Delte typer mellom server og klient.

export type Role = 'admin' | 'editor' | 'viewer';

export const ROLES: Role[] = ['admin', 'editor', 'viewer'];

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

/** Koordinater følger GeoJSON: [lengdegrad, breddegrad]. */
export type Position = [number, number];

export type Geometry =
  | { type: 'Point'; coordinates: Position }
  | { type: 'LineString'; coordinates: Position[] }
  | { type: 'Polygon'; coordinates: Position[][] };

export type Status = 'idea' | 'planned' | 'ordered' | 'confirmed' | 'installed' | 'done' | 'issue';

export const STATUSES: Status[] = ['idea', 'planned', 'ordered', 'confirmed', 'installed', 'done', 'issue'];

export const STATUS_LABELS: Record<Status, string> = {
  idea: 'Idé',
  planned: 'Planlagt',
  ordered: 'Bestilt',
  confirmed: 'Bekreftet',
  installed: 'Montert',
  done: 'Ferdig',
  issue: 'Avvik',
};

export const STATUS_COLORS: Record<Status, string> = {
  idea: '#9aa3ad',
  planned: '#3b82f6',
  ordered: '#a855f7',
  confirmed: '#0ea5e9',
  installed: '#14b8a6',
  done: '#22c55e',
  issue: '#ef4444',
};

export interface ObjectProps {
  status: Status;
  responsible: string;
  supplier: string;
  quantity: number | null;
  dueDate: string | null; // ÅÅÅÅ-MM-DD
  notes: string;
  /** Kun for fly: id fra flykatalogen. */
  aircraftModel?: string;
  /** Kun for fly: retning nesen peker, i grader (0 = nord, 90 = øst). */
  heading?: number;
}

export interface PlanObject {
  id: string;
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
  name: string;
  locked: boolean;
  lockedBy: string | null;
  lockedAt: string | null;
  center: [number, number]; // [breddegrad, lengdegrad]
  zoom: number;
}

export interface VersionSummary {
  id: number;
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
  user: string | null;
  action: string;
  objectId: string | null;
  summary: string;
  at: string;
}

export interface ShareSettings {
  enabled: boolean;
  token: string;
}

/** Hva den som ser på planen har lov til. */
export interface Access {
  user: User | null;
  /** Kom inn via delingslenke uten innlogging. */
  viaShare: boolean;
  canEdit: boolean;
  isAdmin: boolean;
}

export interface PlanResponse {
  plan: Plan;
  objects: PlanObject[];
  access: Access;
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
