// Herbal product site: public page + admin page. No dependencies. Run with: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(ROOT, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const SESSION_MS = 12 * 60 * 60 * 1000;
const sessions = new Map(); // token -> expiry time

[DATA_DIR, UPLOADS_DIR].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const DEFAULT_CONTENT = {
  siteName: 'Herbal Product',
  blocks: [],
  orderForm: {
    title: 'Place an order',
    buttonLabel: 'Send order',
    products: ['Herbal product'],
    successMessage: 'Thank you. We have received your order and will contact you shortly.',
  },
  closingText: '',
  footer: { text: '', contact: '' },
};

// ---------- helpers ----------

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function newId() {
  return 'b' + crypto.randomBytes(6).toString('hex');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function text(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        return reject(httpError(413, 'Request is too large.'));
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJsonBody(req) {
  const raw = await readBody(req);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw httpError(400, 'Invalid request.');
  }
}

// ---------- content ----------

function sanitizeContent(input) {
  const src = input && typeof input === 'object' ? input : {};
  const rawBlocks = Array.isArray(src.blocks) ? src.blocks.slice(0, 500) : [];

  const blocks = rawBlocks
    .map((b) => {
      const o = b && typeof b === 'object' ? b : {};
      return {
        id: typeof o.id === 'string' && /^[\w-]{1,64}$/.test(o.id) ? o.id : newId(),
        src: typeof o.src === 'string' && /^\/uploads\/[\w.-]+$/.test(o.src) ? o.src : '',
        alt: text(o.alt, 200),
        text: text(o.text, 5000),
      };
    })
    .filter((b) => b.src);

  const of = src.orderForm && typeof src.orderForm === 'object' ? src.orderForm : {};
  const products = (Array.isArray(of.products) ? of.products : [])
    .map((p) => text(p, 120))
    .filter(Boolean)
    .slice(0, 30);

  const footer = src.footer && typeof src.footer === 'object' ? src.footer : {};

  return {
    siteName: text(src.siteName, 120) || DEFAULT_CONTENT.siteName,
    blocks,
    orderForm: {
      title: text(of.title, 120) || DEFAULT_CONTENT.orderForm.title,
      buttonLabel: text(of.buttonLabel, 60) || DEFAULT_CONTENT.orderForm.buttonLabel,
      products: products.length ? products : DEFAULT_CONTENT.orderForm.products,
      successMessage: text(of.successMessage, 300) || DEFAULT_CONTENT.orderForm.successMessage,
    },
    closingText: text(src.closingText, 5000),
    footer: {
      text: text(footer.text, 1000),
      contact: text(footer.contact, 1000),
    },
  };
}

function readContent() {
  return sanitizeContent(readJson(CONTENT_FILE, DEFAULT_CONTENT));
}

function saveUpload(dataUrl) {
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(
    typeof dataUrl === 'string' ? dataUrl : ''
  );
  if (!m) throw httpError(400, 'Please choose a PNG, JPG, WEBP or GIF image.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > MAX_IMAGE_BYTES) throw httpError(400, 'Image is larger than 8 MB.');
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const name = crypto.randomBytes(8).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, name), buf);
  return '/uploads/' + name;
}

// ---------- orders ----------

function validateOrder(b, content) {
  const name = text(b.name, 100);
  const phone = text(b.phone, 30);
  const address = text(b.address, 300);
  const product = text(b.product, 120);
  const note = text(b.note, 500);
  const quantity = Number.parseInt(b.quantity, 10);

  if (!name) throw httpError(400, 'Please enter your name.');
  if (!/^\+?[\d\s()-]{6,30}$/.test(phone)) throw httpError(400, 'Please enter a valid phone number.');
  if (!address) throw httpError(400, 'Please enter your delivery address.');
  if (!content.orderForm.products.includes(product)) throw httpError(400, 'Please choose a product.');
  if (!(quantity >= 1 && quantity <= 999)) throw httpError(400, 'Quantity must be between 1 and 999.');

  return { name, phone, address, product, quantity, note };
}

// ---------- admin auth ----------

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isAdmin(req) {
  const token = parseCookies(req).admin_session;
  const expiry = token && sessions.get(token);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function passwordOk(input) {
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(ADMIN_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- static files ----------

function serveStatic(res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname === '/admin' ? '/admin.html' : pathname;
  let decoded;
  try {
    decoded = decodeURIComponent(rel);
  } catch {
    return send(res, 404, { error: 'Not found' });
  }
  const file = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, { error: 'Not found' });

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

// ---------- server ----------

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;
    const method = req.method;

    // Public
    if (p === '/api/content' && method === 'GET') {
      return send(res, 200, readContent());
    }

    if (p === '/api/order' && method === 'POST') {
      const content = readContent();
      const order = validateOrder(await readJsonBody(req), content);
      const orders = readJson(ORDERS_FILE, []);
      orders.unshift({
        id: crypto.randomUUID(),
        ...order,
        status: 'new',
        createdAt: new Date().toISOString(),
      });
      writeJson(ORDERS_FILE, orders);
      return send(res, 201, { ok: true, message: content.orderForm.successMessage });
    }

    // Admin login / logout
    if (p === '/api/admin/login' && method === 'POST') {
      const body = await readJsonBody(req);
      if (!passwordOk(body.password)) {
        await new Promise((r) => setTimeout(r, 800));
        return send(res, 401, { error: 'Wrong password.' });
      }
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, Date.now() + SESSION_MS);
      res.setHeader(
        'Set-Cookie',
        `admin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}`
      );
      return send(res, 200, { ok: true });
    }

    if (p === '/api/admin/logout' && method === 'POST') {
      sessions.delete(parseCookies(req).admin_session);
      res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
      return send(res, 200, { ok: true });
    }

    // Admin (login required)
    if (p.startsWith('/api/admin/')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Please log in again.' });

      if (p === '/api/admin/session' && method === 'GET') {
        return send(res, 200, { ok: true });
      }

      if (p === '/api/admin/content' && method === 'GET') {
        return send(res, 200, readContent());
      }

      if (p === '/api/admin/content' && method === 'PUT') {
        const content = sanitizeContent(await readJsonBody(req));
        writeJson(CONTENT_FILE, content);
        return send(res, 200, content);
      }

      if (p === '/api/admin/upload' && method === 'POST') {
        const body = await readJsonBody(req);
        return send(res, 201, { url: saveUpload(body.data) });
      }

      if (p === '/api/admin/orders' && method === 'GET') {
        return send(res, 200, readJson(ORDERS_FILE, []));
      }

      const m = /^\/api\/admin\/orders\/([\w-]+)$/.exec(p);
      if (m && method === 'PATCH') {
        const body = await readJsonBody(req);
        const orders = readJson(ORDERS_FILE, []);
        const order = orders.find((o) => o.id === m[1]);
        if (!order) return send(res, 404, { error: 'Order not found.' });
        if (['new', 'contacted', 'delivered', 'cancelled'].includes(body.status)) {
          order.status = body.status;
        }
        writeJson(ORDERS_FILE, orders);
        return send(res, 200, order);
      }
      if (m && method === 'DELETE') {
        const orders = readJson(ORDERS_FILE, []).filter((o) => o.id !== m[1]);
        writeJson(ORDERS_FILE, orders);
        return send(res, 200, { ok: true });
      }

      return send(res, 404, { error: 'Not found' });
    }

    if (method === 'GET' || method === 'HEAD') return serveStatic(res, p);
    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    if (!err.status) console.error(err);
    send(res, err.status || 500, { error: err.status ? err.message : 'Something went wrong.' });
  }
});

if (ADMIN_PASSWORD === 'change-me') {
  console.warn('Warning: using the default admin password. Set ADMIN_PASSWORD before going live.');
}

server.listen(PORT, () => {
  console.log(`Site:  http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
