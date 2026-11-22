import { pool } from '../db.js';
import { AppError } from '../errors.js';

// Use on any route: requireRole('student'), requireRole('admin', 'professor'), ...
// Puts the signed-in user on req.user.
export function requireRole(...roles) {
  return async (req, res, next) => {
    try {
      const user = req.session.user;
      if (!user) throw new AppError(401, 'Please sign in.');
      if (!roles.includes(user.role)) {
        throw new AppError(403, 'You do not have access to this page.');
      }
      // A professor deactivated mid-session loses access right away (rule 37).
      if (user.role === 'professor') {
        const [[row]] = await pool.query(`
          SELECT is_active
          FROM professor
          WHERE professor_id = ?
        `, [user.id]);
        if (!row || !row.is_active) {
          req.session.destroy(() => {});
          throw new AppError(401, 'This account is no longer active.');
        }
      }
      req.user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}
