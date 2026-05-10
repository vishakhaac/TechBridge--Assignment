require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const Joi = require('joi');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const { Op } = require('sequelize');

const { sequelize, User, Transaction } = require('./db');

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';

// Redis when REDIS_URL is set, otherwise a small in-memory cache so the
// app still runs on a fresh machine.
let cache;
if (process.env.REDIS_URL) {
  const Redis = require('ioredis');
  const client = new Redis(process.env.REDIS_URL);
  cache = {
    get: async (k) => { const v = await client.get(k); return v ? JSON.parse(v) : null; },
    set: (k, v, ttl) => client.set(k, JSON.stringify(v), 'EX', ttl),
    del: (k) => client.del(k)
  };
} else {
  const mem = new Map();
  cache = {
    get: async (k) => {
      const e = mem.get(k);
      if (!e) return null;
      if (e.exp && e.exp < Date.now()) { mem.delete(k); return null; }
      return e.v;
    },
    set: async (k, v, ttl) => { mem.set(k, { v, exp: ttl ? Date.now() + ttl * 1000 : null }); },
    del: async (k) => mem.delete(k)
  };
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5 });
const txLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 100 });
const analyticsLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 50 });

function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ message: 'Missing token' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role) ? next() : res.status(403).json({ message: 'Forbidden' });

const registerSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { error, value } = registerSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });
  if (await User.findOne({ where: { email: value.email } })) {
    return res.status(400).json({ message: 'Email already registered' });
  }
  const user = await User.create({
    name: value.name, email: value.email, passwordHash: value.password, role: 'user'
  });
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { error, value } = loginSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });
  const user = await User.findOne({ where: { email: value.email } });
  if (!user || !(await user.verifyPassword(value.password))) {
    return res.status(400).json({ message: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

app.get('/api/users', authRequired, allow('admin'), async (req, res) => {
  const users = await User.findAll({ attributes: ['id', 'name', 'email', 'role', 'createdAt'] });
  res.json(users);
});

const txSchema = Joi.object({
  amount: Joi.number().required(),
  type: Joi.string().valid('income', 'expense').required(),
  category: Joi.string().required(),
  note: Joi.string().allow('', null),
  date: Joi.date().required()
});

app.get('/api/transactions', authRequired, txLimiter, async (req, res) => {
  const { page = 1, limit = 20, q, type, category, month, date } = req.query;
  const where = { userId: req.user.id };
  if (type) where.type = type;
  if (category) where.category = category;
  if (q) where.note = { [Op.like]: `%${q}%` };
  if (date) {
    where.date = date;
  } else if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    where.date = {
      [Op.between]: [`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`]
    };
  }
  const { count, rows } = await Transaction.findAndCountAll({
    where,
    order: [['date', 'DESC']],
    limit: parseInt(limit),
    offset: (parseInt(page) - 1) * parseInt(limit)
  });
  res.json({ total: count, page: parseInt(page), limit: parseInt(limit), data: rows });
});

app.post('/api/transactions', authRequired, allow('admin', 'user'), txLimiter, async (req, res) => {
  const { error, value } = txSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });
  const tx = await Transaction.create({ ...value, userId: req.user.id });
  await cache.del(`analytics:${req.user.id}`);
  await cache.del('categories');
  res.status(201).json(tx);
});

app.put('/api/transactions/:id', authRequired, allow('admin', 'user'), txLimiter, async (req, res) => {
  const { error, value } = txSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });
  const tx = await Transaction.findByPk(req.params.id);
  if (!tx) return res.status(404).json({ message: 'Not found' });
  if (req.user.role !== 'admin' && tx.userId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  await tx.update(value);
  await cache.del(`analytics:${tx.userId}`);
  await cache.del('categories');
  res.json(tx);
});

app.delete('/api/transactions/:id', authRequired, allow('admin', 'user'), txLimiter, async (req, res) => {
  const tx = await Transaction.findByPk(req.params.id);
  if (!tx) return res.status(404).json({ message: 'Not found' });
  if (req.user.role !== 'admin' && tx.userId !== req.user.id) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  await tx.destroy();
  await cache.del(`analytics:${tx.userId}`);
  await cache.del('categories');
  res.json({ ok: true });
});

app.get('/api/analytics', authRequired, analyticsLimiter, async (req, res) => {
  const userId = req.user.id;
  const key = `analytics:${userId}`;
  const cached = await cache.get(key);
  if (cached) return res.json(cached);

  const rows = await Transaction.findAll({
    where: { userId },
    attributes: ['amount', 'type', 'category', 'date'],
    raw: true
  });

  const monthlyMap = {};
  const yearlyMap = {};
  const categoryMap = {};
  const catByMonth = {};
  const catByYear = {};
  const totalsMap = { income: 0, expense: 0 };

  for (const r of rows) {
    const d = new Date(r.date);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const year = String(d.getFullYear());
    const amt = Number(r.amount);
    monthlyMap[`${month}:${r.type}`] = (monthlyMap[`${month}:${r.type}`] || 0) + amt;
    yearlyMap[`${year}:${r.type}`] = (yearlyMap[`${year}:${r.type}`] || 0) + amt;
    totalsMap[r.type] += amt;
    if (r.type === 'expense') {
      categoryMap[r.category] = (categoryMap[r.category] || 0) + amt;
      catByMonth[month] = catByMonth[month] || {};
      catByMonth[month][r.category] = (catByMonth[month][r.category] || 0) + amt;
      catByYear[year] = catByYear[year] || {};
      catByYear[year][r.category] = (catByYear[year][r.category] || 0) + amt;
    }
  }

  const toSortedList = (m) => Object.entries(m)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);

  const categoriesByMonth = Object.fromEntries(
    Object.entries(catByMonth).map(([k, v]) => [k, toSortedList(v)])
  );
  const categoriesByYear = Object.fromEntries(
    Object.entries(catByYear).map(([k, v]) => [k, toSortedList(v)])
  );

  const monthly = Object.entries(monthlyMap).map(([k, total]) => {
    const [month, type] = k.split(':');
    return { month, type, total };
  }).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 24);

  const yearly = Object.entries(yearlyMap).map(([k, total]) => {
    const [year, type] = k.split(':');
    return { year, type, total };
  }).sort((a, b) => b.year.localeCompare(a.year));

  const categories = Object.entries(categoryMap)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 20);

  const totals = Object.entries(totalsMap).map(([type, total]) => ({ type, total }));

  const result = { monthly, yearly, categories, categoriesByMonth, categoriesByYear, totals };
  await cache.set(key, result, 15 * 60);
  res.json(result);
});

app.get('/api/categories', authRequired, async (req, res) => {
  const cached = await cache.get('categories');
  if (cached) return res.json(cached);
  const rows = await Transaction.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('category')), 'category']],
    raw: true
  });
  const list = rows.map(r => r.category).filter(Boolean).sort();
  await cache.set('categories', list, 60 * 60);
  res.json(list);
});

const openapi = {
  openapi: '3.0.0',
  info: { title: 'Personal Finance Tracker API', version: '1.0.0' },
  paths: {
    '/api/auth/register': { post: { summary: 'Register a new user' } },
    '/api/auth/login': { post: { summary: 'Login and receive JWT' } },
    '/api/users': { get: { summary: 'List users (admin only)' } },
    '/api/transactions': {
      get: { summary: 'List own transactions (paged, searchable)' },
      post: { summary: 'Create transaction (admin/user)' }
    },
    '/api/transactions/{id}': {
      put: { summary: 'Update transaction (owner or admin)' },
      delete: { summary: 'Delete transaction (owner or admin)' }
    },
    '/api/analytics': { get: { summary: 'Analytics for current user' } },
    '/api/categories': { get: { summary: 'Distinct category list' } }
  }
};
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openapi));

(async () => {
  await sequelize.authenticate();
  app.listen(PORT, () => {
    console.log(`API on http://localhost:${PORT}`);
    console.log(`Swagger on http://localhost:${PORT}/api/docs`);
  });
})().catch((e) => { console.error(e); process.exit(1); });
