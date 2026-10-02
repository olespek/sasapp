import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getAircraft } from '../shared/aircraft.js';
import { getObjectType } from '../shared/catalog.js';
import { ROLES, ROLE_LABELS, canEditPlan, type Access, type PlanObject, type PlanResponse, type Role, type User } from '../shared/types.js';
import { LoginLimiter, MIN_PASSWORD_LENGTH, hashPassword, verifyPassword } from './auth.js';
import type { DB } from './db.js';
import { EventHub } from './events.js';
import * as repo from './repo.js';
import * as v from './validate.js';

const COOKIE = 'sas_session';

interface Ctx {
  user: User | null;
  viaShare: boolean;
  sessionToken?: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    ctx: Ctx;
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface AppOptions {
  /** Mappe med bygget klient (vite build). Serveres i produksjon. */
  staticDir?: string;
}

export function createApp(db: DB, opts: AppOptions = {}) {
  const app = express();
  const hub = new EventHub();
  const limiter = new LoginLimiter();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  // Hvem er dette? Innlogget bruker via cookie, eller gjest via delingslenke (?share=…).
  app.use('/api', (req, _res, next) => {
    req.ctx = { user: null, viaShare: false };
    const token = req.cookies?.[COOKIE];
    if (typeof token === 'string' && token) {
      const user = repo.userForSession(db, token);
      if (user) req.ctx = { user, viaShare: false, sessionToken: token };
    }
    if (!req.ctx.user && typeof req.query.share === 'string') {
      const share = repo.getShare(db);
      if (share.enabled && req.query.share === share.token) req.ctx.viaShare = true;
    }
    next();
  });

  // Endringer krever en egen header. Den kan ikke settes av skjemaer fra andre nettsteder (CSRF-vern).
  app.use('/api', (req, _res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.get('X-Requested-With') !== 'sasapp') {
      return next(new HttpError(403, 'Mangler X-Requested-With'));
    }
    next();
  });

  const who = (req: Request) => req.ctx.user?.name ?? null;

  const access = (req: Request): Access => {
    const plan = repo.getPlan(db);
    return {
      user: req.ctx.user,
      viaShare: req.ctx.viaShare,
      canEdit: canEditPlan(req.ctx.user, plan),
      isAdmin: req.ctx.user?.role === 'admin',
    };
  };

  const requireRead = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.ctx.user && !req.ctx.viaShare) return next(new HttpError(401, 'Ikke innlogget'));
    next();
  };
  const requireUser = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.ctx.user) return next(new HttpError(401, 'Ikke innlogget'));
    next();
  };
  const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.ctx.user) return next(new HttpError(401, 'Ikke innlogget'));
    if (req.ctx.user.role !== 'admin') return next(new HttpError(403, 'Krever administrator'));
    next();
  };
  const requireEdit = (req: Request, _res: Response, next: NextFunction) => {
    if (!req.ctx.user) return next(new HttpError(401, 'Ikke innlogget'));
    const plan = repo.getPlan(db);
    if (!canEditPlan(req.ctx.user, plan)) {
      return next(new HttpError(403, plan.locked ? 'Planen er låst for redigering' : 'Du har bare lesetilgang'));
    }
    next();
  };

  const log = (req: Request, action: string, summary: string, objectId?: string) => {
    hub.broadcast({ kind: 'activity', activity: repo.logActivity(db, { user: who(req), action, summary, objectId }) });
  };

  const describe = (o: Pick<PlanObject, 'type' | 'name' | 'props'>) => {
    const label = getObjectType(o.type)?.label ?? o.type;
    const model = o.type === 'fly' ? getAircraft(o.props.aircraftModel)?.name : undefined;
    const base = model ? `${label} (${model})` : label;
    return o.name ? `${base} «${o.name}»` : base;
  };

  // ---------- Innlogging ----------

  app.post('/api/auth/login', (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    const key = `${req.ip}|${username.toLowerCase()}`;
    if (limiter.blocked(key)) throw new HttpError(429, 'For mange forsøk. Prøv igjen om litt.');
    const user = repo.findUserByUsername(db, username);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      limiter.fail(key);
      throw new HttpError(401, 'Feil brukernavn eller passord');
    }
    limiter.reset(key);
    repo.purgeExpiredSessions(db);
    const token = repo.createSession(db, user.id);
    res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 30 * 86400_000, path: '/' });
    const { passwordHash: _, ...safe } = user;
    res.json({ user: safe });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.ctx.sessionToken) repo.deleteSession(db, req.ctx.sessionToken);
    res.clearCookie(COOKIE, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req, res) => {
    res.json(access(req));
  });

  app.post('/api/auth/password', requireUser, (req, res) => {
    const user = repo.getUser(db, req.ctx.user!.id)!;
    const current = String(req.body?.currentPassword ?? '');
    const next = String(req.body?.newPassword ?? '');
    if (!verifyPassword(current, user.passwordHash)) throw new HttpError(400, 'Nåværende passord er feil');
    if (next.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Passordet må ha minst ${MIN_PASSWORD_LENGTH} tegn`);
    repo.updateUser(db, user.id, { passwordHash: hashPassword(next) });
    repo.deleteSessionsForUser(db, user.id, req.ctx.sessionToken);
    res.json({ ok: true });
  });

  // ---------- Plan og objekter ----------

  app.get('/api/plan', requireRead, (req, res) => {
    const body: PlanResponse = { plan: repo.getPlan(db), objects: repo.listObjects(db), access: access(req) };
    res.json(body);
  });

  app.patch('/api/plan', requireAdmin, (req, res) => {
    const patch: Parameters<typeof repo.updatePlan>[1] = {};
    if (req.body?.name !== undefined) {
      const name = v.name(req.body.name);
      if (!name) throw new HttpError(400, 'Navn kan ikke være tomt');
      patch.name = name;
    }
    if (req.body?.center !== undefined || req.body?.zoom !== undefined) {
      const c = req.body.center;
      const z = req.body.zoom;
      if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number' || Math.abs(c[0]) > 90 || Math.abs(c[1]) > 180) {
        throw new HttpError(400, 'Ugyldig senter');
      }
      if (typeof z !== 'number' || z < 1 || z > 22) throw new HttpError(400, 'Ugyldig zoom');
      patch.center = [c[0], c[1]];
      patch.zoom = z;
    }
    const plan = repo.updatePlan(db, patch);
    hub.broadcast({ kind: 'plan', plan });
    if (patch.name) log(req, 'plan', `Endret navn på planen til «${patch.name}»`);
    if (patch.center) log(req, 'plan', 'Endret startvisning for kartet');
    res.json(plan);
  });

  app.post('/api/plan/lock', requireAdmin, (req, res) => {
    const locked = req.body?.locked === true;
    const plan = repo.updatePlan(db, {
      locked,
      lockedBy: locked ? who(req) : null,
      lockedAt: locked ? new Date().toISOString() : null,
    });
    hub.broadcast({ kind: 'plan', plan });
    log(req, locked ? 'lock' : 'unlock', locked ? 'Låste planen for redigering' : 'Åpnet planen for redigering');
    res.json(plan);
  });

  app.post('/api/objects', requireEdit, (req, res) => {
    const def = v.objectType(req.body?.type);
    const isAircraft = def.kind === 'aircraft';
    const now = new Date().toISOString();
    const obj: PlanObject = {
      id: randomUUID(),
      type: def.id,
      name: v.name(req.body?.name),
      geometry: v.geometry(req.body?.geometry, v.expectedGeometryType(def.id)),
      props: v.props(req.body?.props, undefined, isAircraft),
      createdBy: who(req),
      updatedBy: who(req),
      createdAt: now,
      updatedAt: now,
    };
    repo.insertObject(db, obj);
    hub.broadcast({ kind: 'object-upsert', object: obj });
    log(req, 'create', `La til ${describe(obj)}`, obj.id);
    res.status(201).json(obj);
  });

  app.patch('/api/objects/:id', requireEdit, (req, res) => {
    const existing = repo.getObject(db, req.params.id as string);
    if (!existing) throw new HttpError(404, 'Objektet finnes ikke');
    const body = req.body ?? {};
    const updated: PlanObject = { ...existing };
    if (body.type !== undefined && body.type !== existing.type) {
      const from = getObjectType(existing.type);
      const to = v.objectType(body.type);
      if (from && from.kind !== to.kind) throw new HttpError(400, 'Kan bare bytte til en type med samme geometri');
      updated.type = to.id;
    }
    const isAircraft = getObjectType(updated.type)?.kind === 'aircraft';
    if (body.name !== undefined) updated.name = v.name(body.name);
    if (body.geometry !== undefined) updated.geometry = v.geometry(body.geometry, v.expectedGeometryType(updated.type));
    if (body.props !== undefined) updated.props = v.props(body.props, existing.props, isAircraft);
    updated.updatedBy = who(req);
    updated.updatedAt = new Date().toISOString();
    repo.saveObject(db, updated);
    hub.broadcast({ kind: 'object-upsert', object: updated });

    const changes: string[] = [];
    if (body.geometry !== undefined) changes.push(isAircraft ? 'posisjon' : 'geometri');
    if (body.props?.heading !== undefined && body.props.heading !== existing.props.heading) changes.push('retning');
    if (body.props?.status !== undefined && body.props.status !== existing.props.status) changes.push('status');
    if (body.name !== undefined && updated.name !== existing.name) changes.push('navn');
    if (updated.type !== existing.type) changes.push('type');
    const other = body.props && Object.keys(body.props).some((k) => !['heading', 'status'].includes(k));
    if (other) changes.push('detaljer');
    log(req, 'update', `Endret ${changes.length ? changes.join(', ') : 'objekt'} på ${describe(updated)}`, updated.id);
    res.json(updated);
  });

  app.delete('/api/objects/:id', requireEdit, (req, res) => {
    const existing = repo.getObject(db, req.params.id as string);
    if (!existing || !repo.deleteObject(db, existing.id)) throw new HttpError(404, 'Objektet finnes ikke');
    hub.broadcast({ kind: 'object-delete', id: existing.id });
    log(req, 'delete', `Slettet ${describe(existing)}`, existing.id);
    res.json({ ok: true });
  });

  // ---------- Aktivitet og versjoner ----------

  app.get('/api/activity', requireUser, (_req, res) => {
    res.json(repo.listActivity(db));
  });

  app.get('/api/versions', requireUser, (_req, res) => {
    res.json(repo.listVersions(db));
  });

  app.get('/api/versions/:id', requireUser, (req, res) => {
    const version = repo.getVersion(db, Number(req.params.id));
    if (!version) throw new HttpError(404, 'Versjonen finnes ikke');
    res.json(version);
  });

  app.post('/api/versions', requireEdit, (req, res) => {
    const name = v.name(req.body?.name);
    if (!name) throw new HttpError(400, 'Versjonen må ha et navn');
    const note = String(req.body?.note ?? '').slice(0, 2000);
    const version = repo.createVersion(db, { name, note, createdBy: who(req) });
    log(req, 'version', `Lagret versjon «${name}»`);
    res.status(201).json(version);
  });

  app.post('/api/versions/:id/restore', requireAdmin, (req, res) => {
    const version = repo.getVersion(db, Number(req.params.id));
    if (!version) throw new HttpError(404, 'Versjonen finnes ikke');
    repo.createVersion(db, { name: `Automatisk før gjenoppretting av «${version.name}»`, note: '', createdBy: who(req) });
    repo.replaceAllObjects(db, version.objects);
    hub.broadcast({ kind: 'objects-reset' });
    log(req, 'restore', `Gjenopprettet versjon «${version.name}»`);
    res.json({ ok: true });
  });

  app.delete('/api/versions/:id', requireAdmin, (req, res) => {
    const version = repo.getVersion(db, Number(req.params.id));
    if (!version || !repo.deleteVersion(db, version.id)) throw new HttpError(404, 'Versjonen finnes ikke');
    log(req, 'version-delete', `Slettet versjon «${version.name}»`);
    res.json({ ok: true });
  });

  // ---------- Brukere ----------

  const role = (r: unknown): Role => {
    if (!ROLES.includes(r as Role)) throw new HttpError(400, 'Ugyldig rolle');
    return r as Role;
  };

  app.get('/api/users', requireAdmin, (_req, res) => {
    res.json(repo.listUsers(db));
  });

  app.post('/api/users', requireAdmin, (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    const name = String(req.body?.name ?? '').trim() || username;
    const password = String(req.body?.password ?? '');
    if (!/^[a-zA-Z0-9._@-]{2,60}$/.test(username)) {
      throw new HttpError(400, 'Brukernavn kan bare inneholde bokstaver (a–z), tall og . _ @ -');
    }
    if (password.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Passordet må ha minst ${MIN_PASSWORD_LENGTH} tegn`);
    if (repo.findUserByUsername(db, username)) throw new HttpError(409, 'Brukernavnet er allerede i bruk');
    const user = repo.createUser(db, { username, name: name.slice(0, 100), role: role(req.body?.role), passwordHash: hashPassword(password) });
    log(req, 'user', `Opprettet bruker ${user.name} (${ROLE_LABELS[user.role]})`);
    res.status(201).json(user);
  });

  app.patch('/api/users/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const user = repo.getUser(db, id);
    if (!user) throw new HttpError(404, 'Brukeren finnes ikke');
    const patch: { name?: string; role?: Role; passwordHash?: string } = {};
    if (req.body?.name !== undefined) patch.name = String(req.body.name).trim().slice(0, 100) || user.name;
    if (req.body?.role !== undefined) {
      patch.role = role(req.body.role);
      if (user.role === 'admin' && patch.role !== 'admin' && repo.countAdmins(db) <= 1) {
        throw new HttpError(400, 'Det må finnes minst én administrator');
      }
    }
    if (req.body?.password !== undefined) {
      const pw = String(req.body.password);
      if (pw.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Passordet må ha minst ${MIN_PASSWORD_LENGTH} tegn`);
      patch.passwordHash = hashPassword(pw);
    }
    repo.updateUser(db, id, patch);
    if (patch.passwordHash || patch.role) repo.deleteSessionsForUser(db, id, id === req.ctx.user!.id ? req.ctx.sessionToken : undefined);
    const { passwordHash: _, ...safe } = repo.getUser(db, id)!;
    res.json(safe);
  });

  app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const user = repo.getUser(db, id);
    if (!user) throw new HttpError(404, 'Brukeren finnes ikke');
    if (id === req.ctx.user!.id) throw new HttpError(400, 'Du kan ikke slette deg selv');
    if (user.role === 'admin' && repo.countAdmins(db) <= 1) throw new HttpError(400, 'Det må finnes minst én administrator');
    repo.deleteUser(db, id);
    log(req, 'user', `Slettet bruker ${user.name}`);
    res.json({ ok: true });
  });

  // ---------- Delingslenke ----------

  app.get('/api/share', requireAdmin, (_req, res) => {
    res.json(repo.getShare(db));
  });

  app.post('/api/share', requireAdmin, (req, res) => {
    const current = repo.getShare(db);
    const next = { ...current };
    if (req.body?.enabled !== undefined) next.enabled = req.body.enabled === true;
    if (req.body?.regenerate === true) next.token = repo.newShareToken();
    repo.setShare(db, next);
    if (!next.enabled || next.token !== current.token) hub.closeShared();
    if (next.enabled !== current.enabled) log(req, 'share', next.enabled ? 'Slo på delingslenke (lesetilgang)' : 'Slo av delingslenke');
    if (next.token !== current.token) log(req, 'share', 'Lagde ny delingslenke (den gamle virker ikke lenger)');
    res.json(next);
  });

  // ---------- Sanntid ----------

  app.get('/api/events', requireRead, (req, res) => {
    hub.add(res, req.ctx.viaShare);
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Finnes ikke')));

  // ---------- Klient (produksjon) ----------

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.use(express.static(opts.staticDir, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => res.sendFile(join(opts.staticDir!, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof v.ValidationError) return res.status(400).json({ error: err.message });
    if (err && typeof err === 'object' && 'type' in err && err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Ugyldig JSON' });
    }
    console.error(err);
    res.status(500).json({ error: 'Intern feil' });
  });

  return { app, hub };
}
