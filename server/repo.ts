// Datatilgang. Alle funksjoner er synkrone (node:sqlite).

import { randomBytes } from 'node:crypto';
import type { Activity, Plan, PlanObject, Role, ShareSettings, User, Version, VersionSummary } from '../shared/types.js';
import { DEFAULT_CENTER, DEFAULT_ZOOM, transaction, type DB } from './db.js';

const now = () => new Date().toISOString();

// ---------- Innstillinger ----------

function getSetting(db: DB, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function setSetting(db: DB, key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

export function getPlan(db: DB): Plan {
  const raw = getSetting(db, 'plan');
  const stored = raw ? (JSON.parse(raw) as Partial<Plan>) : {};
  return {
    name: stored.name ?? 'Sola Airshow – arenaplan',
    locked: stored.locked ?? false,
    lockedBy: stored.lockedBy ?? null,
    lockedAt: stored.lockedAt ?? null,
    center: stored.center ?? DEFAULT_CENTER,
    zoom: stored.zoom ?? DEFAULT_ZOOM,
  };
}

export function updatePlan(db: DB, patch: Partial<Plan>): Plan {
  const plan = { ...getPlan(db), ...patch };
  setSetting(db, 'plan', JSON.stringify(plan));
  return plan;
}

export function getShare(db: DB): ShareSettings {
  const raw = getSetting(db, 'share');
  if (raw) return JSON.parse(raw) as ShareSettings;
  const share = { enabled: false, token: newShareToken() };
  setSetting(db, 'share', JSON.stringify(share));
  return share;
}

export function setShare(db: DB, share: ShareSettings): ShareSettings {
  setSetting(db, 'share', JSON.stringify(share));
  return share;
}

export function newShareToken(): string {
  return randomBytes(18).toString('base64url');
}

// ---------- Brukere og sesjoner ----------

interface UserRow {
  id: number;
  username: string;
  name: string;
  role: Role;
  password_hash: string;
}

const toUser = (r: UserRow): User => ({ id: r.id, username: r.username, name: r.name, role: r.role });

export function countUsers(db: DB): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
}

export function listUsers(db: DB): User[] {
  return (db.prepare('SELECT * FROM users ORDER BY name COLLATE NOCASE').all() as unknown as UserRow[]).map(toUser);
}

export function findUserByUsername(db: DB, username: string): (User & { passwordHash: string }) | undefined {
  const r = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
  return r && { ...toUser(r), passwordHash: r.password_hash };
}

export function getUser(db: DB, id: number): (User & { passwordHash: string }) | undefined {
  const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return r && { ...toUser(r), passwordHash: r.password_hash };
}

export function createUser(db: DB, u: { username: string; name: string; role: Role; passwordHash: string }): User {
  const res = db
    .prepare('INSERT INTO users (username, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(u.username, u.name, u.role, u.passwordHash, now());
  return { id: Number(res.lastInsertRowid), username: u.username, name: u.name, role: u.role };
}

export function updateUser(db: DB, id: number, patch: { name?: string; role?: Role; passwordHash?: string }): void {
  if (patch.name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(patch.name, id);
  if (patch.role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(patch.role, id);
  if (patch.passwordHash !== undefined) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(patch.passwordHash, id);
  }
}

export function deleteUser(db: DB, id: number): void {
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function countAdmins(db: DB): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n;
}

const SESSION_DAYS = 30;

export function createSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return token;
}

export function userForSession(db: DB, token: string): User | undefined {
  const r = db
    .prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?')
    .get(token, now()) as UserRow | undefined;
  return r && toUser(r);
}

export function deleteSession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

export function deleteSessionsForUser(db: DB, userId: number, exceptToken?: string): void {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, exceptToken ?? '');
}

export function purgeExpiredSessions(db: DB): void {
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now());
}

// ---------- Objekter ----------

interface ObjectRow {
  id: string;
  type: string;
  name: string;
  geometry: string;
  props: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const toObject = (r: ObjectRow): PlanObject => ({
  id: r.id,
  type: r.type,
  name: r.name,
  geometry: JSON.parse(r.geometry),
  props: JSON.parse(r.props),
  createdBy: r.created_by,
  updatedBy: r.updated_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export function listObjects(db: DB): PlanObject[] {
  return (db.prepare('SELECT * FROM objects ORDER BY created_at').all() as unknown as ObjectRow[]).map(toObject);
}

export function getObject(db: DB, id: string): PlanObject | undefined {
  const r = db.prepare('SELECT * FROM objects WHERE id = ?').get(id) as ObjectRow | undefined;
  return r && toObject(r);
}

export function insertObject(db: DB, o: PlanObject): void {
  db.prepare(
    'INSERT INTO objects (id, type, name, geometry, props, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(o.id, o.type, o.name, JSON.stringify(o.geometry), JSON.stringify(o.props), o.createdBy, o.updatedBy, o.createdAt, o.updatedAt);
}

export function saveObject(db: DB, o: PlanObject): void {
  db.prepare('UPDATE objects SET type = ?, name = ?, geometry = ?, props = ?, updated_by = ?, updated_at = ? WHERE id = ?').run(
    o.type,
    o.name,
    JSON.stringify(o.geometry),
    JSON.stringify(o.props),
    o.updatedBy,
    o.updatedAt,
    o.id,
  );
}

export function deleteObject(db: DB, id: string): boolean {
  return Number(db.prepare('DELETE FROM objects WHERE id = ?').run(id).changes) > 0;
}

export function replaceAllObjects(db: DB, objects: PlanObject[]): void {
  transaction(db, () => {
    db.exec('DELETE FROM objects');
    for (const o of objects) insertObject(db, o);
  });
}

// ---------- Versjoner ----------

interface VersionRow {
  id: number;
  name: string;
  note: string;
  objects: string;
  object_count: number;
  created_by: string | null;
  created_at: string;
}

const toSummary = (r: VersionRow): VersionSummary => ({
  id: r.id,
  name: r.name,
  note: r.note,
  objectCount: r.object_count,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

export function listVersions(db: DB): VersionSummary[] {
  return (
    db.prepare('SELECT id, name, note, object_count, created_by, created_at FROM versions ORDER BY id DESC').all() as unknown as VersionRow[]
  ).map(toSummary);
}

export function getVersion(db: DB, id: number): Version | undefined {
  const r = db.prepare('SELECT * FROM versions WHERE id = ?').get(id) as VersionRow | undefined;
  return r && { ...toSummary(r), objects: JSON.parse(r.objects) };
}

export function createVersion(db: DB, v: { name: string; note: string; createdBy: string | null }): VersionSummary {
  const objects = listObjects(db);
  const createdAt = now();
  const res = db
    .prepare('INSERT INTO versions (name, note, objects, object_count, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(v.name, v.note, JSON.stringify(objects), objects.length, v.createdBy, createdAt);
  return { id: Number(res.lastInsertRowid), name: v.name, note: v.note, objectCount: objects.length, createdBy: v.createdBy, createdAt };
}

export function deleteVersion(db: DB, id: number): boolean {
  return Number(db.prepare('DELETE FROM versions WHERE id = ?').run(id).changes) > 0;
}

// ---------- Aktivitet ----------

export function logActivity(db: DB, a: { user: string | null; action: string; objectId?: string | null; summary: string }): Activity {
  const at = now();
  const res = db
    .prepare('INSERT INTO activity (user, action, object_id, summary, at) VALUES (?, ?, ?, ?, ?)')
    .run(a.user, a.action, a.objectId ?? null, a.summary, at);
  return { id: Number(res.lastInsertRowid), user: a.user, action: a.action, objectId: a.objectId ?? null, summary: a.summary, at };
}

export function listActivity(db: DB, limit = 200): Activity[] {
  return (
    db.prepare('SELECT id, user, action, object_id AS objectId, summary, at FROM activity ORDER BY id DESC LIMIT ?').all(limit) as unknown as Activity[]
  ).map((a) => ({ ...a }));
}
