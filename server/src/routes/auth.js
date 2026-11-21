// Rule 38: students sign in with student_no, admins and professors with
// username. All passwords are bcrypt hashes.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { DEMO_PASSWORD } from '../../scripts/seed-demo.js';
import { pool } from '../db.js';
import { AppError } from '../errors.js';

const router = Router();

// Compared against when the account doesn't exist, so a wrong ID takes as
// long as a wrong password and the response doesn't reveal which one it was.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);
const WRONG = 'Incorrect ID or password.';

const LOOKUP = {
  student: {
    sql: `SELECT student_no AS id, student_no AS login, password, first_name, last_name, 1 AS is_active
          FROM student WHERE student_no = ?`,
  },
  professor: {
    sql: `SELECT professor_id AS id, username AS login, password, first_name, last_name, is_active
          FROM professor WHERE username = ?`,
  },
  admin: {
    sql: `SELECT admin_id AS id, username AS login, password, first_name, last_name, 1 AS is_active
          FROM admin WHERE username = ?`,
  },
};

router.post('/login', async (req, res, next) => {
  try {
    const { role, login, password } = req.body ?? {};
    if (!LOOKUP[role]) throw new AppError(400, 'Choose student, professor, or admin.');
    if (typeof login !== 'string' || !login.trim() || typeof password !== 'string' || !password) {
      throw new AppError(400, 'Enter your ID and password.');
    }

    const [[account]] = await pool.query(LOOKUP[role].sql, [login.trim()]);
    const ok = await bcrypt.compare(password, account?.password ?? DUMMY_HASH);
    if (!account || !ok) throw new AppError(401, WRONG);
    if (!account.is_active) throw new AppError(403, 'This account is no longer active.');

    const user = {
      role,
      id: account.id,
      login: account.login,
      firstName: account.first_name,
      lastName: account.last_name,
    };
    // New session id on sign-in (prevents session fixation).
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.user = user;
      req.session.save((err2) => (err2 ? next(err2) : res.json({ user })));
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res, next) => {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('ie.sid');
    res.json({ ok: true });
  });
});

function localDebug(req) {
  return req.app.locals.demoLogin && ['localhost', '127.0.0.1'].includes(req.hostname);
}

router.get('/me', (req, res) => {
  const demoLogin = localDebug(req)
    ? { logins: { student: '202500002', professor: 'mreyes', admin: 'registrar' }, password: DEMO_PASSWORD }
    : null;
  res.set('Cache-Control', 'no-store').json({ user: req.session.user ?? null, demoLogin });
});

export default router;
