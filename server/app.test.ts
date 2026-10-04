import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { openDb, type DB } from './db.js';
import * as repo from './repo.js';

const H = { 'X-Requested-With': 'sasapp' };

const polygon = {
  type: 'Polygon',
  coordinates: [[[5.64, 58.887], [5.645, 58.887], [5.645, 58.888], [5.64, 58.888], [5.64, 58.887]]],
};

let db: DB;
let app: ReturnType<typeof createApp>['app'];

async function login(username: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').set(H).send({ username, password: 'passord123' }).expect(200);
  return agent;
}

beforeEach(() => {
  db = openDb(':memory:');
  for (const [username, role] of [['admin', 'admin'], ['red', 'editor'], ['les', 'viewer']] as const) {
    repo.createUser(db, { username, name: username, role, passwordHash: hashPassword('passord123') });
  }
  app = createApp(db).app;
});

describe('innlogging', () => {
  it('avviser feil passord og krever innlogging for planen', async () => {
    await request(app).post('/api/auth/login').set(H).send({ username: 'admin', password: 'feil' }).expect(401);
    await request(app).get('/api/plan').expect(401);
  });

  it('gir tilgang etter innlogging', async () => {
    const a = await login('les');
    const res = await a.get('/api/plan').expect(200);
    expect(res.body.access).toMatchObject({ canEdit: false, isAdmin: false, viaShare: false });
  });

  it('krever X-Requested-With på endringer', async () => {
    const a = await login('red');
    await a.post('/api/objects').send({ type: 'publikumsomrade', geometry: polygon }).expect(403);
  });
});

describe('objekter og rettigheter', () => {
  it('redaktør kan opprette, endre og slette', async () => {
    const a = await login('red');
    const created = await a.post('/api/objects').set(H).send({ type: 'publikumsomrade', name: 'Sør', geometry: polygon }).expect(201);
    expect(created.body.props.status).toBe('planned');
    const upd = await a.patch(`/api/objects/${created.body.id}`).set(H).send({ props: { status: 'confirmed', quantity: 3 } }).expect(200);
    expect(upd.body.props).toMatchObject({ status: 'confirmed', quantity: 3 });
    await a.delete(`/api/objects/${created.body.id}`).set(H).expect(200);
    expect(repo.listObjects(db)).toHaveLength(0);
  });

  it('leser kan ikke redigere', async () => {
    const a = await login('les');
    await a.post('/api/objects').set(H).send({ type: 'publikumsomrade', geometry: polygon }).expect(403);
  });

  it('utgåtte typer kan ikke legges til, men eksisterende kan fortsatt endres', async () => {
    const a = await login('red');
    const line = { type: 'LineString', coordinates: [[5.64, 58.887], [5.645, 58.887]] };
    await a.post('/api/objects').set(H).send({ type: 'kjorevei', geometry: line }).expect(400);
    const now = new Date().toISOString();
    repo.insertObject(db, { id: 'gammel', type: 'kjorevei', name: '', geometry: line as never, props: { status: 'planned', responsible: '', supplier: '', quantity: null, dueDate: null, notes: '' }, createdBy: null, updatedBy: null, createdAt: now, updatedAt: now });
    await a.patch('/api/objects/gammel').set(H).send({ name: 'Ny' }).expect(200);
    await a.patch('/api/objects/gammel').set(H).send({ type: 'gjerde_lavt' }).expect(200);
    await a.patch('/api/objects/gammel').set(H).send({ type: 'gangvei' }).expect(400);
  });

  it('avviser feil geometritype', async () => {
    const a = await login('red');
    await a.post('/api/objects').set(H).send({ type: 'toalett', geometry: polygon }).expect(400);
  });

  it('låst plan kan bare redigeres av administrator', async () => {
    const admin = await login('admin');
    const red = await login('red');
    await red.post('/api/plan/lock').set(H).send({ locked: true }).expect(403);
    await admin.post('/api/plan/lock').set(H).send({ locked: true }).expect(200);
    await red.post('/api/objects').set(H).send({ type: 'publikumsomrade', geometry: polygon }).expect(403);
    await admin.post('/api/objects').set(H).send({ type: 'publikumsomrade', geometry: polygon }).expect(201);
    const me = await red.get('/api/auth/me').expect(200);
    expect(me.body.canEdit).toBe(false);
  });

  it('fly krever gyldig flytype og normaliserer retning', async () => {
    const a = await login('red');
    const geometry = { type: 'Point', coordinates: [5.644, 58.887] };
    await a.post('/api/objects').set(H).send({ type: 'fly', geometry, props: { aircraftModel: 'ukjent' } }).expect(400);
    const res = await a.post('/api/objects').set(H).send({ type: 'fly', geometry, props: { aircraftModel: 'f16', heading: -90 } }).expect(201);
    expect(res.body.props.heading).toBe(270);
  });
});

describe('delingslenke', () => {
  it('gir lesetilgang bare når den er slått på og nøkkelen stemmer', async () => {
    const admin = await login('admin');
    const share = (await admin.get('/api/share').expect(200)).body;
    expect(share.enabled).toBe(false);
    await request(app).get(`/api/plan?share=${share.token}`).expect(401);

    await admin.post('/api/share').set(H).send({ enabled: true }).expect(200);
    const res = await request(app).get(`/api/plan?share=${share.token}`).expect(200);
    expect(res.body.access).toMatchObject({ viaShare: true, canEdit: false, user: null });
    await request(app).get('/api/plan?share=feil').expect(401);
    await request(app).post(`/api/objects?share=${share.token}`).set(H).send({ type: 'toalett' }).expect(401);
    await request(app).get(`/api/activity?share=${share.token}`).expect(401);

    const fresh = (await admin.post('/api/share').set(H).send({ regenerate: true }).expect(200)).body;
    await request(app).get(`/api/plan?share=${share.token}`).expect(401);
    await request(app).get(`/api/plan?share=${fresh.token}`).expect(200);
  });
});

describe('versjoner', () => {
  it('lagrer og gjenoppretter', async () => {
    const admin = await login('admin');
    await admin.post('/api/objects').set(H).send({ type: 'publikumsomrade', geometry: polygon }).expect(201);
    const v = (await admin.post('/api/versions').set(H).send({ name: 'Rev A' }).expect(201)).body;
    await admin.post('/api/objects').set(H).send({ type: 'publikumsomrade', geometry: polygon }).expect(201);
    expect(repo.listObjects(db)).toHaveLength(2);
    await admin.post(`/api/versions/${v.id}/restore`).set(H).expect(200);
    expect(repo.listObjects(db)).toHaveLength(1);
    expect(repo.listVersions(db)).toHaveLength(2); // inkl. automatisk sikkerhetskopi
  });
});

describe('brukere', () => {
  it('kan ikke fjerne siste administrator', async () => {
    const admin = await login('admin');
    const me = repo.findUserByUsername(db, 'admin')!;
    await admin.patch(`/api/users/${me.id}`).set(H).send({ role: 'editor' }).expect(400);
  });

  it('administrator kan opprette brukere', async () => {
    const admin = await login('admin');
    await admin.post('/api/users').set(H).send({ username: 'ny', name: 'Ny Bruker', role: 'editor', password: 'kort' }).expect(400);
    await admin.post('/api/users').set(H).send({ username: 'ny', name: 'Ny Bruker', role: 'editor', password: 'langtpassord' }).expect(201);
    await admin.post('/api/users').set(H).send({ username: 'NY', name: 'x', role: 'editor', password: 'langtpassord' }).expect(409);
  });
});
