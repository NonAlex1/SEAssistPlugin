const express = require('express');
const https = require('https');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

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

app.use(cors({ origin: ['https://localhost:3000', 'http://localhost:3000'] }));
app.use(express.json());

// ── Auth endpoints ──────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, authenticated: !!sessionToken });
});

app.post('/api/auth', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });
  sessionToken = token.trim();
  // Persist so it survives proxy restarts
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

// ── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, '127.0.0.1', () => {
  console.log(`SE Assist proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`Authenticated: ${!!sessionToken}`);
});
