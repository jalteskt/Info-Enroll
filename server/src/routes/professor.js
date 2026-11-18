import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { listSections, sectionRoster, saveGrades, submitGrades, VALID_GRADES } from '../services/grades.js';

const router = Router();
router.use(requireRole('professor'));

const me = (req) => ({ professorId: req.user.id });
const wrap = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

// All of my sections, newest period first.
router.get('/sections', wrap(async (req) => ({
  gradeOptions: VALID_GRADES,
  sections: await listSections(me(req)),
})));

// One of my sections with its class list.
router.get('/sections/:id', wrap((req) => sectionRoster(req.params.id, me(req))));

// Save draft grades: { grades: [{ studentNo, grade }] }
router.put('/sections/:id/grades', wrap(async (req) => {
  await saveGrades(req.params.id, req.body?.grades, me(req));
  return sectionRoster(req.params.id, me(req));
}));

// Submit and lock.
router.post('/sections/:id/submit', wrap(async (req) => {
  const { dropped } = await submitGrades(req.params.id, me(req));
  return { ...(await sectionRoster(req.params.id, me(req))), dropped }; // rule 40
}));

export default router;
