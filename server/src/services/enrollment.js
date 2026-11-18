// Student add / change-section / remove. Each call is one transaction, and
// total_units is updated in that same transaction (rule 12).
// Lec and lab are separate subjects (rule 27): each is added on its own.
import { withTransaction } from '../db.js';
import { AppError } from '../errors.js';
import { loadCourses, loadTerms, buildStanding, ordinal } from './academic.js';
import { studentBlock, checkCourse } from './eligibility.js';
import { lockSection, labDroppedWith } from './pairing.js';
import { overlaps, describeTime } from './schedule.js';

// Shared lock on the OPEN period: many students can add at once, but the
// admin's close (which updates this row) waits until they finish (rule 7).
async function lockOpenPeriod(conn) {
  const [[period]] = await conn.query(
    `SELECT school_year AS schoolYear, semester, status FROM enrollment_period
     WHERE status = 'OPEN' LIMIT 1 LOCK IN SHARE MODE`,
  );
  if (!period) throw new AppError(409, 'Enrollment is closed.');
  return period;
}

async function lockEnrollment(conn, studentNo, period) {
  const [[row]] = await conn.query(
    `SELECT enrollment_id AS id, year_level AS yearLevel, total_units AS totalUnits
     FROM enrollment WHERE student_no = ? AND school_year = ? AND semester = ?
     FOR UPDATE`,
    [studentNo, period.schoolYear, period.semester],
  );
  return row ?? null;
}

// Decision 2026-11-18: the enrollment row is created on the first add.
// Rule 8: one per student per semester (unique key; a race just reuses it).
async function getOrCreateEnrollment(conn, studentNo, period, yearLevel) {
  await conn.query(
    `INSERT INTO enrollment (year_level, date_enrolled, total_units, student_no, school_year, semester)
     VALUES (?, CURDATE(), 0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enrollment_id = enrollment_id`,
    [yearLevel, studentNo, period.schoolYear, period.semester],
  );
  return lockEnrollment(conn, studentNo, period);
}

async function enrolledRows(conn, enrollmentId) {
  const [rows] = await conn.query(
    `SELECT ec.course_code AS code, ec.section_id AS sectionId, s.section_no AS sectionNo,
            s.day, s.time_start AS timeStart, s.time_end AS timeEnd
     FROM enrolled_course ec JOIN section s ON s.section_id = ec.section_id
     WHERE ec.enrollment_id = ?`,
    [enrollmentId],
  );
  return rows;
}

const unitsOf = (codes, courses) => codes.reduce((n, c) => n + courses.get(c).units, 0);

// Adds one course (a lec, a lab, or a course without a lab), or moves it to
// another section if the student already has it.
export async function addSubject(studentNo, { code, sectionNo }) {
  if (typeof code !== 'string' || !code) throw new AppError(400, 'Choose a subject.');
  if (!Number.isInteger(sectionNo) || sectionNo < 1) throw new AppError(400, 'Choose a section.');

  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const courses = await loadCourses(conn);
    const course = courses.get(code);
    if (!course) throw new AppError(404, 'Subject not found.');
    const label = `${code} ${course.title}`;

    // Rule 17: only subjects of this period's semester.
    if (course.semester !== period.semester) {
      throw new AppError(409, `${label} is offered only in the ${ordinal(course.semester)} semester.`);
    }

    // Standing from finished terms only.
    const terms = await loadTerms(studentNo, conn);
    const past = terms.filter(
      (t) => !(t.schoolYear === period.schoolYear && t.semester === period.semester),
    );
    const standing = buildStanding(past, courses);
    // Rules 10, 40: share-locked so a drop at grade submission can't race this add.
    const [[student]] = await conn.query(
      'SELECT status FROM student WHERE student_no = ? LOCK IN SHARE MODE',
      [studentNo],
    );
    if (!student) throw new AppError(404, 'Student not found.');
    const block = studentBlock({ period, standing, studentStatus: student.status }); // rules 5, 10, 40
    if (block) throw new AppError(409, block);

    const enrollment = await getOrCreateEnrollment(conn, studentNo, period, standing.yearLevel);
    const current = await enrolledRows(conn, enrollment.id);
    const enrolledCodes = new Set(current.map((r) => r.code));

    // Rules 6, 21, 23, 24, 26, 29, 34.
    const check = checkCourse(code, { courses, standing, enrolledCodes });
    if (check.status !== 'eligible') {
      throw new AppError(409, `You can't take ${label}: ${check.reasons.join('; ')}.`);
    }

    const replacing = current.find((r) => r.code === code) ?? null;
    if (replacing?.sectionNo === sectionNo) {
      throw new AppError(409, `You are already enrolled in ${code}, section ${sectionNo}.`);
    }

    const section = await lockSection(conn, { code, sectionNo, period });
    const name = `BSIT ${course.yearLevel}-${sectionNo}`; // rule 14

    // Rule 16: 50 per section.
    if (section.enrolled >= section.maxStudents) throw new AppError(409, `${code} ${name} is full.`);

    // Rule 19: no schedule conflicts (this includes the lec vs its lab).
    const clash = current.find((o) => o.code !== code && overlaps(section, o));
    if (clash) {
      throw new AppError(
        409,
        `${code} (${describeTime(section)}) conflicts with ${clash.code} ${courses.get(clash.code).title} (${describeTime(clash)}).`,
      );
    }

    // Rule 11: unit cap by year level and semester. NULL = no cap.
    // A change of section doesn't change the units.
    const newTotal = enrollment.totalUnits + (replacing ? 0 : course.units);
    const [[limit]] = await conn.query(
      'SELECT max_units AS maxUnits FROM unit_limit WHERE year_level = ? AND semester = ?',
      [enrollment.yearLevel, period.semester],
    );
    if (limit.maxUnits != null && newTotal > limit.maxUnits) {
      throw new AppError(
        409,
        `Adding ${code} would bring you to ${newTotal} units. Your limit is ${limit.maxUnits}.`,
      );
    }

    if (replacing) {
      await conn.query('DELETE FROM enrolled_course WHERE enrollment_id = ? AND course_code = ?', [
        enrollment.id,
        code,
      ]);
    }
    await conn.query(
      'INSERT INTO enrolled_course (enrollment_id, section_id, grade, course_code) VALUES (?, ?, NULL, ?)',
      [enrollment.id, section.id, code],
    );
    await conn.query('UPDATE enrollment SET total_units = ? WHERE enrollment_id = ?', [
      newTotal,
      enrollment.id,
    ]);
    return { changedSection: Boolean(replacing), totalUnits: newTotal };
  });
}

// Removes one course. Removing a lec also removes its lab from this
// enrollment (rule 27). The enrollment row stays even if it becomes empty;
// empty ones are deleted when the period closes (rule 9).
export function removeSubject(studentNo, code) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const courses = await loadCourses(conn);
    if (!courses.has(code)) throw new AppError(404, 'Subject not found.');

    const enrollment = await lockEnrollment(conn, studentNo, period);
    const current = enrollment ? await enrolledRows(conn, enrollment.id) : [];
    if (!current.some((r) => r.code === code)) throw new AppError(404, 'You are not enrolled in that subject.');

    const lab = labDroppedWith(code, courses);
    const removed = current.filter((r) => r.code === code || r.code === lab).map((r) => r.code);
    await conn.query('DELETE FROM enrolled_course WHERE enrollment_id = ? AND course_code IN (?)', [
      enrollment.id,
      removed,
    ]);
    const newTotal = enrollment.totalUnits - unitsOf(removed, courses);
    await conn.query('UPDATE enrollment SET total_units = ? WHERE enrollment_id = ?', [
      newTotal,
      enrollment.id,
    ]);
    return { removed, totalUnits: newTotal };
  });
}
