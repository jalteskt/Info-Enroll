import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { enrollmentView } from '../services/eligibility.js';
import { addSubject, removeSubject } from '../services/enrollment.js';
import { pool } from '../db.js';
import { loadCourses, loadTerms, buildStanding, gradeStatus, loadStatus } from '../services/academic.js';

const router = Router();
router.use(requireRole('student'));

// Catalog, current enrollment, unit limit, year level for this period.
router.get('/enrollment', async (req, res, next) => {
  try {
    res.json(await enrollmentView(req.user.id));
  } catch (err) {
    next(err);
  }
});

// Add a subject, or move it to another section: { code, sectionNo }.
// Returns the refreshed enrollment view.
router.post('/enrollment/subjects', async (req, res, next) => {
  try {
    await addSubject(req.user.id, req.body ?? {});
    res.json(await enrollmentView(req.user.id));
  } catch (err) {
    next(err);
  }
});

// Remove a subject (and its lab or lec).
router.delete('/enrollment/subjects/:code', async (req, res, next) => {
  try {
    await removeSubject(req.user.id, req.params.code);
    res.json(await enrollmentView(req.user.id));
  } catch (err) {
    next(err);
  }
});

// Past terms with grades, plus totals.
router.get('/record', async (req, res, next) => {
  try {
    const [courses, terms, [limits], [[student]]] = await Promise.all([
      loadCourses(),
      loadTerms(req.user.id),
      pool.query('SELECT year_level AS yearLevel, semester, max_units AS maxUnits FROM unit_limit'),
      pool.query('SELECT status FROM student WHERE student_no = ?', [req.user.id]),
    ]);
    const maxOf = (t) => limits.find((l) => l.yearLevel === t.yearLevel && l.semester === t.semester)?.maxUnits ?? null;
    const past = terms.filter((t) => t.status === 'CLOSED' && t.courses.length > 0);
    const standing = buildStanding(past, courses);

    // Weighted average of numeric final grades (INC and pending left out).
    const average = (rows) => {
      let points = 0;
      let units = 0;
      for (const r of rows) {
        if (!r.final || r.grade === 'INC' || r.grade == null) continue;
        const u = courses.get(r.code).units;
        points += Number(r.grade) * u;
        units += u;
      }
      return units ? (points / units).toFixed(2) : null;
    };

    const passedCodes = [...courses.keys()].filter((c) => standing.statusOf(c) === 'passed');
    res.json({
      status: student.status, // rule 40
      yearLevel: standing.yearLevel,
      totalCourses: courses.size,
      coursesPassed: passedCodes.length,
      unitsPassed: passedCodes.reduce((n, c) => n + courses.get(c).units, 0),
      latestAverage: past.length ? average(past.at(-1).courses) : null,
      terms: past
        .map((t) => ({
          schoolYear: t.schoolYear,
          semester: t.semester,
          yearLevel: t.yearLevel,
          totalUnits: t.totalUnits,
          loadStatus: loadStatus(t.totalUnits, maxOf(t)), // rule 39
          average: average(t.courses),
          courses: t.courses.map((c) => ({
            code: c.code,
            title: courses.get(c.code).title,
            units: courses.get(c.code).units,
            grade: c.final ? c.grade : null,
            status: c.final ? gradeStatus(c.grade) : 'pending',
          })),
        }))
        .reverse(), // newest first
    });
  } catch (err) {
    next(err);
  }
});

export default router;
