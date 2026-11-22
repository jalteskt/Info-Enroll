// Test setup: point everything at a separate database so tests never touch
// the dev data in info_enroll. Import this file first in every test file.
process.env.DB_NAME = 'info_enroll_test';
await import('dotenv/config'); // doesn't override DB_NAME set above

const { resetDatabase } = await import('../scripts/db-reset.js');
export const { pool } = await import('../src/db.js');

export const CURRENT = { schoolYear: '2026-2027', semester: 1 };

export async function freshDatabase() {
  await resetDatabase('info_enroll_test');
}

export async function q(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Section id of a course's section in the current period.
export async function sectionId(code, sectionNo = 1) {
  const [row] = await q(`
    SELECT section_id AS id
    FROM section
    WHERE course_code = ?
      AND section_no = ?
      AND school_year = ?
      AND semester = ?
  `, [code, sectionNo, CURRENT.schoolYear, CURRENT.semester]);
  return row?.id;
}

// Puts `count` made-up students into a section of the current period.
let fakeCounter = 0;
export async function fillSection(code, sectionNo, count) {
  const id = await sectionId(code, sectionNo);
  for (let i = 0; i < count; i++) {
    const no = `T${String(++fakeCounter).padStart(5, '0')}`;
    await q(`
      INSERT INTO student (
          student_no
        , last_name
        , first_name
        , password
      )
      VALUES (
          ?
        , 'Test'
        , 'Filler'
        , 'x'
      )
    `, [no]);
    const r = await pool.query(`
      INSERT INTO enrollment (
          year_level
        , date_enrolled
        , total_units
        , student_no
        , school_year
        , semester
      )
      VALUES (
          1
        , CURDATE()
        , (
            SELECT units
            FROM course
            WHERE course_code = ?
          )
        , ?
        , ?
        , ?
      )
    `, [code, no, CURRENT.schoolYear, CURRENT.semester]);
    await q(`
      INSERT INTO enrolled_course (
          enrollment_id
        , section_id
        , course_code
      )
      VALUES (
          ?
        , ?
        , ?
      )
    `, [
      r[0].insertId,
      id,
      code,
    ]);
  }
}

// Every enrollment's total_units equals the units of its subjects (rule 12).
export async function totalUnitsMismatches() {
  const rows = await q(`
    SELECT e.enrollment_id
    FROM enrollment e
    WHERE e.total_units <> (
      SELECT COALESCE(SUM(c.units), 0)
      FROM enrolled_course ec
      JOIN course c ON c.course_code = ec.course_code
      WHERE ec.enrollment_id = e.enrollment_id
    )
  `);
  return rows.length;
}

// Student's current subjects as { code: sectionNo }.
export async function currentSubjects(studentNo) {
  const rows = await q(`
    SELECT
        ec.course_code AS code
      , s.section_no   AS no
    FROM enrolled_course ec
    JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
    JOIN section s ON s.section_id = ec.section_id
    WHERE e.student_no = ?
      AND e.school_year = ?
      AND e.semester = ?
  `, [studentNo, CURRENT.schoolYear, CURRENT.semester]);
  return Object.fromEntries(rows.map((r) => [r.code, r.no]));
}
