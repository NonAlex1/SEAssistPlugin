const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');

const SF_ORG_ALIAS = 'seassist-plugin';
const SF_INSTANCE_URL = 'https://extremesaas.my.salesforce.com';

// Find sf CLI binary
function findSfCli() {
  const candidates = [
    '/opt/homebrew/bin/sf',
    '/usr/local/bin/sf',
    '/usr/bin/sf',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Get access token from sf CLI for stored org
function getSfToken(sfBin) {
  return new Promise((resolve, reject) => {
    // NO_COLOR + TERM=dumb prevent sf from injecting ANSI escape codes into --json output
    const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', TERM: 'dumb' };
    execFile(sfBin, ['org', 'display', '--target-org', SF_ORG_ALIAS, '--json'], { env }, (err, stdout, stderr) => {
      try {
        // 1. Strip all ANSI/VT escape sequences (e.g. \x1b[0m injected by sf)
        // 2. Strip BOM (\uFEFF) and other C0/C1 control chars except \t \n \r
        const cleaned = stdout
          .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '') // ANSI sequences
          .replace(/\uFEFF/g, '')                                   // BOM
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');     // stray control chars

        // Find the outermost JSON object — skip any warning lines that precede it
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) {
          return reject(new Error('No JSON object found in sf org display output'));
        }
        const jsonStr = cleaned.slice(start, end + 1);
        const result = JSON.parse(jsonStr);
        const token = result?.result?.accessToken;
        if (token) {
          resolve(token);
        } else {
          reject(new Error('No accessToken field in sf org display result'));
        }
      } catch (e) {
        // Dump raw stdout (first 500 chars) so we can diagnose next time
        const preview = JSON.stringify(stdout.slice(0, 500));
        reject(new Error(`Failed to parse sf org display output: ${e.message} | stdout preview: ${preview}`));
      }
    });
  });
}

const app = express();
const PORT = 3002;
const SF_HOST = 'extremesaas.my.salesforce.com';
const SF_API_BASE = '/services/data/v59.0';
const TOKEN_FILE = path.join(__dirname, '.token');

// Load persisted token on startup
let sessionToken = null;
if (fs.existsSync(TOKEN_FILE)) {
  try {
    sessionToken = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    console.log('Loaded persisted session token.');
  } catch (_) {}
}

const ALLOWED_ORIGINS = [
  'https://localhost:3000',
  'https://127.0.0.1:3000',
  'https://nonalex1.github.io',
];

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

// Allow private network access from public GitHub Pages origin
// (Chrome's Private Network Access policy blocks public→private requests without this)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  next();
});

app.use(express.json());

// ── Auth endpoints ──────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  const sfBin = findSfCli();
  res.json({ ok: true, authenticated: !!sessionToken, sfCliAvailable: !!sfBin });
});

// ── SF CLI OAuth flow ───────────────────────────────────────────────────────

let loginInProgress = false;

app.post('/api/login/start', async (_req, res) => {
  const sfBin = findSfCli();
  if (!sfBin) return res.status(503).json({ error: 'sf CLI not found. Run: brew install sf' });
  if (loginInProgress) return res.json({ ok: true, status: 'pending' });

  loginInProgress = true;
  res.json({ ok: true, status: 'started' });

  // First try re-using an existing cached org token
  try {
    const token = await getSfToken(sfBin);
    sessionToken = token;
    fs.writeFileSync(TOKEN_FILE, token, 'utf8');
    loginInProgress = false;
    console.log('Re-used cached sf CLI token.');
    return;
  } catch { /* no cached token — do full login */ }

  // Full browser OAuth login — keep loginInProgress=true until token is stored
  execFile(sfBin, ['org', 'login', 'web',
    '--instance-url', SF_INSTANCE_URL,
    '--alias', SF_ORG_ALIAS,
    '--json',
  ], async (err, stdout, stderr) => {
    if (err) {
      console.error('sf org login web failed:', stderr);
      loginInProgress = false;
      return;
    }
    try {
      const token = await getSfToken(sfBin);
      sessionToken = token;
      fs.writeFileSync(TOKEN_FILE, token, 'utf8');
      console.log('SF CLI OAuth complete — token stored.');
    } catch (e) {
      console.error('Failed to retrieve token after login:', e.message);
    } finally {
      loginInProgress = false;   // only clear AFTER token is set (or failed)
    }
  });
});

app.get('/api/login/status', (_req, res) => {
  res.json({ authenticated: !!sessionToken, pending: loginInProgress });
});

// ── Manual token (fallback) ─────────────────────────────────────────────────

app.post('/api/auth', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  sessionToken = token.trim();
  fs.writeFileSync(TOKEN_FILE, sessionToken, 'utf8');
  res.json({ ok: true });
});

app.delete('/api/auth', (_req, res) => {
  sessionToken = null;
  if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
  res.json({ ok: true });
});

// ── Salesforce REST API proxy ───────────────────────────────────────────────

app.use('/api/sf', (req, res) => {
  if (!sessionToken) {
    return res.status(401).json({ error: 'Not authenticated. Please set your Salesforce session token.' });
  }

  const sfPath = SF_API_BASE + req.path;
  const queryString = new URLSearchParams(req.query).toString();
  const fullPath = queryString ? `${sfPath}?${queryString}` : sfPath;

  const options = {
    hostname: SF_HOST,
    path: fullPath,
    method: req.method,
    headers: {
      Authorization: `Bearer ${sessionToken}`,
      Cookie: `sid=${sessionToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  const sfReq = https.request(options, (sfRes) => {
    // If SF says session expired, clear the token so UI can prompt for a new one
    if (sfRes.statusCode === 401) {
      sessionToken = null;
      if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
      console.warn('Session expired — token cleared.');
    }
    res.status(sfRes.statusCode);
    Object.entries(sfRes.headers).forEach(([k, v]) => {
      if (k.toLowerCase() !== 'transfer-encoding') res.setHeader(k, v);
    });
    sfRes.pipe(res);
  });

  sfReq.on('error', (err) => {
    console.error('SF proxy error:', err.message);
    res.status(502).json({ error: 'Proxy error: ' + err.message });
  });

  if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body) {
    sfReq.write(JSON.stringify(req.body));
  }
  sfReq.end();
});

// ── Start (HTTPS using office-addin-dev-certs) ──────────────────────────────

const CERT_DIR = path.join(require('os').homedir(), '.office-addin-dev-certs');
const certFile = path.join(CERT_DIR, 'localhost.crt');
const keyFile  = path.join(CERT_DIR, 'localhost.key');

if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
  console.error('Dev certs not found. Run: npm run install-certs (from project root)');
  process.exit(1);
}

const httpsServer = require('https').createServer(
  { cert: fs.readFileSync(certFile), key: fs.readFileSync(keyFile) },
  app
);

httpsServer.listen(PORT, '127.0.0.1', () => {
  console.log(`SE Assist proxy listening on https://127.0.0.1:${PORT}`);
  console.log(`Authenticated: ${!!sessionToken}`);
});
