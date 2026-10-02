import type {
  Access,
  Activity,
  Plan,
  PlanObject,
  PlanResponse,
  ServerEvent,
  ShareSettings,
  User,
  Version,
  VersionSummary,
} from '../shared/types';

/** Delingslenker har formen /vis/<nøkkel>. */
export const shareToken: string | null = (() => {
  const m = window.location.pathname.match(/^\/vis\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
})();

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function withShare(path: string): string {
  if (!shareToken) return path;
  return `${path}${path.includes('?') ? '&' : '?'}share=${encodeURIComponent(shareToken)}`;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(withShare(path), {
    method,
    credentials: 'same-origin',
    headers: {
      'X-Requested-With': 'sasapp',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Feil ${res.status}`);
  return data as T;
}

export const api = {
  me: () => call<Access>('GET', '/api/auth/me'),
  login: (username: string, password: string) => call<{ user: User }>('POST', '/api/auth/login', { username, password }),
  logout: () => call('POST', '/api/auth/logout'),
  changePassword: (currentPassword: string, newPassword: string) =>
    call('POST', '/api/auth/password', { currentPassword, newPassword }),

  plan: () => call<PlanResponse>('GET', '/api/plan'),
  updatePlan: (patch: Partial<Pick<Plan, 'name' | 'center' | 'zoom'>>) => call<Plan>('PATCH', '/api/plan', patch),
  setLocked: (locked: boolean) => call<Plan>('POST', '/api/plan/lock', { locked }),

  createObject: (o: Pick<PlanObject, 'type' | 'name' | 'geometry'> & { props?: Partial<PlanObject['props']> }) =>
    call<PlanObject>('POST', '/api/objects', o),
  updateObject: (id: string, patch: Partial<Pick<PlanObject, 'type' | 'name' | 'geometry'>> & { props?: Partial<PlanObject['props']> }) =>
    call<PlanObject>('PATCH', `/api/objects/${id}`, patch),
  deleteObject: (id: string) => call('DELETE', `/api/objects/${id}`),

  activity: () => call<Activity[]>('GET', '/api/activity'),
  versions: () => call<VersionSummary[]>('GET', '/api/versions'),
  version: (id: number) => call<Version>('GET', `/api/versions/${id}`),
  createVersion: (name: string, note: string) => call<VersionSummary>('POST', '/api/versions', { name, note }),
  restoreVersion: (id: number) => call('POST', `/api/versions/${id}/restore`),
  deleteVersion: (id: number) => call('DELETE', `/api/versions/${id}`),

  users: () => call<User[]>('GET', '/api/users'),
  createUser: (u: { username: string; name: string; role: string; password: string }) => call<User>('POST', '/api/users', u),
  updateUser: (id: number, patch: { name?: string; role?: string; password?: string }) => call<User>('PATCH', `/api/users/${id}`, patch),
  deleteUser: (id: number) => call('DELETE', `/api/users/${id}`),

  share: () => call<ShareSettings>('GET', '/api/share'),
  updateShare: (patch: { enabled?: boolean; regenerate?: boolean }) => call<ShareSettings>('POST', '/api/share', patch),
};

/** Abonnerer på sanntidshendelser. Returnerer funksjon som avslutter abonnementet. */
export function subscribe(onEvent: (e: ServerEvent) => void, onReconnect: () => void): () => void {
  let es: EventSource | null = null;
  let closed = false;
  let hadError = false;
  const open = () => {
    es = new EventSource(withShare('/api/events'));
    es.onopen = () => {
      if (hadError) onReconnect();
      hadError = false;
    };
    es.onmessage = (m) => onEvent(JSON.parse(m.data));
    es.onerror = () => {
      hadError = true;
      // EventSource prøver selv på nytt; lukkes den helt, åpner vi en ny etter en pause.
      if (es?.readyState === EventSource.CLOSED && !closed) setTimeout(open, 5000);
    };
  };
  open();
  return () => {
    closed = true;
    es?.close();
  };
}

export function shareUrl(token: string): string {
  return `${window.location.origin}/vis/${token}`;
}
