import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { pool } from './db.js';
import { AppError } from './errors.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/student.js';
import professorRoutes from './routes/professor.js';
import adminRoutes from './routes/admin.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '../../public');

if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'change-me') {
  console.warn('Warning: set SESSION_SECRET in server/.env to a long random string.');
}

const app = express();
app.use(express.json());

// Sessions live in server memory (fine for the demo). Restarting the server,
// including a file save under `npm run dev`, signs everyone out.
app.use(
  session({
    name: 'ie.sid',
    secret: process.env.SESSION_SECRET || 'change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
  }),
);

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/professor', professorRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/health', async (req, res, next) => {
  try {
    const [[row]] = await pool.query(`
      SELECT COUNT(*) AS courses
      FROM course
    `);
    res.json({ ok: true, courses: row.courses });
  } catch (err) {
    next(err);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(express.static(publicDir));

app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Info-Enroll running at http://localhost:${port}`);
});
