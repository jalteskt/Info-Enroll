// Admin work: enrollment periods, sections, professors.
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../db.js';
import { AppError } from '../errors.js';
import { loadCourses, ordinal } from './academic.js';
import { sectionGroup, labDroppedWith } from './pairing.js';
import { overlaps, describeTime } from './schedule.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // rule 15
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// ---------------------------------------------------------------- periods

export async function listPeriods() {
  const [rows] = await pool.query(
    `SELECT p.school_year AS schoolYear, p.semester, p.status,
            (SELECT COUNT(*) FROM section s WHERE s.school_year = p.school_year AND s.semester = p.semester) AS sections,
            (SELECT COUNT(*) FROM section s WHERE s.school_year = p.school_year AND s.semester = p.semester
               AND s.grades_submitted_at IS NULL) AS sectionsWithoutGrades,
            (SELECT COUNT(*) FROM enrollment e WHERE e.school_year = p.school_year AND e.semester = p.semester) AS enrollments
     FROM enrollment_period p ORDER BY p.school_year DESC, p.semester DESC`,
  );
  return rows;
}

const nextAfter = ({ schoolYear, semester }) => {
  if (semester === 1) return { schoolYear, semester: 2 }; // rule 2: no summer term
  const start = Number(schoolYear.slice(0, 4)) + 1;
  return { schoolYear: `${start}-${start + 1}`, semester: 1 };
};

// Opens the next period (decision 2026-11-18: a new period starts OPEN).
// Rule 35: only when every section of every period has submitted grades.
// The very first period needs { schoolYear, semester }; after that the next
// one is worked out automatically.
export function openNextPeriod(body = {}) {
  return withTransaction(async (conn) => {
    const [periods] = await conn.query(
      `SELECT school_year AS schoolYear, semester, status FROM enrollment_period
       ORDER BY school_year DESC, semester DESC FOR UPDATE`,
    );
    if (periods.some((p) => p.status === 'OPEN')) {
      throw new AppError(409, 'Close the current enrollment period first.');
    }
    const [[{ n }]] = await conn.query(
      'SELECT COUNT(*) AS n FROM section WHERE grades_submitted_at IS NULL',
    );
    if (n) {
      throw new AppError(409, `${n} section${n > 1 ? 's' : ''} still need submitted grades before the next period can open.`);
    }

    let next;
    if (periods.length) {
      next = nextAfter(periods[0]);
      if (body.schoolYear && (body.schoolYear !== next.schoolYear || Number(body.semester) !== next.semester)) {
        throw new AppError(409, `The next period is the ${ordinal(next.semester)} semester of ${next.schoolYear}.`);
      }
    } else {
      const m = /^(\d{4})-(\d{4})$/.exec(body.schoolYear ?? '');
      const semester = Number(body.semester);
      if (!m || Number(m[2]) !== Number(m[1]) + 1 || ![1, 2].includes(semester)) {
        throw new AppError(400, 'Give the first period as { schoolYear: "2026-2027", semester: 1 }.');
      }
      next = { schoolYear: body.schoolYear, semester };
    }
    await conn.query(
      "INSERT INTO enrollment_period (school_year, semester, status) VALUES (?, ?, 'OPEN')",
      [next.schoolYear, next.semester],
    );
    return { ...next, status: 'OPEN' };
  });
}

// Closes the OPEN period. The exclusive lock waits for any student add or
// remove that is still running, then blocks new ones (rule 7).
export function closePeriod() {
  return withTransaction(async (conn) => {
    const [[period]] = await conn.query(
      "SELECT school_year AS schoolYear, semester FROM enrollment_period WHERE status = 'OPEN' LIMIT 1 FOR UPDATE",
    );
    if (!period) throw new AppError(409, 'There is no open enrollment period.');
    const key = [period.schoolYear, period.semester];

    // Rule 11: at closing, total_units >= min_units (for non-empty enrollments).
    const [under] = await conn.query(
      `SELECT e.student_no AS studentNo, e.total_units AS totalUnits, u.min_units AS minUnits
       FROM enrollment e JOIN unit_limit u ON u.year_level = e.year_level AND u.semester = e.semester
       WHERE e.school_year = ? AND e.semester = ? AND e.total_units > 0 AND e.total_units < u.min_units`,
      key,
    );
    if (under.length) {
      throw new AppError(409, `${under.length} student(s) are below their minimum units: ${under.map((u) => u.studentNo).join(', ')}.`);
    }

    // Rule 9: empty enrollments are deleted.
    const [emptyEnrollments] = await conn.query(
      `DELETE e FROM enrollment e
       WHERE e.school_year = ? AND e.semester = ?
         AND NOT EXISTS (SELECT 1 FROM enrolled_course ec WHERE ec.enrollment_id = e.enrollment_id)`,
      key,
    );
    // Rule 20: sections with no students are deleted.
    const [emptySections] = await conn.query(
      `DELETE s FROM section s
       WHERE s.school_year = ? AND s.semester = ?
         AND NOT EXISTS (SELECT 1 FROM enrolled_course ec WHERE ec.section_id = s.section_id)`,
      key,
    );
    await conn.query(
      "UPDATE enrollment_period SET status = 'CLOSED' WHERE school_year = ? AND semester = ?",
      key,
    );
    return {
      ...period,
      status: 'CLOSED',
      emptyEnrollmentsDeleted: emptyEnrollments.affectedRows,
      emptySectionsDeleted: emptySections.affectedRows,
    };
  });
}

async function lockOpenPeriod(conn) {
  const [[period]] = await conn.query(
    `SELECT school_year AS schoolYear, semester FROM enrollment_period
     WHERE status = 'OPEN' LIMIT 1 LOCK IN SHARE MODE`,
  );
  if (!period) throw new AppError(409, 'Sections can only be changed while enrollment is open.');
  return period;
}

// ---------------------------------------------------------------- sections

function parseMeeting(m, label) {
  if (!m || typeof m !== 'object') throw new AppError(400, `Give the ${label} day and time.`);
  if (!DAYS.includes(m.day)) throw new AppError(400, `${label}: day must be one of ${DAYS.join(', ')}.`);
  if (!TIME.test(m.timeStart ?? '') || !TIME.test(m.timeEnd ?? '')) {
    throw new AppError(400, `${label}: times must look like 08:00.`);
  }
  if (m.timeEnd <= m.timeStart) throw new AppError(400, `${label}: the end time must be after the start time.`);
  return { day: m.day, timeStart: m.timeStart, timeEnd: m.timeEnd };
}

// Decision 2026-11-18: one professor teaches both the lec and the lab of a
// section number (BSIT 1-1 lec + BSIT 1-1 lab). Different section numbers
// can have different professors.
// Locks and returns the sections sharing that number: [lec, lab] or [course].
async function lockSectionGroup(conn, { codes, sectionNo, period }) {
  const [rows] = await conn.query(
    `SELECT section_id AS id, course_code AS code, section_no AS sectionNo, day,
            time_start AS timeStart, time_end AS timeEnd, professor_id AS professorId
     FROM section WHERE course_code IN (?) AND section_no = ? AND school_year = ? AND semester = ?
     ORDER BY section_id FOR UPDATE`,
    [codes, sectionNo, period.schoolYear, period.semester],
  );
  return rows;
}

// Rules 13, 36, 37: the professor is active and free at that time.
// `ignoreSectionIds` skips the sections being replaced (reassignment).
async function checkProfessorFree(conn, period, meeting, ignoreSectionIds = []) {
  const [[prof]] = await conn.query(
    `SELECT professor_id AS id, is_active AS active, CONCAT(first_name, ' ', last_name) AS name
     FROM professor WHERE professor_id = ? FOR UPDATE`,
    [meeting.professorId],
  );
  if (!prof) throw new AppError(404, 'Professor not found.');
  if (!prof.active) throw new AppError(409, `${prof.name} is inactive and can't be given sections.`);
  const [busy] = await conn.query(
    `SELECT section_id AS id, course_code AS code, day, time_start AS timeStart, time_end AS timeEnd
     FROM section WHERE professor_id = ? AND school_year = ? AND semester = ?`,
    [prof.id, period.schoolYear, period.semester],
  );
  const clash = busy.find((b) => !ignoreSectionIds.includes(b.id) && overlaps(b, meeting));
  if (clash) {
    throw new AppError(409, `${prof.name} already teaches ${clash.code} on ${describeTime(clash)}.`);
  }
}

// Creates sections for the OPEN period (rule 28): a course with a lab gets
// its lec section and lab section together, with the same section_no.
// If one of the two already exists with that number (the other was deleted,
// rule 13), only the missing one is created, with that section's professor.
// body: { code, sectionNo?, professorId, lec: { day, timeStart, timeEnd }, lab?: { day, timeStart, timeEnd } }
//   (for a course without a lab, its meeting goes in `lec`)
export function createSection(body = {}) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn); // rule 13
    const courses = await loadCourses(conn);
    if (!courses.has(body.code)) throw new AppError(404, 'Course not found.');
    const codes = sectionGroup(body.code, courses);
    const main = courses.get(codes[0]);
    const paired = codes.length === 2;

    // Rule 17: a section opens only in its course's semester.
    if (main.semester !== period.semester) {
      throw new AppError(409, `${main.code} is a ${ordinal(main.semester)}-semester course.`);
    }
    if (!paired && body.lab) throw new AppError(400, `${main.code} has no laboratory.`);

    // Lock existing sections of this course in the period, then pick the number.
    const [existing] = await conn.query(
      `SELECT section_id AS id, course_code AS code, section_no AS sectionNo, day,
              time_start AS timeStart, time_end AS timeEnd
       FROM section WHERE course_code IN (?) AND school_year = ? AND semester = ? FOR UPDATE`,
      [codes, period.schoolYear, period.semester],
    );
    const sectionNo = body.sectionNo == null
      ? Math.max(0, ...existing.map((e) => e.sectionNo)) + 1
      : Number(body.sectionNo);
    if (!Number.isInteger(sectionNo) || sectionNo < 1 || sectionNo > 255) {
      throw new AppError(400, 'Section number must be 1 to 255.');
    }
    const name = `BSIT ${main.yearLevel}-${sectionNo}`; // rule 14
    const already = existing.filter((e) => e.sectionNo === sectionNo);
    const missing = codes.filter((c) => !already.some((e) => e.code === c));
    if (!missing.length) throw new AppError(409, `${name} of ${main.code} already exists.`);

    // One professor for the whole section number. If its other half is still
    // there, the new half gets that half's professor.
    const group = await lockSectionGroup(conn, { codes, sectionNo, period });
    let professorId = body.professorId == null ? null : Number(body.professorId);
    if (group.length) {
      if (professorId != null && professorId !== group[0].professorId) {
        throw new AppError(409, `${name} already has a professor; its lec and lab share one. Reassign the section instead.`);
      }
      professorId = group[0].professorId;
    }
    if (!Number.isInteger(professorId)) throw new AppError(400, 'Choose a professor.');

    const labels = paired ? ['Lecture', 'Laboratory'] : ['Section'];
    const meetingFor = (code) => {
      const i = codes.indexOf(code);
      return { code, professorId, ...parseMeeting(i === 0 ? body.lec : body.lab, labels[i]) };
    };
    const meetings = missing.map(meetingFor);

    // Rule 28: lec and lab times can't overlap (also rule 36 when the same
    // professor teaches both). Compared with the existing half too.
    const all = [...meetings, ...already];
    if (all.length === 2 && overlaps(all[0], all[1])) {
      throw new AppError(409, 'The lecture and laboratory times overlap.');
    }

    for (const m of meetings) await checkProfessorFree(conn, period, m);

    const ids = [];
    for (const m of meetings) {
      const [r] = await conn.query(
        `INSERT INTO section (section_no, day, time_start, time_end, course_code, school_year, semester, professor_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [sectionNo, m.day, m.timeStart, m.timeEnd, m.code, period.schoolYear, period.semester, m.professorId],
      );
      ids.push(r.insertId);
    }
    return { sectionIds: ids, created: missing, sectionNo, name };
  });
}

// Deletes one section, while OPEN only (rule 13). Its students are
// unenrolled from it. Deleting a lec section also removes those students'
// lab in the same enrollment (rule 27: a lab can't stay without its lec).
// The lab section itself is not deleted. total_units go down (rule 12).
export function deleteSection(sectionId) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const [[section]] = await conn.query(
      `SELECT section_id AS id, course_code AS code, section_no AS sectionNo, school_year AS schoolYear, semester
       FROM section WHERE section_id = ? FOR UPDATE`,
      [Number(sectionId)],
    );
    if (!section) throw new AppError(404, 'Section not found.');
    if (section.schoolYear !== period.schoolYear || section.semester !== period.semester) {
      throw new AppError(409, 'Only sections of the open period can be deleted.');
    }
    const courses = await loadCourses(conn);
    const lab = labDroppedWith(section.code, courses);
    const codes = lab ? [section.code, lab] : [section.code];

    const [students] = await conn.query(
      'SELECT enrollment_id AS enrollmentId FROM enrolled_course WHERE section_id = ? ORDER BY enrollment_id',
      [section.id],
    );
    let labsRemoved = 0;
    for (const { enrollmentId } of students) {
      await conn.query('SELECT enrollment_id FROM enrollment WHERE enrollment_id = ? FOR UPDATE', [enrollmentId]);
      const [rows] = await conn.query(
        'SELECT course_code AS code FROM enrolled_course WHERE enrollment_id = ? AND course_code IN (?)',
        [enrollmentId, codes],
      );
      const removed = rows.map((r) => r.code);
      if (lab && removed.includes(lab)) labsRemoved++;
      await conn.query('DELETE FROM enrolled_course WHERE enrollment_id = ? AND course_code IN (?)', [enrollmentId, removed]);
      await conn.query('UPDATE enrollment SET total_units = total_units - ? WHERE enrollment_id = ?', [
        removed.reduce((n, c) => n + courses.get(c).units, 0),
        enrollmentId,
      ]);
    }
    await conn.query('DELETE FROM section WHERE section_id = ?', [section.id]);
    return { deletedSection: section.code, studentsUnenrolled: students.length, labsRemoved };
  });
}

// Rule 37: only sections of the OPEN period can be reassigned. The lec and
// lab of the same section number are reassigned together (one professor).
export function reassignProfessor(sectionId, professorId) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const [[section]] = await conn.query(
      `SELECT section_id AS id, course_code AS code, section_no AS sectionNo, school_year AS schoolYear, semester
       FROM section WHERE section_id = ? FOR UPDATE`,
      [Number(sectionId)],
    );
    if (!section) throw new AppError(404, 'Section not found.');
    if (section.schoolYear !== period.schoolYear || section.semester !== period.semester) {
      throw new AppError(409, 'Only sections of the open period can be reassigned.');
    }
    const newProf = Number(professorId);
    if (!Number.isInteger(newProf)) throw new AppError(400, 'Choose a professor.');
    const courses = await loadCourses(conn);
    const group = await lockSectionGroup(conn, {
      codes: sectionGroup(section.code, courses),
      sectionNo: section.sectionNo,
      period,
    });
    const ids = group.map((s) => s.id);
    for (const s of group) await checkProfessorFree(conn, period, { ...s, professorId: newProf }, ids);
    await conn.query('UPDATE section SET professor_id = ? WHERE section_id IN (?)', [newProf, ids]);
    return { reassigned: group.map((s) => s.code) };
  });
}

// ---------------------------------------------------------------- professors

export async function listProfessors() {
  const [rows] = await pool.query(
    `SELECT p.professor_id AS id, p.username, p.first_name AS firstName, p.last_name AS lastName,
            p.is_active = 1 AS active,
            (SELECT COUNT(*) FROM section s WHERE s.professor_id = p.professor_id) AS sectionsEver,
            (SELECT COUNT(*) FROM section s JOIN enrollment_period ep
               ON ep.school_year = s.school_year AND ep.semester = s.semester
             WHERE s.professor_id = p.professor_id AND ep.status = 'OPEN') AS sectionsOpen
     FROM professor p ORDER BY p.last_name, p.first_name`,
  );
  return rows.map((r) => ({ ...r, active: Boolean(r.active) }));
}

export async function createProfessor({ username, password, firstName, lastName } = {}) {
  const clean = (s) => (typeof s === 'string' ? s.trim() : '');
  if (!/^[a-z0-9._-]{3,50}$/i.test(clean(username))) {
    throw new AppError(400, 'Username: 3 to 50 letters, numbers, dots, dashes or underscores.');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError(400, 'Password must be at least 8 characters.');
  }
  if (!clean(firstName) || !clean(lastName)) throw new AppError(400, 'Enter the first and last name.');
  try {
    const [r] = await pool.query(
      'INSERT INTO professor (username, password, last_name, first_name, is_active) VALUES (?, ?, ?, ?, 1)',
      [clean(username), await bcrypt.hash(password, 10), clean(lastName), clean(firstName)],
    );
    return { id: r.insertId };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, 'That username is already taken.');
    throw err;
  }
}

// Rule 37: a professor with sections in the open period must be reassigned
// out of them before being deactivated.
export function setProfessorActive(id, active) {
  return withTransaction(async (conn) => {
    const [[prof]] = await conn.query('SELECT professor_id FROM professor WHERE professor_id = ? FOR UPDATE', [Number(id)]);
    if (!prof) throw new AppError(404, 'Professor not found.');
    if (!active) {
      const [[{ n }]] = await conn.query(
        `SELECT COUNT(*) AS n FROM section s JOIN enrollment_period ep
           ON ep.school_year = s.school_year AND ep.semester = s.semester
         WHERE s.professor_id = ? AND ep.status = 'OPEN'`,
        [Number(id)],
      );
      if (n) throw new AppError(409, `Reassign this professor's ${n} section(s) in the open period first.`);
    }
    await conn.query('UPDATE professor SET is_active = ? WHERE professor_id = ?', [active ? 1 : 0, Number(id)]);
    return { active: Boolean(active) };
  });
}

// Rule 37: a professor who has ever had a section is deactivated, not deleted.
export function deleteProfessor(id) {
  return withTransaction(async (conn) => {
    const [[prof]] = await conn.query('SELECT professor_id FROM professor WHERE professor_id = ? FOR UPDATE', [Number(id)]);
    if (!prof) throw new AppError(404, 'Professor not found.');
    const [[{ n }]] = await conn.query('SELECT COUNT(*) AS n FROM section WHERE professor_id = ?', [Number(id)]);
    if (n) throw new AppError(409, 'This professor has had sections. Deactivate them instead.');
    await conn.query('DELETE FROM professor WHERE professor_id = ?', [Number(id)]);
    return { deleted: true };
  });
}

// ---------------------------------------------------------------- overview

export async function overview() {
  const [[open]] = await pool.query(
    "SELECT school_year AS schoolYear, semester FROM enrollment_period WHERE status = 'OPEN' LIMIT 1",
  );
  const [[counts]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM section WHERE grades_submitted_at IS NULL) AS sectionsWithoutGrades,
       (SELECT COUNT(*) FROM enrolled_course ec JOIN section s ON s.section_id = ec.section_id
          WHERE ec.grade = 'INC' AND s.grades_submitted_at IS NOT NULL) AS incompletes,
       (SELECT COUNT(*) FROM professor WHERE is_active = 1) AS activeProfessors`,
  );
  let current = null;
  if (open) {
    const [[c]] = await pool.query(
      `SELECT COUNT(*) AS sections, COALESCE(SUM(s.max_students), 0) - (
                SELECT COUNT(*) FROM enrolled_course ec JOIN section s2 ON s2.section_id = ec.section_id
                WHERE s2.school_year = ? AND s2.semester = ?) AS seatsAvailable,
              (SELECT COUNT(*) FROM enrollment e WHERE e.school_year = ? AND e.semester = ? AND e.total_units > 0) AS studentsEnrolled
       FROM section s WHERE s.school_year = ? AND s.semester = ?`,
      [open.schoolYear, open.semester, open.schoolYear, open.semester, open.schoolYear, open.semester],
    );
    current = { ...open, status: 'OPEN', ...c, seatsAvailable: Number(c.seatsAvailable) };
  }
  return {
    openPeriod: current,
    ...counts,
    canOpenNextPeriod: !open && counts.sectionsWithoutGrades === 0,
  };
}
