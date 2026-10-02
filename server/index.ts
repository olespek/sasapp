import { randomBytes } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { hashPassword } from './auth.js';
import { openDb } from './db.js';
import * as repo from './repo.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), process.env.NODE_ENV === 'production' ? '../..' : '..');
const dbPath = process.env.DATABASE_PATH ?? join(root, 'data', 'sasapp.db');
const port = Number(process.env.PORT ?? 3001);

const db = openDb(dbPath);

// Første oppstart: opprett en administrator.
if (repo.countUsers(db) === 0) {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');
  repo.createUser(db, { username, name: 'Administrator', role: 'admin', passwordHash: hashPassword(password) });
  console.log('\n  Opprettet første administrator:');
  console.log(`    brukernavn: ${username}`);
  if (!process.env.ADMIN_PASSWORD) console.log(`    passord:    ${password}   (bytt det etter første innlogging)`);
  console.log('');
}

const { app } = createApp(db, {
  staticDir: process.env.NODE_ENV === 'production' ? join(root, 'dist') : undefined,
});

app.listen(port, () => {
  console.log(`Sola Airshow-planlegger kjører på http://localhost:${port}`);
});
