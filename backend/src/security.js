const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

function isLikelyJwt(token) {
  return typeof token === 'string' && token.split('.').length === 3
}

function apiKeyMiddleware(required, headerName = "authorization", scheme = "Bearer") {
  return (req, res, next) => {
    // Always allow CORS preflight
    if (req.method === 'OPTIONS') return next();
    if (!required) return next();
    const value = req.headers[headerName];
    // If RBAC is enforced and no API key is provided, allow JWT-based auth to handle it later
    if (!value) {
      if (String(process.env.RBAC_ENFORCE || '') === '1') return next();
      return res.status(401).json({ error: "missing authorization" });
    }
    const parts = String(value).split(/\s+/);
    const token = parts.length === 2 && parts[0].toLowerCase() === scheme.toLowerCase() ? parts[1] : parts[0];
    // If the header carries what looks like a JWT, defer to RBAC / OIDC verification
    if (isLikelyJwt(token)) return next();
    if (!token || token !== process.env.API_KEY) return res.status(403).json({ error: "forbidden" });
    return next();
  };
}

function parseRateLimit(input) {
  // Format: "<max>/<window>" e.g. "1000/15m", "300/1m", "10000/1h"
  // Defaults to 1000/15m
  const def = { max: 1000, windowMs: 15 * 60 * 1000 };
  if (!input) return def;
  try {
    const [maxStr, winStr] = String(input).split('/')
    const max = Number(maxStr);
    if (!Number.isFinite(max)) return def;
    const m = String(winStr || '').match(/^(\d+)(ms|s|m|h)$/);
    if (!m) return def;
    const n = Number(m[1]);
    const unit = m[2];
    const mult = unit === 'ms' ? 1 : unit === 's' ? 1000 : unit === 'm' ? 60*1000 : 60*60*1000;
    return { max, windowMs: n * mult };
  } catch { return def; }
}

function rateLimitKey(req) {
  const keyId = req.headers['x-api-key-id'];
  if (keyId) return `key:${String(keyId)}`;
  const auth = req.headers['authorization'];
  if (auth) return `auth:${String(auth).slice(0,32)}`;
  return `ip:${req.ip}`;
}

function applySecurity(app) {
  app.disable("x-powered-by");
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  const { max, windowMs } = parseRateLimit(process.env.RATE_LIMIT);
  const limiter = rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    // Do not rate-limit high-volume, idempotent GETs used by charts
    skip: (req) => {
      try {
        if ((req.method || 'GET').toUpperCase() !== 'GET') return false
        const orig = String(req.originalUrl || '')
        const path = String(req.path || '')
        const isChart = orig.startsWith('/api/timeseries') || orig.startsWith('/api/kpis') ||
                        orig.startsWith('/api/devices') || orig.startsWith('/api/metrics') ||
                        path.startsWith('/timeseries') || path.startsWith('/kpis') ||
                        path.startsWith('/devices') || path.startsWith('/metrics')
        return isChart
      } catch { return false }
    }
  });
  app.use("/api", limiter);
}

// -------- HMAC anti-replay (optional) --------
function getHmacSecret(keyId) {
  if (!keyId) return null;
  // Option A: single key via env
  if (process.env.API_HMAC_KEY_ID && process.env.API_HMAC_SECRET && keyId === process.env.API_HMAC_KEY_ID) {
    return process.env.API_HMAC_SECRET;
  }
  // Option B: JSON map via env API_HMAC_KEYS = { "id1": "secret1", ... }
  try {
    const map = JSON.parse(process.env.API_HMAC_KEYS || '{}');
    if (map && typeof map === 'object' && map[keyId]) return String(map[keyId]);
  } catch {}
  return null;
}

function constantTimeEqual(a, b) {
  const A = Buffer.from(String(a), 'hex');
  const B = Buffer.from(String(b), 'hex');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

function verifyHmac({ method, pathWithQuery, bodyText, dateStr, keyId, signatureHex, maxSkewMs = 5 * 60 * 1000 }) {
  if (!keyId || !signatureHex || !dateStr) return { ok: false, reason: 'missing headers' };
  const secret = getHmacSecret(keyId);
  if (!secret) return { ok: false, reason: 'unknown key' };
  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) return { ok: false, reason: 'bad date' };
  const skew = Math.abs(Date.now() - ts);
  if (skew > maxSkewMs) return { ok: false, reason: 'clock skew' };
  const payload = [String(method || '').toUpperCase(), String(pathWithQuery || ''), dateStr, bodyText || ''].join('\n');
  const h = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const ok = constantTimeEqual(h, signatureHex.toLowerCase());
  return ok ? { ok: true } : { ok: false, reason: 'mismatch' };
}

function hmacMiddleware(enforce = false) {
  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();
    const keyId = String(req.headers['x-api-key-id'] || '');
    const signature = String(req.headers['x-api-signature'] || '');
    const dateStr = String(req.headers['x-api-date'] || '');
    const bodyText = req.method === 'GET' || req.method === 'HEAD' ? '' : JSON.stringify(req.body || {});
    if (!keyId || !signature || !dateStr) {
      if (enforce) return res.status(401).json({ error: 'hmac required' });
      return next();
    }
    const check = verifyHmac({ method: req.method, pathWithQuery: req.originalUrl, bodyText, dateStr, keyId, signatureHex: signature });
    if (!check.ok) return res.status(403).json({ error: 'invalid signature', reason: check.reason });
    return next();
  };
}

// -------- Audit logging (basic, append-only) --------
function recordAudit(action) {
  const file = process.env.AUDIT_LOG_FILE || path.resolve(process.cwd(), 'audit.log');
  return (req, _res, next) => {
    const entry = {
      ts: new Date().toISOString(),
      ip: req.ip,
      method: req.method,
      path: req.originalUrl,
      action,
      keyId: req.headers['x-api-key-id'] || null,
      auth: req.headers['authorization'] ? 'present' : 'absent',
      query: req.query || {},
    };
    try { fs.appendFile(file, JSON.stringify(entry) + '\n', () => {}); } catch {}
    next();
  };
}

module.exports = { applySecurity, apiKeyMiddleware, hmacMiddleware, recordAudit };
// ================= OIDC + RBAC (optional) =================

function b64urlToBuf(s) {
  s = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4;
  if (pad) s += '='.repeat(4 - pad);
  return Buffer.from(s, 'base64');
}

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error('HTTP ' + res.statusCode));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const jwksCache = { byKid: new Map(), exp: 0, jwksUri: null };
async function getJwks(issuer) {
  const now = Date.now();
  if (jwksCache.exp > now && jwksCache.byKid.size) return jwksCache;
  const wellKnown = issuer.replace(/\/$/, '') + '/.well-known/openid-configuration';
  let jwksUri = process.env.OIDC_JWKS_URL || '';
  if (!jwksUri) {
    try {
      const conf = await fetchJson(wellKnown);
      jwksUri = conf.jwks_uri;
      const force = String(process.env.OIDC_FORCE_ISSUER_JWKS || '1') === '1';
      if (force || !jwksUri) {
        jwksUri = issuer.replace(/\/$/, '') + '/protocol/openid-connect/certs';
      }
    } catch {
      // Fallback to issuer-derived JWKS URL
      jwksUri = issuer.replace(/\/$/, '') + '/protocol/openid-connect/certs';
    }
  }
  const jwks = await fetchJson(jwksUri);
  const byKid = new Map();
  for (const k of (jwks.keys || [])) {
    if (k.kty === 'RSA' && k.n && k.e && k.kid) {
      const pub = crypto.createPublicKey({ key: rsaPublicKeyPem(k.n, k.e), format: 'pem', type: 'spki' });
      byKid.set(k.kid, pub);
    }
  }
  jwksCache.byKid = byKid; jwksCache.exp = now + 10 * 60 * 1000; jwksCache.jwksUri = jwksUri;
  return jwksCache;
}

function rsaPublicKeyPem(modulusB64Url, exponentB64Url) {
  // Build an ASN.1 DER RSAPublicKey and convert to SPKI PEM
  // Simpler approach: use node-forge-like structure manually; here we use a minimal DER builder.
  const n = b64urlToBuf(modulusB64Url);
  const e = b64urlToBuf(exponentB64Url);
  function derInt(buf) {
    // Ensure positive integer with leading 0x00 if high bit set
    if (buf[0] & 0x80) buf = Buffer.concat([Buffer.from([0]), buf]);
    return Buffer.concat([Buffer.from([0x02]), derLen(buf.length), buf]);
  }
  function derLen(len) {
    if (len < 128) return Buffer.from([len]);
    const bytes = [];
    let l = len; while (l) { bytes.unshift(l & 0xff); l >>= 8; }
    return Buffer.from([0x80 | bytes.length, ...bytes]);
  }
  const seq = Buffer.concat([
    Buffer.from([0x30]), // SEQUENCE
    derLen(
      derInt(n).length + derInt(e).length
    ),
    derInt(n), derInt(e)
  ]);
  // Wrap RSAPublicKey into SubjectPublicKeyInfo (SPKI)
  const rsaOid = Buffer.from([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const bitString = Buffer.concat([Buffer.from([0x03]), derLen(seq.length + 1), Buffer.from([0x00]), seq]);
  const spki = Buffer.concat([Buffer.from([0x30]), derLen(rsaOid.length + bitString.length), rsaOid, bitString]);
  const pem = '-----BEGIN PUBLIC KEY-----\n' + spki.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----\n';
  return pem;
}

async function verifyJwt(token, { issuer, audience }) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('invalid token');
  const [hB64, pB64, sB64] = parts;
  const header = JSON.parse(b64urlToBuf(hB64).toString('utf8'));
  const payload = JSON.parse(b64urlToBuf(pB64).toString('utf8'));
  // In some deployments (proxy/compose), the browser reaches Keycloak via
  // http://localhost while the API reaches it via http://keycloak. Allow
  // skipping strict issuer match when OIDC_IGNORE_ISSUER=1.
  if (String(process.env.OIDC_IGNORE_ISSUER || '0') !== '1') {
    if (issuer && payload.iss !== issuer) throw new Error('bad iss');
  }
  if (audience && !(Array.isArray(payload.aud) ? payload.aud.includes(audience) : payload.aud === audience)) throw new Error('bad aud');
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) throw new Error('expired');
  const { byKid } = await getJwks(issuer);
  const key = byKid.get(header.kid);
  if (!key) throw new Error('unknown kid');
  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(Buffer.from(hB64 + '.' + pB64));
  verifier.end();
  const ok = verifier.verify(key, b64urlToBuf(sB64));
  if (!ok) throw new Error('bad signature');
  return payload;
}

function extractRoles(payload, clientId) {
  const roles = new Set();
  if (payload && payload.realm_access && Array.isArray(payload.realm_access.roles)) {
    for (const r of payload.realm_access.roles) roles.add(String(r));
  }
  if (payload && payload.resource_access && clientId && payload.resource_access[clientId] && Array.isArray(payload.resource_access[clientId].roles)) {
    for (const r of payload.resource_access[clientId].roles) roles.add(String(r));
  }
  return Array.from(roles);
}

function requireAuth(enforce = false) {
  return async (req, res, next) => {
    if (!enforce) return next();
    const allowApiKey = String(process.env.ALLOW_API_KEY_WITH_RBAC || '1') === '1';
    const auth = String(req.headers['authorization'] || '');
    const m = auth.match(/Bearer\s+(.+)/i);
    const token = m ? m[1] : '';
    const issuer = process.env.OIDC_ISSUER_URL;
    const clientId = process.env.OIDC_CLIENT_ID;
    const requireAud = String(process.env.OIDC_REQUIRE_AUD || '0') === '1';
    const audience = requireAud ? clientId : undefined;
    try {
      if (token && issuer) {
        const payload = await verifyJwt(token, { issuer, audience });
        req.user = {
          sub: payload.sub,
          roles: extractRoles(payload, clientId),
          token: payload,
        };
        return next();
      }
    } catch (e) {
      // fallthrough to API key if allowed
    }
    if (allowApiKey && process.env.API_KEY && auth && auth.endsWith(process.env.API_KEY)) {
      // Treat API key holders as admin by default, or env override
      const role = process.env.API_KEY_ROLE || 'admin';
      req.user = { sub: 'api-key', roles: [role] };
      return next();
    }
    return res.status(401).json({ error: 'unauthorized' });
  };
}

function requireRole(role, enforce = false) {
  return async (req, res, next) => {
    if (!enforce) return next();
    const has = Array.isArray(req.user?.roles) && (req.user.roles.includes('admin') || req.user.roles.includes(role));
    if (!has) return res.status(403).json({ error: 'forbidden', need: role });
    return next();
  };
}

module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
