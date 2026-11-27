const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openAuthStore(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS app_user (
      user_id TEXT PRIMARY KEY NOT NULL,
      email TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('USER', 'ADMIN')),
      account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'LOCKED')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_session (
      token_hash TEXT PRIMARY KEY NOT NULL,
      user_id TEXT NOT NULL REFERENCES app_user(user_id),
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS auth_session_expiry ON auth_session(expires_at);
  `);
  const insertUser = db.prepare(`
    INSERT INTO app_user (user_id, email, display_name, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING
  `);
  const findUser = db.prepare('SELECT * FROM app_user WHERE email = ?');
  const createSession = db.prepare('INSERT INTO auth_session (token_hash, user_id, expires_at) VALUES (?, ?, ?)');
  const revokeSession = db.prepare(`
    DELETE FROM auth_session WHERE token_hash = ?
    AND user_id IN (SELECT user_id FROM app_user WHERE role = ?)
  `);
  const pruneSessions = db.prepare('DELETE FROM auth_session WHERE expires_at <= ?');
  const findSession = db.prepare(`
    SELECT u.user_id, u.email, u.display_name, u.role, u.account_status, s.expires_at
    FROM auth_session s JOIN app_user u ON u.user_id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.account_status = 'ACTIVE' AND u.role = ?
  `);

  return {
    insertUser(user) {
      return Boolean(insertUser.run(user.user_id, user.email, user.display_name, user.password_hash,
        user.role, user.created_at, user.created_at).changes);
    },
    findUser(email) { return findUser.get(email); },
    findSession(tokenHash, role) { return findSession.get(tokenHash, Date.now(), role); },
    createSession(tokenHash, userId, expiresAt, previousHash, role) {
      pruneSessions.run(Date.now());
      createSession.run(tokenHash, userId, expiresAt);
      if (previousHash) revokeSession.run(previousHash, role);
    },
    revokeSession(tokenHash, role) { revokeSession.run(tokenHash, role); },
    transaction(write) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const result = write();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

module.exports = { openAuthStore };
