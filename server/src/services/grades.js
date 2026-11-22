// Encoding and submitting grades. Used by professors (own sections only,
// rule 30) and by the admin (any section, rule 35).
//
// `actor` is { professorId } or { adminId }.
import { pool, withTransaction } from '../db.js';
import { AppError } from '../errors.js';
import { gradeStatus, MAX_ATTEMPTS } from './academic.js';

// Rule 32: 1.00 to 5.00 in quarter steps, or INC.
export const VALID_GRADES = [
  ...Array.from({ length: 17 }, (_, i) => (1 + i * 0.25).toFixed(2)),
  'INC',
];
const VALID = new Set(VALID_GRADES);

const SECTION_SQL = `
  SELECT
      s.section_id            AS id
    , s.section_no            AS sectionNo
    , s.course_code           AS code
    , s.course_title          AS title
    , s.units
    , s.year_level            AS yearLevel
    , s.day
    , s.time_start            AS timeStart
    , s.time_end              AS timeEnd
    , s.school_year           AS schoolYear
    , s.semester
    , s.period_status         AS periodStatus
    , s.grades_submitted_at   AS submittedAt
    , s.submitted_by_admin_id AS submittedByAdminId
    , s.professor_id          AS professorId
    , s.professor
    , s.students
    , s.enrolled_students     AS enrolledStudents
    , s.graded
  FROM vwSectionDetails s
`;

const withName = (s) => ({ ...s, name: `BSIT ${s.yearLevel}-${s.sectionNo}` }); // rule 14

// Sections for a professor (theirs) or for the admin (filter by period).
export async function listSections({ professorId, schoolYear, semester } = {}) {
  const where = [];
  const params = [];
  if (professorId) {
    where.push('s.professor_id = ?');
    params.push(professorId);
  }
  if (schoolYear) {
    where.push('s.school_year = ? AND s.semester = ?');
    params.push(schoolYear, Number(semester));
  }
  const [rows] = await pool.query(`
    ${SECTION_SQL}
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY
        s.school_year DESC
      , s.semester DESC
      , s.course_code
      , s.section_no
  `, params);
  return rows.map(withName);
}

// One section with its class list. A professor only sees their own (rule 30);
// someone else's section looks the same as a missing one.
export async function sectionRoster(sectionId, actor, db = pool, { lock = false } = {}) {
  // Lock only the section row (FOR UPDATE on the joined query would also lock
  // the course, period and professor rows).
  if (lock) await db.query(`
    SELECT section_id
    FROM section
    WHERE section_id = ?
    FOR UPDATE
  `, [Number(sectionId)]);
  const [[section]] = await db.query(`
    ${SECTION_SQL}
    WHERE s.section_id = ?
  `, [Number(sectionId)]);
  if (!section || (actor.professorId && section.professorId !== actor.professorId)) {
    throw new AppError(404, 'Section not found.');
  }
  const [students] = await db.query(`
    SELECT
        student_no  AS studentNo
      , last_name   AS lastName
      , first_name  AS firstName
      , middle_name AS middleName
      , grade
    FROM vwStudentSubjects
    WHERE section_id = ?
    ORDER BY
        last_name
      , first_name
  `, [section.id]);
  return { section: withName(section), students };
}

// Grades are encoded after enrollment closes (decision 2026-11-18) and are
// locked once submitted (rule 31).
function assertEditable(section) {
  if (section.periodStatus === 'OPEN') {
    throw new AppError(409, 'Grades can be encoded once the enrollment period is closed.');
  }
  if (section.submittedAt) {
    throw new AppError(409, 'Grades for this section were already submitted and are locked.');
  }
}

// Saves draft grades: [{ studentNo, grade }]. grade null clears a draft.
export async function saveGrades(sectionId, grades, actor) {
  if (!Array.isArray(grades) || !grades.length) throw new AppError(400, 'No grades to save.');
  for (const g of grades) {
    if (typeof g?.studentNo !== 'string') throw new AppError(400, 'Each grade needs a studentNo.');
    if (g.grade !== null && !VALID.has(g.grade)) {
      throw new AppError(400, `"${g.grade}" is not a valid grade. Use 1.00 to 5.00 in steps of 0.25, or INC.`);
    }
  }
  return withTransaction(async (conn) => {
    const { section, students } = await sectionRoster(sectionId, actor, conn, { lock: true });
    assertEditable(section);
    const enrolled = new Set(students.map((s) => s.studentNo));
    for (const g of grades) {
      if (!enrolled.has(g.studentNo)) {
        throw new AppError(400, `Student ${g.studentNo} is not in this section.`);
      }
      await conn.query(`
        UPDATE enrolled_course ec
        JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
        SET ec.grade = ?
        WHERE ec.section_id = ?
          AND e.student_no = ?
      `, [g.grade, section.id, g.studentNo]);
    }
    return { saved: grades.length };
  });
}

// Rule 31: only when every student has a grade. Fills grades_submitted_at,
// and submitted_by_admin_id when the admin submits.
export function submitGrades(sectionId, actor) {
  return withTransaction(async (conn) => {
    const { section, students } = await sectionRoster(sectionId, actor, conn, { lock: true });
    assertEditable(section);
    const missing = students.filter((s) => s.grade == null).length;
    if (missing) {
      throw new AppError(409, `${missing} student${missing > 1 ? 's' : ''} still ${missing > 1 ? 'have' : 'has'} no grade.`);
    }
    await conn.query(`
      UPDATE section
      SET
          grades_submitted_at   = NOW()
        , submitted_by_admin_id = ?
      WHERE section_id = ?
    `, [actor.adminId ?? null, section.id]);
    const dropped = await dropOnLastAttempt(conn, section.code, students);
    return { submitted: true, dropped };
  });
}

// Rule 40: when the last attempt (rule 23) ends failed or INC, the student is
// dropped once that grade is submitted. The grade itself is not changed.
async function dropOnLastAttempt(conn, code, students) {
  const unpassed = students.filter((s) => ['failed', 'inc'].includes(gradeStatus(s.grade)));
  if (!unpassed.length) return [];
  const [rows] = await conn.query(`
    SELECT
        e.student_no AS studentNo
      , COUNT(*)     AS attempts
    FROM enrolled_course ec
    JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
    WHERE ec.course_code = ?
      AND e.student_no IN (?)
    GROUP BY e.student_no
  `, [code, unpassed.map((s) => s.studentNo)]);
  const dropped = rows.filter((r) => r.attempts >= MAX_ATTEMPTS).map((r) => r.studentNo);
  if (dropped.length) {
    await conn.query(`
      UPDATE student
      SET status = 'DROPPED'
      WHERE student_no IN (?)
        AND status = 'ACTIVE'
    `, [dropped]);
  }
  return dropped;
}

// Rule 34: the admin completes an INC by replacing it with a grade.
export async function completeInc(sectionId, studentNo, grade, adminId) {
  if (!VALID.has(grade) || grade === 'INC') {
    throw new AppError(400, 'Replace the INC with a grade from 1.00 to 5.00.');
  }
  return withTransaction(async (conn) => {
    const { section, students } = await sectionRoster(sectionId, { adminId }, conn, { lock: true });
    if (!section.submittedAt) {
      throw new AppError(409, 'This section has not been submitted yet. Edit the grade directly.');
    }
    const student = students.find((s) => s.studentNo === studentNo);
    if (!student) throw new AppError(404, 'Student not found in this section.');
    if (student.grade !== 'INC') throw new AppError(409, 'Only an INC grade can be completed.');
    await conn.query(`
      UPDATE enrolled_course ec
      JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
      SET ec.grade = ?
      WHERE ec.section_id = ?
        AND e.student_no = ?
    `, [grade, section.id, studentNo]);
    return { completed: true };
  });
}

// Every INC still waiting to be completed.
export async function listIncompletes() {
  const [rows] = await pool.query(`
    SELECT
        section_id   AS sectionId
      , course_code  AS code
      , course_title AS title
      , school_year  AS schoolYear
      , semester
      , student_no   AS studentNo
      , student_name AS student
    FROM vwReviewQueue
    WHERE item_type = 'INC'
    ORDER BY
        school_year
      , semester
      , student_name
  `);
  return rows;
}
