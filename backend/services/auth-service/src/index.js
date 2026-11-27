const { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } = require('node:crypto');
const { existsSync } = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');
const { promisify } = require('node:util');
const { openAuthStore } = require('./store');

const AUTH_PREFIX = '/api/v1/auth/';
const SESSION_ROUTE = AUTH_PREFIX + 'session';
const REGISTER_ROUTE = AUTH_PREFIX + 'register';
const CONFIG_DIR = path.resolve(__dirname, '../../..');
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_BODY = 4096;
const KDF_OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = promisify(scrypt);
const DUMMY_HASH = randomBytes(16).toString('hex') + ':' + randomBytes(64).toString('hex');

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
const fail = (res, status, error, headers) => send(res, status, { success: false, error }, headers);

async function readJson(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw { status: 415, message: 'Nội dung yêu cầu phải là JSON.' };
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.resume();
      throw { status: 413, message: 'Nội dung yêu cầu quá dài.' };
    }
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch { /* Invalid JSON is handled below. */ }
  throw { status: 400, message: 'JSON không hợp lệ.' };
}

function credentials(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = body.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof password !== 'string' || !password.length || password.length > 128) {
    throw { status: 400, message: 'Email hoặc mật khẩu không hợp lệ.' };
  }
  return { email, password };
}

async function makeUser(body, role) {
  const { email, password } = credentials(body);
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!displayName || displayName.length > 80 || password.length < 8) {
    throw { status: 400, message: 'Tên hiển thị dài 1–80 ký tự và mật khẩu dài 8–128 ký tự.' };
  }
  const salt = randomBytes(16);
  const hash = await derive(password, salt, 64, KDF_OPTIONS);
  return {
    user_id: randomUUID(), email, display_name: displayName, role, account_status: 'ACTIVE',
    password_hash: salt.toString('hex') + ':' + hash.toString('hex'), created_at: new Date().toISOString()
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

function databasePath() {
  const filename = process.env.AUTH_DB_PATH?.trim();
  return filename === ':memory:' ? filename : path.resolve(CONFIG_DIR, filename || 'data/auth.sqlite');
}

function createAuthHandler(store = openAuthStore(databasePath())) {
  const secure = process.env.AUTH_COOKIE_SECURE === '1';
  const attempts = new Map();
  let pendingHashes = 0;

  function issueSession(user, cookieName, previousHash) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_SECONDS * 1000;
    store.createSession(tokenHash(token), user.user_id, expiresAt, previousHash, user.role);
    return {
      data: { user: publicUser(user), expires_at: new Date(expiresAt).toISOString() },
      cookie: sessionCookie(cookieName, token, SESSION_SECONDS, secure)
    };
  }

  async function handle(req, res, url) {
    const register = url.pathname === REGISTER_ROUTE;
    if (!register && url.pathname !== SESSION_ROUTE) return fail(res, 404, 'Không tìm thấy API tài khoản.');
    const allow = register ? ['POST'] : ['GET', 'POST', 'DELETE'];
    if (!allow.includes(req.method)) return fail(res, 405, 'Phương thức không được hỗ trợ.', { Allow: allow.join(', ') });
    const portal = url.searchParams.get('portal') ?? 'user';
    if (!['user', 'admin'].includes(portal) || (register && portal !== 'user')) {
      return fail(res, 400, 'Trang đăng nhập không hợp lệ.');
    }
    const role = portal === 'admin' ? 'ADMIN' : 'USER';
    const name = portal === 'admin' ? 'mgd_admin_session' : 'mgd_user_session';
    const token = cookieToken(req, name);
    const hash = token && tokenHash(token);
    if (req.method === 'GET') {
      const session = hash && store.findSession(hash, role);
      if (!session) return fail(res, 401, 'Phiên đăng nhập không còn hiệu lực.');
      return send(res, 200, { success: true, data: {
        user: publicUser(session), expires_at: new Date(session.expires_at).toISOString()
      } });
    }
    const origin = req.headers.origin;
    if (origin && origin !== `http${secure ? 's' : ''}://${req.headers.host}`) {
      return fail(res, 403, 'Nguồn yêu cầu không hợp lệ.');
    }
    if (req.method === 'DELETE') {
      if (hash) store.revokeSession(hash, role);
      return send(res, 200, { success: true }, { 'Set-Cookie': sessionCookie(name, '', 0, secure) });
    }

    const body = await readJson(req);
    const { email, password } = credentials(body);
    const now = Date.now();
    for (const [ip, attempt] of attempts) if (attempt.until <= now) attempts.delete(ip);
    const ip = req.socket.remoteAddress;
    const attempt = attempts.get(ip) ?? { count: 0, until: now + 60_000 };
    if (pendingHashes >= 4 || attempt.count >= 15 || (!attempts.has(ip) && attempts.size >= 10_000)) {
      return fail(res, 429, 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.', { 'Retry-After': '60' });
    }
    attempt.count++;
    attempts.set(ip, attempt);
    pendingHashes++;
    try {
      if (register) {
        const user = await makeUser(body, 'USER');
        const session = store.transaction(() => {
          if (!store.insertUser(user)) return null;
          return issueSession(user, name, hash);
        });
        if (!session) return fail(res, 409, 'Email đã được sử dụng.');
        return send(res, 201, { success: true, data: session.data }, { 'Set-Cookie': session.cookie });
      }
      const user = store.findUser(email);
      const valid = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
      if (!valid || !user) return fail(res, 401, 'Email hoặc mật khẩu không đúng.');
      if (user.account_status !== 'ACTIVE' || user.role !== role) {
        return fail(res, 403, 'Tài khoản không có quyền đăng nhập vào trang này.');
      }
      const session = store.transaction(() => {
        const current = store.findUser(email);
        if (current?.password_hash !== user.password_hash || current.account_status !== 'ACTIVE' || current.role !== role) {
          return null;
        }
        return issueSession(current, name, hash);
      });
      if (!session) return fail(res, 403, 'Tài khoản không có quyền đăng nhập vào trang này.');
      return send(res, 200, { success: true, data: session.data }, { 'Set-Cookie': session.cookie });
    } finally {
      pendingHashes--;
    }
  }

  return async (req, res, url) => {
    try {
      await handle(req, res, url);
    } catch (error) {
      if (res.destroyed) return;
      if (error.status) return fail(res, error.status, error.message);
      console.error('Auth Service:', error.code || error.name);
      return fail(res, 500, 'Dịch vụ tài khoản tạm thời không khả dụng.');
    }
  };
}

async function main() {
  const envFile = path.join(CONFIG_DIR, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const store = openAuthStore(databasePath());
  if (process.argv.includes('--create-admin')) {
    const user = await makeUser({
      email: process.env.AUTH_ADMIN_EMAIL, password: process.env.AUTH_ADMIN_PASSWORD,
      display_name: process.env.AUTH_ADMIN_NAME || 'Quản trị viên'
    }, 'ADMIN');
    if (!store.insertUser(user)) throw new Error('Email đã tồn tại. Hãy dùng email Admin khác.');
    console.log('Đã tạo tài khoản Admin.');
    return;
  }
  const handleAuth = createAuthHandler(store);
  const port = Number(process.env.AUTH_PORT) || 4007;
  createServer((req, res) => {
    void handleAuth(req, res, new URL(req.url, 'http://localhost'));
  }).listen(port, '127.0.0.1', () => console.log(`Auth Service đang chạy tại http://127.0.0.1:${port}`));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { AUTH_PREFIX, createAuthHandler };
