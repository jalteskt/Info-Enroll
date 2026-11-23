import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../db.js';
import { AppError } from '../errors.js';
import { loadCourses, ordinal } from './academic.js';
import { sectionGroup, labDroppedWith } from './pairing.js';
import { overlaps, describeTime } from './schedule.js';
import { planDefaultSections } from './defaultSections.js';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// Periods

export async function listPeriods() {
  const [rows] = await pool.query(`
    SELECT
        school_year             AS schoolYear
      , semester
      , status
      , sections
      , sections_without_grades AS sectionsWithoutGrades
      , enrollments
    FROM vwPeriodSummary
    ORDER BY
        school_year DESC
      , semester DESC
  `);
  return rows;
}

const nextAfter = ({ schoolYear, semester }) => {
  if (semester === 1) return { schoolYear, semester: 2 }; // No summer term
  const start = Number(schoolYear.slice(0, 4)) + 1;
  return { schoolYear: `${start}-${start + 1}`, semester: 1 };
};

// Opens the next period (a new period starts OPEN). Only allowed when every
// section has submitted grades. The first period needs { schoolYear, semester };
// later ones are worked out. Also creates its default sections.
export function openNextPeriod(body = {}) {
  return withTransaction(async (conn) => {
    const [periods] = await conn.query(`
      SELECT
          school_year AS schoolYear
        , semester
        , status
      FROM enrollment_period
      ORDER BY
          school_year DESC
        , semester DESC
      FOR UPDATE
    `);
    if (periods.some((p) => p.status === 'OPEN')) {
      throw new AppError(409, 'Close the current enrollment period first.');
    }
    const [[{ n }]] = await conn.query(`
      SELECT COUNT(*) AS n
      FROM section
      WHERE grades_submitted_at IS NULL
    `);
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
    await conn.query(`
      INSERT INTO enrollment_period (
          school_year
        , semester
        , status
      )
      VALUES (
          ?
        , ?
        , 'OPEN'
      )
    `, [next.schoolYear, next.semester]);

    const courses = await loadCourses(conn);
    const [professors] = await conn.query(`
      SELECT professor_id AS id
      FROM professor
      WHERE is_active = 1
      ORDER BY professor_id
      LOCK IN SHARE MODE
    `);
    const { sections, skipped } = planDefaultSections(
      [...courses.values()].filter((c) => c.semester === next.semester),
      professors.map((p) => p.id),
    );
    if (sections.length) {
      await conn.query(`
        INSERT INTO section (
            section_no
          , day
          , time_start
          , time_end
          , course_code
          , school_year
          , semester
          , professor_id
        )
        VALUES ?
      `, [sections.map((s) => [s.sectionNo, s.day, s.timeStart, s.timeEnd, s.code, next.schoolYear, next.semester, s.professorId])]);
    }
    return { ...next, status: 'OPEN', sectionsCreated: sections.length, sectionsSkipped: skipped };
  });
}

// What closing would remove, for the admin's warning: students who have not
// clicked Enroll, and how many of them were moved back to enlisted.
export async function closePreview() {
  const [[row]] = await pool.query(`
    SELECT
        COUNT(*) AS notEnrolled
      , COALESCE(SUM(e.reopen_note IS NOT NULL), 0) AS movedBack
    FROM enrollment e
    JOIN enrollment_period p ON p.school_year = e.school_year
      AND p.semester = e.semester
    WHERE p.status = 'OPEN'
      AND e.date_enrolled IS NULL
      AND (e.reopen_note IS NOT NULL OR EXISTS (
        SELECT 1
        FROM enrolled_course ec
        WHERE ec.enrollment_id = e.enrollment_id
      ))
  `);
  return { notEnrolled: Number(row.notEnrolled), movedBack: Number(row.movedBack) };
}

// Closes the OPEN period. The exclusive lock waits for running student
// adds/removes, then blocks new ones. Students who never clicked Enroll lose
// their enlisted subjects.
export function closePeriod() {
  return withTransaction(async (conn) => {
    const [[period]] = await conn.query(`
      SELECT
          school_year AS schoolYear
        , semester
      FROM enrollment_period
      WHERE status = 'OPEN'
      LIMIT 1
      FOR UPDATE
    `);
    if (!period) throw new AppError(409, 'There is no open enrollment period.');
    const key = [period.schoolYear, period.semester];

    // At closing, total_units >= min_units (for enrolled students).
    const [under] = await conn.query(`
      SELECT
          e.student_no  AS studentNo
        , e.total_units AS totalUnits
        , u.min_units   AS minUnits
      FROM enrollment e
      JOIN unit_limit u ON u.year_level = e.year_level
        AND u.semester = e.semester
      WHERE e.school_year = ?
        AND e.semester = ?
        AND e.date_enrolled IS NOT NULL
        AND e.total_units > 0
        AND e.total_units < u.min_units
    `, key);
    if (under.length) {
      throw new AppError(409, `${under.length} student(s) are below their minimum units: ${under.map((u) => u.studentNo).join(', ')}.`);
    }

    // Empty enrollments are deleted.
    const [emptyEnrollments] = await conn.query(
      `DELETE e FROM enrollment e
       WHERE e.school_year = ? AND e.semester = ?
         AND NOT EXISTS (SELECT 1 FROM enrolled_course ec WHERE ec.enrollment_id = e.enrollment_id)`,
      key,
    );
    // Enlisted but never enrolled: removed, with their subjects (cascade).
    const [notEnrolled] = await conn.query(`
      DELETE FROM enrollment
      WHERE school_year = ?
        AND semester = ?
        AND date_enrolled IS NULL
    `, key);
    // Sections with no students are deleted.
    const [emptySections] = await conn.query(
      `DELETE s FROM section s
       WHERE s.school_year = ? AND s.semester = ?
         AND NOT EXISTS (SELECT 1 FROM enrolled_course ec WHERE ec.section_id = s.section_id)`,
      key,
    );
    await conn.query(`
      UPDATE enrollment_period
      SET status = 'CLOSED'
      WHERE school_year = ?
        AND semester = ?
    `, key);
    return {
      ...period,
      status: 'CLOSED',
      emptyEnrollmentsDeleted: emptyEnrollments.affectedRows,
      notEnrolledRemoved: notEnrolled.affectedRows,
      emptySectionsDeleted: emptySections.affectedRows,
    };
  });
}

async function lockOpenPeriod(conn) {
  const [[period]] = await conn.query(`
    SELECT
        school_year AS schoolYear
      , semester
    FROM enrollment_period
    WHERE status = 'OPEN'
    LIMIT 1
    LOCK IN SHARE MODE
  `);
  if (!period) throw new AppError(409, 'Sections can only be changed while enrollment is open.');
  return period;
}

// Sections

function parseMeeting(m, label) {
  if (!m || typeof m !== 'object') throw new AppError(400, `Give the ${label} day and time.`);
  if (!DAYS.includes(m.day)) throw new AppError(400, `${label}: day must be one of ${DAYS.join(', ')}.`);
  if (!TIME.test(m.timeStart ?? '') || !TIME.test(m.timeEnd ?? '')) {
    throw new AppError(400, `${label}: times must look like 08:00.`);
  }
  if (m.timeEnd <= m.timeStart) throw new AppError(400, `${label}: the end time must be after the start time.`);
  return { day: m.day, timeStart: m.timeStart, timeEnd: m.timeEnd };
}

// A section number has a lec and a lab, each with its own professor (may be
// the same person). Locks and returns the sections sharing that number:
// [lec, lab] or [course].
async function lockSectionGroup(conn, { codes, sectionNo, period }) {
  const [rows] = await conn.query(`
    SELECT
        section_id   AS id
      , course_code  AS code
      , section_no   AS sectionNo
      , day
      , time_start   AS timeStart
      , time_end     AS timeEnd
      , professor_id AS professorId
    FROM section
    WHERE course_code IN (?)
      AND section_no = ?
      AND school_year = ?
      AND semester = ?
    ORDER BY section_id
    FOR UPDATE
  `, [codes, sectionNo, period.schoolYear, period.semester]);
  return rows;
}

// The professor is active and free at that time.
// `ignoreSectionIds` skips the sections being replaced (reassignment).
async function checkProfessorFree(conn, period, meeting, ignoreSectionIds = []) {
  const [[prof]] = await conn.query(`
    SELECT
        professor_id                       AS id
      , is_active                          AS active
      , CONCAT(first_name, ' ', last_name) AS name
    FROM professor
    WHERE professor_id = ?
    FOR UPDATE
  `, [meeting.professorId]);
  if (!prof) throw new AppError(404, 'Professor not found.');
  if (!prof.active) throw new AppError(409, `${prof.name} is inactive and can't be given sections.`);
  const [busy] = await conn.query(`
    SELECT
        section_id  AS id
      , course_code AS code
      , day
      , time_start  AS timeStart
      , time_end    AS timeEnd
    FROM section
    WHERE professor_id = ?
      AND school_year = ?
      AND semester = ?
  `, [prof.id, period.schoolYear, period.semester]);
  const clash = busy.find((b) => !ignoreSectionIds.includes(b.id) && overlaps(b, meeting));
  if (clash) {
    throw new AppError(409, `${prof.name} already teaches ${clash.code} on ${describeTime(clash)}.`);
  }
}

// Creates sections for the OPEN period. A course with a lab gets its lec and
// lab together with the same section_no; if one already exists, only the
// missing one is created. body: { code, sectionNo?, professorId,
// labProfessorId?, lec: { day, timeStart, timeEnd }, lab?: { ... } }
export function createSection(body = {}) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const courses = await loadCourses(conn);
    if (!courses.has(body.code)) throw new AppError(404, 'Course not found.');
    const codes = sectionGroup(body.code, courses);
    const main = courses.get(codes[0]);
    const paired = codes.length === 2;

    // A section opens only in its course's semester.
    if (main.semester !== period.semester) {
      throw new AppError(409, `${main.code} is a ${ordinal(main.semester)}-semester course.`);
    }
    if (!paired && body.lab) throw new AppError(400, `${main.code} has no laboratory.`);

    // Lock existing sections of this course in the period, then pick the number.
    const [existing] = await conn.query(`
      SELECT
          section_id  AS id
        , course_code AS code
        , section_no  AS sectionNo
        , day
        , time_start  AS timeStart
        , time_end    AS timeEnd
      FROM section
      WHERE course_code IN (?)
        AND school_year = ?
        AND semester = ?
      FOR UPDATE
    `, [codes, period.schoolYear, period.semester]);
    const sectionNo = body.sectionNo == null
      ? Math.max(0, ...existing.map((e) => e.sectionNo)) + 1
      : Number(body.sectionNo);
    if (!Number.isInteger(sectionNo) || sectionNo < 1 || sectionNo > 255) {
      throw new AppError(400, 'Section number must be 1 to 255.');
    }
    const name = `BSIT ${main.yearLevel}-${sectionNo}`;
    const already = existing.filter((e) => e.sectionNo === sectionNo);
    const missing = codes.filter((c) => !already.some((e) => e.code === c));
    if (!missing.length) throw new AppError(409, `${name} of ${main.code} already exists.`);

    const group = await lockSectionGroup(conn, { codes, sectionNo, period });
    const labels = paired ? ['Lecture', 'Laboratory'] : ['Section'];
    const meetingFor = (code) => {
      const i = codes.indexOf(code);
      const meeting = parseMeeting(i === 0 ? body.lec : body.lab, labels[i]);
      const given = i === 0 ? body.professorId : body.labProfessorId;
      const professorId = given == null || given === '' ? group[0]?.professorId : Number(given);
      if (!Number.isInteger(professorId)) {
        throw new AppError(400, paired ? `Choose a ${labels[i].toLowerCase()} professor.` : 'Choose a professor.');
      }
      return { code, professorId, ...meeting };
    };
    const meetings = missing.map(meetingFor);

    // Lec and lab times can't overlap, including when the same professor teaches both.
    const all = [...meetings, ...already];
    if (all.length === 2 && overlaps(all[0], all[1])) {
      throw new AppError(409, 'The lecture and laboratory times overlap.');
    }

    for (const m of meetings) await checkProfessorFree(conn, period, m);

    const ids = [];
    for (const m of meetings) {
      const [r] = await conn.query(`
        INSERT INTO section (
            section_no
          , day
          , time_start
          , time_end
          , course_code
          , school_year
          , semester
          , professor_id
        )
        VALUES (
            ?
          , ?
          , ?
          , ?
          , ?
          , ?
          , ?
          , ?
        )
      `, [sectionNo, m.day, m.timeStart, m.timeEnd, m.code, period.schoolYear, period.semester, m.professorId]);
      ids.push(r.insertId);
    }
    return { sectionIds: ids, created: missing, sectionNo, name };
  });
}

const removedNote = (previous, codes) => {
  const line = `Your section for ${codes.join(' and ')} was removed.`;
  const note = previous ? `${previous} ${line}` : line;
  return note.length <= 255 ? note : 'Several of your sections were removed.';
};

// Deletes one section, only while OPEN. Its enrolled students go back to
// enlisted with a note and must click Enroll again. Deleting a lec section
// also removes those students' lab from the same enrollment, and total_units go down.
export function deleteSection(sectionId) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const [[section]] = await conn.query(`
      SELECT
          section_id  AS id
        , course_code AS code
        , section_no  AS sectionNo
        , school_year AS schoolYear
        , semester
      FROM section
      WHERE section_id = ?
      FOR UPDATE
    `, [Number(sectionId)]);
    if (!section) throw new AppError(404, 'Section not found.');
    if (section.schoolYear !== period.schoolYear || section.semester !== period.semester) {
      throw new AppError(409, 'Only sections of the open period can be deleted.');
    }
    const courses = await loadCourses(conn);
    const lab = labDroppedWith(section.code, courses);
    const codes = lab ? [section.code, lab] : [section.code];

    const [students] = await conn.query(`
      SELECT enrollment_id AS enrollmentId
      FROM enrolled_course
      WHERE section_id = ?
      ORDER BY enrollment_id
    `, [section.id]);
    let labsRemoved = 0;
    let movedBack = 0;
    for (const { enrollmentId } of students) {
      const [[enrollment]] = await conn.query(`
        SELECT
            date_enrolled AS dateEnrolled
          , reopen_note   AS reopenNote
        FROM enrollment
        WHERE enrollment_id = ?
        FOR UPDATE
      `, [enrollmentId]);
      const [rows] = await conn.query(`
        SELECT course_code AS code
        FROM enrolled_course
        WHERE enrollment_id = ?
          AND course_code IN (?)
      `, [enrollmentId, codes]);
      const removed = rows.map((r) => r.code);
      if (lab && removed.includes(lab)) labsRemoved++;
      await conn.query(`
        DELETE FROM enrolled_course
        WHERE enrollment_id = ?
          AND course_code IN (?)
      `, [enrollmentId, removed]);
      await conn.query(`
        UPDATE enrollment
        SET total_units = total_units - ?
        WHERE enrollment_id = ?
      `, [
        removed.reduce((n, c) => n + courses.get(c).units, 0),
        enrollmentId,
      ]);
      if (enrollment.dateEnrolled || enrollment.reopenNote) {
        if (enrollment.dateEnrolled) movedBack++;
        await conn.query(`
          UPDATE enrollment
          SET
              date_enrolled = NULL
            , reopen_note   = ?
          WHERE enrollment_id = ?
        `, [
          removedNote(enrollment.reopenNote, removed),
          enrollmentId,
        ]);
      }
    }
    await conn.query(`
      DELETE FROM section
      WHERE section_id = ?
    `, [section.id]);
    return { deletedSection: section.code, studentsUnenrolled: students.length, labsRemoved, studentsMovedBack: movedBack };
  });
}

// Only sections of the OPEN period can be reassigned. A lec and its
// lab have their own professors, so only this section changes.
export function reassignProfessor(sectionId, professorId) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const [[section]] = await conn.query(`
      SELECT
          section_id  AS id
        , course_code AS code
        , day
        , time_start  AS timeStart
        , time_end    AS timeEnd
        , school_year AS schoolYear
        , semester
      FROM section
      WHERE section_id = ?
      FOR UPDATE
    `, [Number(sectionId)]);
    if (!section) throw new AppError(404, 'Section not found.');
    if (section.schoolYear !== period.schoolYear || section.semester !== period.semester) {
      throw new AppError(409, 'Only sections of the open period can be reassigned.');
    }
    const newProf = Number(professorId);
    if (!Number.isInteger(newProf)) throw new AppError(400, 'Choose a professor.');
    await checkProfessorFree(conn, period, { ...section, professorId: newProf }, [section.id]);
    await conn.query(`
      UPDATE section
      SET professor_id = ?
      WHERE section_id = ?
    `, [newProf, section.id]);
    return { reassigned: [section.code] };
  });
}

// Professors

export async function listProfessors() {
  const [rows] = await pool.query(`
    SELECT
        professor_id  AS id
      , username
      , first_name    AS firstName
      , last_name     AS lastName
      , is_active = 1 AS active
      , sections_ever AS sectionsEver
      , sections_open AS sectionsOpen
    FROM vwProfessorLoad
    ORDER BY
        last_name
      , first_name
  `);
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
    const [r] = await pool.query(`
      INSERT INTO professor (
          username
        , password
        , last_name
        , first_name
        , is_active
      )
      VALUES (
          ?
        , ?
        , ?
        , ?
        , 1
      )
    `, [clean(username), await bcrypt.hash(password, 10), clean(lastName), clean(firstName)]);
    return { id: r.insertId };
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, 'That username is already taken.');
    throw err;
  }
}

// Students

// Every student with status and year level (earlier closed, non-empty
// school years, plus 1).
export async function listStudents() {
  const [rows] = await pool.query(`
    SELECT
        student_no    AS studentNo
      , first_name    AS firstName
      , middle_name   AS middleName
      , last_name     AS lastName
      , entrance_date AS entranceDate
      , status
      , term_state    AS termState
      , year_level    AS yearLevel
    FROM vwStudentList
    ORDER BY student_no DESC
  `);
  return rows.map((r) => ({ ...r, yearLevel: Number(r.yearLevel) }));
}

// The admin undoes a student's Enroll while the period is open. Their subjects
// stay enlisted, and they must click Enroll again.
export function reopenEnrollment(studentNo) {
  return withTransaction(async (conn) => {
    const period = await lockOpenPeriod(conn);
    const [[enrollment]] = await conn.query(`
      SELECT
          enrollment_id AS id
        , date_enrolled AS dateEnrolled
      FROM enrollment
      WHERE student_no = ?
        AND school_year = ?
        AND semester = ?
      FOR UPDATE
    `, [studentNo, period.schoolYear, period.semester]);
    if (!enrollment?.dateEnrolled) throw new AppError(409, 'This student is not enrolled this term.');
    await conn.query(`
      UPDATE enrollment
      SET
          date_enrolled = NULL
        , reopen_note   = ?
      WHERE enrollment_id = ?
    `, [
      'The registrar reopened your enrollment.',
      enrollment.id,
    ]);
    return { studentNo };
  });
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// The student number is generated: entrance year + a 5-digit running number,
// e.g. 202600008. New students start ACTIVE with no records (1st year).
export async function createStudent({ firstName, middleName, lastName, entranceDate, password } = {}) {
  const clean = (s) => (typeof s === 'string' ? s.trim() : '');
  if (!clean(firstName) || !clean(lastName)) throw new AppError(400, 'Enter the first and last name.');
  if ([firstName, middleName, lastName].some((s) => clean(s).length > 50)) {
    throw new AppError(400, 'Names can be at most 50 characters.');
  }
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError(400, 'Password must be at least 8 characters.');
  }
  const date = clean(entranceDate) || today();
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!DATE.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new AppError(400, 'Enter a valid entrance date.');
  }
  const year = date.slice(0, 4);
  const hash = await bcrypt.hash(password, 10);

  // Two admins adding at once could pick the same number; the primary key
  // rejects the second one, so it simply tries the next number.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await withTransaction(async (conn) => {
        const [[{ last }]] = await conn.query(`
          SELECT MAX(student_no) AS last
          FROM student
          WHERE student_no REGEXP CONCAT('^', ?, '[0-9]{5}$')
        `, [year]);
        const next = last ? Number(last.slice(4)) + 1 : 1;
        if (next > 99999) throw new AppError(409, `No student numbers left for ${year}.`);
        const studentNo = year + String(next).padStart(5, '0');
        await conn.query(`
          INSERT INTO student (
              student_no
            , last_name
            , first_name
            , middle_name
            , entrance_date
            , password
            , status
          )
          VALUES (
              ?
            , ?
            , ?
            , ?
            , ?
            , ?
            , 'ACTIVE'
          )
        `, [studentNo, clean(lastName), clean(firstName), clean(middleName) || null, date, hash]);
        return { studentNo };
      });
    } catch (err) {
      if (err.code !== 'ER_DUP_ENTRY') throw err;
    }
  }
  throw new AppError(409, 'Could not assign a student number. Try again.');
}

// A professor with sections in the open period must be reassigned
// out of them before being deactivated.
export function setProfessorActive(id, active) {
  return withTransaction(async (conn) => {
    const [[prof]] = await conn.query(`
      SELECT professor_id
      FROM professor
      WHERE professor_id = ?
      FOR UPDATE
    `, [Number(id)]);
    if (!prof) throw new AppError(404, 'Professor not found.');
    if (!active) {
      const [[{ n }]] = await conn.query(`
        SELECT COUNT(*) AS n
        FROM section s
        JOIN enrollment_period ep ON ep.school_year = s.school_year
          AND ep.semester = s.semester
        WHERE s.professor_id = ?
          AND ep.status = 'OPEN'
      `, [Number(id)]);
      if (n) throw new AppError(409, `Reassign this professor's ${n} section(s) in the open period first.`);
    }
    await conn.query(`
      UPDATE professor
      SET is_active = ?
      WHERE professor_id = ?
    `, [active ? 1 : 0, Number(id)]);
    return { active: Boolean(active) };
  });
}

// A professor who has ever had a section is deactivated, not deleted.
export function deleteProfessor(id) {
  return withTransaction(async (conn) => {
    const [[prof]] = await conn.query(`
      SELECT professor_id
      FROM professor
      WHERE professor_id = ?
      FOR UPDATE
    `, [Number(id)]);
    if (!prof) throw new AppError(404, 'Professor not found.');
    const [[{ n }]] = await conn.query(`
      SELECT COUNT(*) AS n
      FROM section
      WHERE professor_id = ?
    `, [Number(id)]);
    if (n) throw new AppError(409, 'This professor has had sections. Deactivate them instead.');
    await conn.query(`
      DELETE FROM professor
      WHERE professor_id = ?
    `, [Number(id)]);
    return { deleted: true };
  });
}

// Overview

export async function overview() {
  const [[open]] = await pool.query(`
    SELECT
        school_year AS schoolYear
      , semester
    FROM enrollment_period
    WHERE status = 'OPEN'
    LIMIT 1
  `);
  const [[counts]] = await pool.query(`
    SELECT
        (
          SELECT COUNT(*)
          FROM section
          WHERE grades_submitted_at IS NULL
        ) AS sectionsWithoutGrades
      , (
          SELECT COUNT(*)
          FROM enrolled_course ec
          JOIN section s ON s.section_id = ec.section_id
          WHERE ec.grade = 'INC'
            AND s.grades_submitted_at IS NOT NULL
        ) AS incompletes
      , (
          SELECT COUNT(*)
          FROM professor
          WHERE is_active = 1
        ) AS activeProfessors
  `);
  let current = null;
  if (open) {
    const [[c]] = await pool.query(`
      SELECT
          COUNT(*) AS sections
        , COALESCE(SUM(s.max_students), 0) - (
            SELECT COUNT(*)
            FROM enrolled_course ec
            JOIN section s2 ON s2.section_id = ec.section_id
            WHERE s2.school_year = ?
              AND s2.semester = ?
          ) AS seatsAvailable
        , (
            SELECT COUNT(*)
            FROM vwEnrolledList el
            WHERE el.school_year = ?
              AND el.semester = ?
          ) AS studentsEnrolled
        , (
            SELECT COUNT(*)
            FROM enrollment e
            WHERE e.school_year = ?
              AND e.semester = ?
              AND e.date_enrolled IS NULL
              AND e.total_units > 0
          ) AS studentsEnlisted
      FROM section s
      WHERE s.school_year = ?
        AND s.semester = ?
    `, [open.schoolYear, open.semester, open.schoolYear, open.semester, open.schoolYear, open.semester, open.schoolYear, open.semester]);
    current = { ...open, status: 'OPEN', ...c, seatsAvailable: Number(c.seatsAvailable) };
  }
  return {
    openPeriod: current,
    ...counts,
    canOpenNextPeriod: !open && counts.sectionsWithoutGrades === 0,
  };
}
