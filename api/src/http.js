import crypto from 'node:crypto';

// Security headers set by hand (the same ones the helmet package would add for a JSON API, without a new dependency).
export function securityHeaders(_req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'cross-origin',   // the web app is on another origin and reads these responses
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  res.removeHeader('X-Powered-By');
  next();
}

// A caller-supplied id is kept only if it is short and plain, so a log line cannot be forged through it.
const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

// One log line per request: method, path (without the query string, which may carry filters), status, milliseconds,
// user id and request id. Tokens, request bodies and query values are never logged.
export function requestLog({ write = (line) => console.log(line), enabled = () => process.env.NODE_ENV !== 'test' } = {}) {
  return (req, res, next) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && SAFE_ID.test(incoming) ? incoming : crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (!enabled()) return;
      const path = req.originalUrl.split('?')[0].replace(/^\/public\/report\/[^/]+\/?$/i, '/public/report/[redacted]');
      write(JSON.stringify({
        t: new Date().toISOString(), id: req.id, method: req.method, path,
        status: res.statusCode, ms: Math.round(Number(process.hrtime.bigint() - started) / 1e4) / 100, user: req.user?.sub ?? null,
      }));
    });
    next();
  };
}
