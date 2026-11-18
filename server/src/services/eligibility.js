// Decides what a student can take in a period and why not.
// Used by the catalog and by the add-subject checks.
import { pool } from '../db.js';
import {
  loadCourses,
  currentPeriod,
  loadTerms,
  buildStanding,
  isLab,
  lecOf,
  labOf,
  ordinal,
  loadStatus,
  MAX_ATTEMPTS,
} from './academic.js';

const MAX_YEAR_LEVEL = 6; // rule 5

const shortTitle = (course) => course.title.replace(/ \((lec|lab)\)$/, '');

// Why the student can't enroll at all this period, or null if they can.
export function studentBlock({ period, standing, studentStatus }) {
  // Rules 10, 40.
  if (studentStatus === 'DROPPED') {
    return 'You have been dropped from the program, so you can’t enroll. Your past records stay available here.';
  }
  if (!period || period.status !== 'OPEN') return 'Enrollment is closed.';
  if (standing.passedAll) return 'You have passed all 67 subjects.'; // rule 10
  if (standing.yearLevel > MAX_YEAR_LEVEL) {
    return `Enrollment is limited to ${ordinal(MAX_YEAR_LEVEL)} year.`; // rule 5
  }
  return null;
}

// Checks one course for a student. Lec and lab are separate subjects (rule 27).
//   enrolledCodes: course codes already in the student's current enrollment.
// Returns { status: 'passed' | 'blocked' | 'eligible', reasons: [...] }.
export function checkCourse(code, { courses, standing, enrolledCodes = new Set() }) {
  const course = courses.get(code);
  const { statusOf, attemptsOf, yearLevel } = standing;
  const status = statusOf(code); // its own grade (rule 24)

  if (status === 'passed') return { status: 'passed', reasons: ['Completed'] }; // rule 23

  const reasons = [];
  // Rules 23, 34: a failed or INC subject can be retaken once (2 attempts).
  // `standing` covers past terms only, so the current attempt isn't counted here.
  if (attemptsOf(code) >= MAX_ATTEMPTS) {
    reasons.push(`Already taken ${MAX_ATTEMPTS} times, the maximum`);
  }
  // Rule 6: year standing.
  if (course.requiredStanding && yearLevel < course.requiredStanding) {
    reasons.push(`Requires ${ordinal(course.requiredStanding)} year standing`);
  }
  // Rules 21, 29, 34: this course's own PREs must be passed. INC blocks too.
  const missing = course.pre.filter((r) => statusOf(r) !== 'passed');
  if (missing.length) {
    const names = missing.map((r) => `${r} ${shortTitle(courses.get(r))}`);
    const inc = missing.some((r) => statusOf(r) === 'inc');
    reasons.push(`Pass ${names.join(', ')} first${inc ? ' (INC must be completed)' : ''}`);
  }
  // Rule 26: a lab needs its lec passed, or the lec in the same enrollment.
  if (isLab(code) && courses.has(lecOf(code))) {
    const lec = lecOf(code);
    if (statusOf(lec) !== 'passed' && !enrolledCodes.has(lec)) {
      reasons.push(`Add the lecture ${lec} first`);
    }
  }
  return { status: reasons.length ? 'blocked' : 'eligible', reasons };
}

// Everything the student enrollment, schedule and summary pages need.
export async function enrollmentView(studentNo, db = pool) {
  const [courses, period, terms] = await Promise.all([
    loadCourses(db),
    currentPeriod(db),
    loadTerms(studentNo, db),
  ]);
  const [[student]] = await db.query(
    `SELECT student_no AS studentNo, first_name AS firstName, middle_name AS middleName,
            last_name AS lastName, status FROM student WHERE student_no = ?`,
    [studentNo],
  );

  // Standing is built from finished terms only; the current enrollment
  // doesn't count yet.
  const isCurrent = (t) =>
    period && t.schoolYear === period.schoolYear && t.semester === period.semester;
  const standing = buildStanding(terms.filter((t) => !isCurrent(t)), courses);
  const current = terms.find(isCurrent) ?? null;
  const yearLevel = current?.yearLevel ?? standing.yearLevel;
  const enrolledNo = new Map((current?.courses ?? []).map((c) => [c.code, c.sectionNo]));

  const [[limit]] = period
    ? await db.query(
        'SELECT min_units AS minUnits, max_units AS maxUnits FROM unit_limit WHERE year_level = ? AND semester = ?',
        [Math.min(yearLevel, MAX_YEAR_LEVEL), period.semester],
      )
    : [[null]];

  // Sections of this period with seats left.
  const [sections] = period
    ? await db.query(
        `SELECT s.section_id AS sectionId, s.section_no AS sectionNo, s.day, s.course_code AS code,
                TIME_FORMAT(s.time_start, '%H:%i') AS timeStart, TIME_FORMAT(s.time_end, '%H:%i') AS timeEnd,
                s.max_students - (SELECT COUNT(*) FROM enrolled_course ec WHERE ec.section_id = s.section_id) AS seatsLeft,
                CONCAT(p.first_name, ' ', p.last_name) AS professor
         FROM section s JOIN professor p ON p.professor_id = s.professor_id
         WHERE s.school_year = ? AND s.semester = ?
         ORDER BY s.course_code, s.section_no`,
        [period.schoolYear, period.semester],
      )
    : [[]];

  const block = studentBlock({ period, standing, studentStatus: student.status });

  // One item per course of this period's semester (rule 17). Lec and lab are
  // separate items (rule 27); each says who its partner is.
  const items = [...courses.values()]
    .filter((c) => period && c.semester === period.semester)
    .map((c) => {
      const offered = sections
        .filter((s) => s.code === c.code)
        .map(({ code, ...s }) => ({ ...s, name: `BSIT ${c.yearLevel}-${s.sectionNo}` })); // rule 14
      const check = checkCourse(c.code, { courses, standing, enrolledCodes: new Set(enrolledNo.keys()) });
      if (check.status === 'eligible' && !offered.length) {
        check.status = 'blocked';
        check.reasons.push('No section offered this term');
      }
      const kind = isLab(c.code) && courses.has(lecOf(c.code)) ? 'lab' : labOf(c.code, courses) ? 'lec' : 'single';
      return {
        code: c.code,
        title: c.title,
        kind,
        lecCode: kind === 'lab' ? lecOf(c.code) : null,
        labCode: kind === 'lec' ? labOf(c.code, courses) : null,
        units: c.units,
        yearLevel: c.yearLevel,
        requiredStanding: c.requiredStanding,
        status: check.status,
        reasons: check.reasons,
        sections: offered,
        enrolledSectionNo: enrolledNo.get(c.code) ?? null,
      };
    })
    .sort((a, b) => a.yearLevel - b.yearLevel || a.code.localeCompare(b.code));

  return {
    student,
    period,
    yearLevel,
    unitLimit: limit ?? null,
    canEnroll: !block,
    blockReason: block,
    enrollment: current
      ? {
          totalUnits: current.totalUnits,
          dateEnrolled: current.dateEnrolled,
          loadStatus: loadStatus(current.totalUnits, limit?.maxUnits ?? null), // rule 39
        }
      : null,
    items,
  };
}
