import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import * as admin from '../services/admin.js';
import {
  listSections,
  sectionRoster,
  saveGrades,
  submitGrades,
  completeInc,
  listIncompletes,
  VALID_GRADES,
} from '../services/grades.js';
import { currentPeriod, loadCourses, isLab, labOf } from '../services/academic.js';

const router = Router();
router.use(requireRole('admin'));

const me = (req) => ({ adminId: req.user.id });
const wrap = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

router.get('/overview', wrap(() => admin.overview()));

// Courses sections can be created for: lecs and courses without a lab
// (a lec's lab section is created with it).
router.get('/courses', wrap(async () => {
  const courses = await loadCourses();
  return [...courses.values()]
    .filter((c) => !isLab(c.code) || !courses.has(c.code.slice(0, -2)))
    .map((c) => ({ code: c.code, title: c.title, yearLevel: c.yearLevel, semester: c.semester, labCode: labOf(c.code, courses) }))
    .sort((a, b) => a.yearLevel - b.yearLevel || a.code.localeCompare(b.code));
}));

// Periods
router.get('/periods', wrap(() => admin.listPeriods()));
router.post('/periods/next', wrap((req) => admin.openNextPeriod(req.body ?? {})));
router.get('/periods/close-preview', wrap(() => admin.closePreview()));
router.post('/periods/close', wrap(() => admin.closePeriod()));

// Sections. GET defaults to the current (or latest) period.
router.get('/sections', wrap(async (req) => {
  const period = req.query.schoolYear
    ? { schoolYear: String(req.query.schoolYear), semester: Number(req.query.semester) }
    : await currentPeriod();
  return {
    period,
    gradeOptions: VALID_GRADES,
    sections: period ? await listSections(period) : [],
  };
}));
router.post('/sections', wrap((req) => admin.createSection(req.body ?? {})));
router.delete('/sections/:id', wrap((req) => admin.deleteSection(req.params.id)));
router.patch('/sections/:id/professor', wrap((req) =>
  admin.reassignProfessor(req.params.id, req.body?.professorId)));

// Grades (the admin can encode and submit missing grades)
router.get('/sections/:id', wrap((req) => sectionRoster(req.params.id, me(req))));
router.put('/sections/:id/grades', wrap(async (req) => {
  await saveGrades(req.params.id, req.body?.grades, me(req));
  return sectionRoster(req.params.id, me(req));
}));
router.post('/sections/:id/submit', wrap(async (req) => {
  const { dropped } = await submitGrades(req.params.id, me(req));
  return { ...(await sectionRoster(req.params.id, me(req))), dropped }; // students dropped by this submit
}));

// INC completion
router.get('/incompletes', wrap(() => listIncompletes()));
router.post('/sections/:id/complete-inc', wrap(async (req) => {
  await completeInc(req.params.id, req.body?.studentNo, req.body?.grade, req.user.id);
  return sectionRoster(req.params.id, me(req));
}));

// Professors
router.get('/students', wrap(() => admin.listStudents()));
router.post('/students', wrap((req) => admin.createStudent(req.body ?? {})));
router.post('/students/:no/reopen', wrap((req) => admin.reopenEnrollment(req.params.no)));
router.get('/professors', wrap(() => admin.listProfessors()));
router.post('/professors', wrap((req) => admin.createProfessor(req.body ?? {})));
router.post('/professors/:id/activate', wrap((req) => admin.setProfessorActive(req.params.id, true)));
router.post('/professors/:id/deactivate', wrap((req) => admin.setProfessorActive(req.params.id, false)));
router.delete('/professors/:id', wrap((req) => admin.deleteProfessor(req.params.id)));

export default router;
