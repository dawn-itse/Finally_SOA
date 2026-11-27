const { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } = require('node:crypto');
const express = require('express');
const { promisify } = require('node:util');
const { openAuthStore } = require('./store');
const { pool } = require('../../../database/pool');
const { reply, fail, jsonBody, methodNotAllowed, listenService } = require('../../../lib/http');

const AUTH_PREFIX = '/api/v1/auth/';
const SESSION_ROUTE = AUTH_PREFIX + 'session';
const REGISTER_ROUTE = AUTH_PREFIX + 'register';
const SESSION_SECONDS = 8 * 60 * 60;
const KDF_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = promisify(scrypt);
const DUMMY_HASH = randomBytes(16).toString('hex') + ':' + randomBytes(64).toString('hex');

function credentials(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' || !password.length || password.length > 128) {
    throw { status: 400, publicMessage: 'Email hoặc mật khẩu không hợp lệ.' };
  }
  return { email, password };
}

async function makeUser(body, role) {
  const { email, password } = credentials(body);
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!displayName || displayName.length > 80 || password.length < 8) {
    throw { status: 400, publicMessage: 'Tên hiển thị dài 1–80 ký tự và mật khẩu dài 8–128 ký tự.' };
  }
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, KDF_OPTIONS);
  return {
    user_id: randomUUID(), email, display_name: displayName, role, account_status: 'ACTIVE',
    password_hash: salt.toString('hex') + ':' + hash.toString('hex'), created_at: new Date()
  };
}

async function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':').map((value) => Buffer.from(value, 'hex'));
  const digest = await derive(password, salt, 64, KDF_OPTIONS);
  return timingSafeEqual(hash, digest);
}

function publicUser({ user_id, email, display_name, role, account_status }) {
  return { user_id, email, display_name, role, account_status };
}

function cookieToken(req, cookieName) {
  const cookie = req.headers.cookie?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(cookieName + '='));
  const token = cookie?.slice(cookieName.length + 1);
  return /^[\w-]{43}$/.test(token ?? '') ? token : null;
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function sessionCookie(name, token, maxAge, secure) {
  return `${name}=${token}; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

function createAuthRouter(store = openAuthStore(pool)) {
  const router = express.Router();
  const secure = process.env.AUTH_COOKIE_SECURE === '1';
  const attempts = new Map();
  let pendingHashes = 0;

  async function issueSession(tx, user, cookieName, previousHash) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
    await tx.createSession(tokenHash(token), user.user_id, expiresAt, previousHash, user.role);
    return {
      data: { user: publicUser(user), expires_at: expiresAt.toISOString() },
      cookie: sessionCookie(cookieName, token, SESSION_SECONDS, secure)
    };
  }

  function portalContext(req, res, next) {
    const portal = req.query.portal ?? 'user';
    if (!['user', 'admin'].includes(portal) || (req.path === REGISTER_ROUTE && portal !== 'user')) {
      return fail(res, 400, 'Trang đăng nhập không hợp lệ.');
    }
    const role = portal === 'admin' ? 'ADMIN' : 'USER';
    const name = portal === 'admin' ? 'mgd_admin_session' : 'mgd_user_session';
    const token = cookieToken(req, name);
    res.locals.auth = { role, name, hash: token && tokenHash(token) };
    next();
  }

  function requireSameOrigin(req, res, next) {
    const origin = req.get('Origin');
    if (origin && origin !== `http${secure ? 's' : ''}://${req.get('Host')}`) {
      return fail(res, 403, 'Nguồn yêu cầu không hợp lệ.');
    }
    next();
  }

  function limitPasswords(handler) {
    return async (req, res) => {
      const now = Date.now();
      for (const [ip, attempt] of attempts) if (attempt.until <= now) attempts.delete(ip);
      const ip = req.socket.remoteAddress;
      const attempt = attempts.get(ip) ?? { count: 0, until: now + 60_000 };
      if (pendingHashes >= 4 || attempt.count >= 15 || (!attempts.has(ip) && attempts.size >= 10_000)) {
        return fail(res.set('Retry-After', '60'), 429, 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.');
      }
      attempt.count++;
      attempts.set(ip, attempt);
      pendingHashes++;
      try {
        await handler(req, res);
      } finally {
        pendingHashes--;
      }
    };
  }

  router.post(REGISTER_ROUTE, portalContext, requireSameOrigin, jsonBody, limitPasswords(async (req, res) => {
    const { name, hash } = res.locals.auth;
    const user = await makeUser(req.body, 'USER');
    const session = await store.transaction(async (tx) => {
      if (!await tx.insertUser(user)) return null;
      return issueSession(tx, user, name, hash);
    });
    if (!session) return fail(res, 409, 'Email đã được sử dụng.');
    return reply(res.set('Set-Cookie', session.cookie), 201, { success: true, data: session.data });
  }));
  router.all(REGISTER_ROUTE, methodNotAllowed('POST'));

  router.post(SESSION_ROUTE, portalContext, requireSameOrigin, jsonBody, limitPasswords(async (req, res) => {
    const { role, name, hash } = res.locals.auth;
    const { email, password } = credentials(req.body);
    const user = await store.findUser(email);
    const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
    if (!valid || !user) return fail(res, 401, 'Email hoặc mật khẩu không đúng.');
    if (user.account_status !== 'ACTIVE' || user.role !== role) {
      return fail(res, 403, 'Tài khoản không có quyền đăng nhập vào trang này.');
    }
    const session = await store.transaction(async (tx) => {
      const current = await tx.findUser(email, true);
      if (current?.password_hash !== user.password_hash || current.account_status !== 'ACTIVE' || current.role !== role) {
        return null;
      }
      return issueSession(tx, current, name, hash);
    });
    if (!session) return fail(res, 403, 'Tài khoản không có quyền đăng nhập vào trang này.');
    return reply(res.set('Set-Cookie', session.cookie), 200, { success: true, data: session.data });
  }));
  router.head(SESSION_ROUTE, methodNotAllowed('GET', 'POST', 'DELETE'));
  router.get(SESSION_ROUTE, portalContext, async (_req, res) => {
    const { role, hash } = res.locals.auth;
    const session = hash && await store.findSession(hash, role);
    if (!session) return fail(res, 401, 'Phiên đăng nhập không còn hiệu lực.');
    return reply(res, 200, { success: true, data: {
      user: publicUser(session), expires_at: session.expires_at.toISOString()
    } });
  });
  router.delete(SESSION_ROUTE, portalContext, requireSameOrigin, async (_req, res) => {
    const { role, name, hash } = res.locals.auth;
    if (hash) await store.revokeSession(hash, role);
    return reply(res.set('Set-Cookie', sessionCookie(name, '', 0, secure)), 200, { success: true });
  });
  router.all(SESSION_ROUTE, methodNotAllowed('GET', 'POST', 'DELETE'));

  return router;
}

async function createAdmin() {
  try {
    const user = await makeUser({
      email: process.env.AUTH_ADMIN_EMAIL, password: process.env.AUTH_ADMIN_PASSWORD,
      display_name: process.env.AUTH_ADMIN_NAME || 'Quản trị viên'
    }, 'ADMIN');
    if (!await openAuthStore(pool).insertUser(user)) throw new Error('Email đã tồn tại.');
    console.log('Đã tạo tài khoản Admin.');
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  if (process.argv.includes('--create-admin')) {
    createAdmin().catch((error) => {
      console.error(error.code || error.publicMessage || error.message);
      process.exitCode = 1;
    });
  } else {
    listenService(createAuthRouter(), Number(process.env.AUTH_PORT) || 4007, 'Auth Service');
  }
}

module.exports = { createAuthRouter };
