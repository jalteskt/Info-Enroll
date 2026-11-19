// Shared academic logic: courses, lec/lab pairing, grade history, pass status,
// year level. Everything else (eligibility, enrollment, grading) builds on this.
import { pool } from '../db.js';

const PASSING = new Set(['1.00', '1.25', '1.50', '1.75', '2.00', '2.25', '2.50', '2.75', '3.00']);

// Grades are compared as text, never as numbers: the column is an ENUM and
// MariaDB would compare its position (1-18), not the grade.   (rules 32, 33)
export function gradeStatus(grade) {
  if (grade == null) return 'pending';
  if (grade === 'INC') return 'inc';
  return PASSING.has(grade) ? 'passed' : 'failed';
}

export const isLab = (code) => code.endsWith('.1');
export const lecOf = (code) => (isLab(code) ? code.slice(0, -2) : code);

// Rule 26: the partner is found by code (lab = lec code + ".1").
// checkCoRows() below verifies the CO rows in PREREQUISITE agree.
export function partnerOf(code, courses) {
  if (isLab(code)) return courses.has(lecOf(code)) ? lecOf(code) : null;
  return courses.has(`${code}.1`) ? `${code}.1` : null;
}
export const labOf = (code, courses) => (isLab(code) ? null : partnerOf(code, courses));

// Rule 26: every lab has exactly one CO row (lab -> its lec), and there are
// no other CO rows. Returns a list of problems (empty = all good).
export async function checkCoRows(db = pool) {
  const courses = await loadCourses(db);
  const [rows] = await db.query(
    "SELECT course_code AS lab, required_course_code AS lec FROM prerequisite WHERE requisite_type = 'CO'",
  );
  const problems = [];
  const labs = [...courses.keys()].filter((c) => isLab(c) && courses.has(lecOf(c)));
  for (const lab of labs) {
    if (!rows.some((r) => r.lab === lab && r.lec === lecOf(lab))) problems.push(`${lab} has no CO row to ${lecOf(lab)}`);
  }
  for (const r of rows) {
    if (lecOf(r.lab) !== r.lec || !labs.includes(r.lab)) problems.push(`CO row ${r.lab} -> ${r.lec} is not a lec/lab pair`);
  }
  return problems;
}

// Rule 22: no prerequisite loops (A needs B, B needs A; or longer chains).
// The database only blocks self-prerequisites, so longer loops are found here.
// Takes [{ code, req }] PRE rows and returns each loop as a list of codes
// that starts and ends with the same course (empty = no loops).
export function findPrerequisiteLoops(rows) {
  const needs = new Map();
  for (const { code, req } of rows) {
    if (!needs.has(code)) needs.set(code, []);
    needs.get(code).push(req);
  }
  const state = new Map(); // undefined = not visited, 1 = on current path, 2 = done
  const path = [];
  const loops = [];
  const visit = (code) => {
    state.set(code, 1);
    path.push(code);
    for (const req of needs.get(code) ?? []) {
      if (state.get(req) === 1) loops.push([...path.slice(path.indexOf(req)), req]);
      else if (!state.has(req)) visit(req);
    }
    path.pop();
    state.set(code, 2);
  };
  for (const code of [...needs.keys()].sort()) if (!state.has(code)) visit(code);
  return loops;
}

// Rule 22 against the database. CO rows are left out: they only record the
// lab -> lec pairing (rule 26), not an order in which subjects are passed.
export async function checkPrerequisiteLoops(db = pool) {
  const [rows] = await db.query(
    "SELECT course_code AS code, required_course_code AS req FROM prerequisite WHERE requisite_type = 'PRE'",
  );
  return findPrerequisiteLoops(rows).map((loop) => `Prerequisite loop: ${loop.join(' -> ')}`);
}

// Map of course_code -> { code, title, units, yearLevel, semester, requiredStanding, pre: [codes] }
export async function loadCourses(db = pool) {
  const [rows] = await db.query(
    `SELECT course_code AS code, course_title AS title, units, year_level AS yearLevel,
            semester, required_standing AS requiredStanding
     FROM course`,
  );
  const courses = new Map(rows.map((c) => [c.code, { ...c, pre: [] }]));
  const [pre] = await db.query(
    "SELECT course_code AS code, required_course_code AS req FROM prerequisite WHERE requisite_type = 'PRE'",
  );
  for (const p of pre) courses.get(p.code).pre.push(p.req);
  return courses;
}

// The OPEN period, or the most recent one if none is open.
export async function currentPeriod(db = pool) {
  const [[open]] = await db.query(
    "SELECT school_year AS schoolYear, semester, status FROM enrollment_period WHERE status = 'OPEN' LIMIT 1",
  );
  if (open) return open;
  const [[latest]] = await db.query(
    `SELECT school_year AS schoolYear, semester, status FROM enrollment_period
     ORDER BY school_year DESC, semester DESC LIMIT 1`,
  );
  return latest ?? null;
}

// All of a student's enrollments, oldest first, each with its courses.
export async function loadTerms(studentNo, db = pool) {
  const [rows] = await db.query(
    `SELECT e.enrollment_id AS enrollmentId, e.school_year AS schoolYear, e.semester,
            e.year_level AS yearLevel, e.total_units AS totalUnits, e.date_enrolled AS dateEnrolled,
            p.status, ec.course_code AS code, ec.grade, ec.section_id AS sectionId,
            s.section_no AS sectionNo, s.grades_submitted_at AS submittedAt
     FROM enrollment e
     JOIN enrollment_period p ON p.school_year = e.school_year AND p.semester = e.semester
     LEFT JOIN enrolled_course ec ON ec.enrollment_id = e.enrollment_id
     LEFT JOIN section s ON s.section_id = ec.section_id
     WHERE e.student_no = ?
     ORDER BY e.school_year, e.semester, ec.course_code`,
    [studentNo],
  );
  const terms = [];
  for (const r of rows) {
    let term = terms.at(-1);
    if (!term || term.enrollmentId !== r.enrollmentId) {
      term = {
        enrollmentId: r.enrollmentId,
        schoolYear: r.schoolYear,
        semester: r.semester,
        yearLevel: r.yearLevel,
        totalUnits: r.totalUnits,
        dateEnrolled: r.dateEnrolled,
        status: r.status,
        courses: [],
      };
      terms.push(term);
    }
    if (r.code) {
      term.courses.push({
        code: r.code,
        grade: r.grade,
        sectionId: r.sectionId,
        sectionNo: r.sectionNo,
        final: r.submittedAt != null,
      });
    }
  }
  return terms;
}

// Builds the student's standing from their terms.
//   statusOf(code) -> 'passed' | 'failed' | 'inc' | 'none'
// Rule 25: the latest submitted attempt counts.
// Rule 24: each lec and each lab counts on its own grade.
export function buildStanding(terms, courses) {
  const latest = new Map();
  for (const term of terms) {
    for (const c of term.courses) {
      if (c.final) latest.set(c.code, { grade: c.grade, enrollmentId: term.enrollmentId });
    }
  }
  const statusOf = (code) => {
    const a = latest.get(code);
    return a ? gradeStatus(a.grade) : 'none';
  };
  // Rule 23: attempts = the student's enrolled_course rows for the course.
  const attempts = new Map();
  for (const term of terms) {
    for (const c of term.courses) attempts.set(c.code, (attempts.get(c.code) ?? 0) + 1);
  }
  const attemptsOf = (code) => attempts.get(code) ?? 0;

  // Rule 4: finalized, non-empty past enrollments.
  const pastTerms = terms.filter((t) => t.status === 'CLOSED' && t.courses.length > 0).length;
  const yearLevel = Math.ceil((pastTerms + 1) / 2);
  const passedAll = [...courses.keys()].every((code) => statusOf(code) === 'passed');

  return { statusOf, attemptsOf, latest, yearLevel, passedAll };
}

// Rule 23: a subject has at most 2 attempts (the original and 1 retake).
export const MAX_ATTEMPTS = 2;

// Rule 39: calculated, never stored, display only.
export function loadStatus(totalUnits, maxUnits) {
  if (maxUnits == null) return 'No cap';
  return totalUnits < maxUnits ? 'Underload' : 'Regular load';
}

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;
export const termLabel = (schoolYear, semester) =>
  `${ordinal(semester)} semester, A.Y. ${schoolYear}`;
