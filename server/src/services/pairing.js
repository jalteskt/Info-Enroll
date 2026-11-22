// Lec/lab rules (26-28). Lec and lab are separate subjects with their own
// sections; this file holds the few places where they are still linked.
import { AppError } from '../errors.js';
import { isLab, lecOf, labOf } from './academic.js';

// Rule 28: the codes the admin creates sections for together: [lec, lab] or [course].
export function sectionGroup(code, courses) {
  const lec = lecOf(code);
  const lab = courses.has(lec) ? labOf(lec, courses) : null;
  return lab ? [lec, lab] : [code];
}

// Rule 27: removing a lec from an enrollment also removes its lab from that
// same enrollment. Returns the lab code to drop along with `code`, or null.
// (If the lec was already passed it is never in the enrollment, so its lab
// stays.)
export function labDroppedWith(code, courses) {
  return isLab(code) ? null : labOf(code, courses);
}

// Locks one section of the period and returns it with its student count.
// Locking the row makes concurrent adds to the same section wait for each
// other, so the seat count is always current (rule 16).
export async function lockSection(conn, { code, sectionNo, period }) {
  const [[row]] = await conn.query(`
    SELECT
        section_id   AS id
      , course_code  AS code
      , section_no   AS sectionNo
      , day
      , time_start   AS timeStart
      , time_end     AS timeEnd
      , max_students AS maxStudents
    FROM section
    WHERE course_code = ?
      AND section_no = ?
      AND school_year = ?
      AND semester = ?
    FOR UPDATE
  `, [code, sectionNo, period.schoolYear, period.semester]);
  if (!row) throw new AppError(404, 'That section is not offered this term.');
  const [[{ n }]] = await conn.query(`
    SELECT COUNT(*) AS n
    FROM enrolled_course
    WHERE section_id = ?
  `, [row.id]);
  return { ...row, enrolled: n };
}
