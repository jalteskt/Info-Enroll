import bcrypt from 'bcryptjs';
import { DAYS, TIMES, planDefaultSections } from '../src/services/defaultSections.js';

export const DEMO_PASSWORD = 'password123';

const PAST_PERIODS = [];
for (let y = 2022; y <= 2025; y++) {
  PAST_PERIODS.push([`${y}-${y + 1}`, 1], [`${y}-${y + 1}`, 2]);
}
const CURRENT_PERIOD = ['2026-2027', 1];

const PASSING = ['1.25', '1.50', '1.75', '2.00', '2.25', '2.50', '1.75', '2.00'];

const ADMIN = { username: 'registrar', last: 'Office', first: 'Registrar' };

const PROFESSORS = [
  { username: 'mreyes', last: 'Reyes', first: 'Maria', active: true },
  { username: 'asantos', last: 'Santos', first: 'Antonio', active: true },
  { username: 'lgarcia', last: 'Garcia', first: 'Lourdes', active: true },
  { username: 'cramos', last: 'Ramos', first: 'Carlos', active: true },
  { username: 'evillanueva', last: 'Villanueva', first: 'Elena', active: true },
  // Taught in past periods, now deactivated.
  { username: 'jmendoza', last: 'Mendoza', first: 'Jose', active: false },
];

// history: one entry per past semester, oldest first, ending at the latest
// closed period. Each entry is [year, semester, options] where options can
// set grades for specific courses ({ grades: { CODE: '5.00' } }) or leave
// courses out ({ skip: [CODE, ...] }), or add retakes of earlier subjects
// ({ add: { CODE: grade } }).
const regular = (years) =>
  Array.from({ length: years * 2 }, (_, i) => [Math.floor(i / 2) + 1, (i % 2) + 1, {}]);

const STUDENTS = [
  {
    // Freshman: no history, year 1.
    no: '202600001', last: 'Dela Cruz', first: 'Andrea', middle: 'Santos',
    entrance: '2026-08-01', history: [],
  },
  {
    // Regular 2nd year, already enrolled in a few subjects this period.
    no: '202500002', last: 'Reyes', first: 'Amara Sofia', middle: 'Lopez',
    entrance: '2025-08-01', history: regular(1),
    current: ['GEC_ETHC', 'BSIT_201', 'BSIT_201.1'],
  },
  {
    // Irregular: failed only the CIST_102 lab, so only the lab is retaken
    // and CIST_103 / CIST_104 were blocked in 2nd sem.
    no: '202500003', last: 'Santos', first: 'Joaquin Luis', middle: 'Cruz',
    entrance: '2025-08-01',
    history: [
      [1, 1, { grades: { 'CIST_102': '2.00', 'CIST_102.1': '5.00' } }],
      [1, 2, { skip: ['CIST_103', 'CIST_103.1', 'CIST_104', 'CIST_104.1'] }],
    ],
  },
  {
    // INC in PATHFIT2, which blocks PATHFIT3 this period.
    no: '202500004', last: 'Garcia', first: 'Mateo Gabriel', middle: 'Diaz',
    entrance: '2025-08-01',
    history: [
      [1, 1, {}],
      [1, 2, { grades: { PATHFIT2: 'INC' } }],
    ],
  },
  {
    // 5th year (8 past semesters, no unit cap): never took Elective 2 and
    // failed BSIT_403, both 1st-sem subjects available now.
    no: '202200005', last: 'Ramos', first: 'Eliana Mae', middle: 'Torres',
    entrance: '2022-08-01',
    history: regular(4).map(([y, s, o]) =>
      y === 3 && s === 1 ? [y, s, { skip: ['BSIT_E02'] }]
      : y === 4 && s === 1 ? [y, s, { grades: { BSIT_403: '5.00' } }]
      : [y, s, o],
    ),
  },
  {
    // Dropped: failed GEC_SELF, then failed its only retake.
    // Skipped GEC_RZAL that term to fit the retake in the 23-unit cap.
    no: '202400007', last: 'Villanueva', first: 'Paolo Miguel', middle: 'Aquino',
    entrance: '2024-08-01',
    history: [
      [1, 1, {}],
      [1, 2, { grades: { GEC_SELF: '5.00' } }],
      [2, 1, {}],
      [2, 2, { skip: ['GEC_RZAL'], add: { GEC_SELF: '5.00' } }],
    ],
  },
  {
    // Passed all 67 subjects: can't open a new enrollment.
    no: '202200006', last: 'Mendoza', first: 'Rafael Andres', middle: 'Bautista',
    entrance: '2022-08-01', history: regular(4),
  },
];

const startYear = (sy) => Number(sy.slice(0, 4));
const enrolledDate = (sy, sem) =>
  sem === 1 ? `${startYear(sy)}-08-10` : `${startYear(sy) + 1}-01-12`;
const submittedAt = (sy, sem) =>
  sem === 1 ? `${startYear(sy)}-12-18 17:00:00` : `${startYear(sy) + 1}-05-29 17:00:00`;

export async function seedDemo(conn) {
  const hash = (pw) => bcrypt.hash(pw, 10);

  const [courseRows] = await conn.query(`
    SELECT
        course_code
      , units
      , year_level
      , semester
    FROM course
    ORDER BY course_code
  `);
  const courses = new Map(courseRows.map((c) => [c.course_code, c]));
  const curriculum = (year, sem) =>
    courseRows.filter((c) => c.year_level === year && c.semester === sem);

  // Admin and professors
  const [adminResult] = await conn.query(`
    INSERT INTO admin (
        username
      , password
      , last_name
      , first_name
    )
    VALUES (
        ?
      , ?
      , ?
      , ?
    )
  `, [ADMIN.username, await hash(DEMO_PASSWORD), ADMIN.last, ADMIN.first]);
  const adminId = adminResult.insertId;

  const profIds = {};
  for (const p of PROFESSORS) {
    const [r] = await conn.query(`
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
        , ?
      )
    `, [p.username, await hash(DEMO_PASSWORD), p.last, p.first, p.active ? 1 : 0]);
    profIds[p.username] = r.insertId;
  }
  const allProfs = PROFESSORS.map((p) => profIds[p.username]);
  const activeProfs = PROFESSORS.filter((p) => p.active).map((p) => profIds[p.username]);

  // Students
  for (const s of STUDENTS) {
    await conn.query(`
      INSERT INTO student (
          student_no
        , last_name
        , first_name
        , middle_name
        , entrance_date
        , password
      )
      VALUES (
          ?
        , ?
        , ?
        , ?
        , ?
        , ?
      )
    `, [s.no, s.last, s.first, s.middle, s.entrance, await hash(DEMO_PASSWORD)]);
  }

  // Periods: insert OPEN first so sections can be created, close past ones at the end.
  for (const [sy, sem] of [...PAST_PERIODS, CURRENT_PERIOD]) {
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
    `, [sy, sem]);
  }

  // One context per period: hands out unique slots and creates sections lazily.
  const periods = new Map();
  const periodCtx = (sy, sem, profs) => {
    const key = `${sy}/${sem}`;
    if (!periods.has(key)) {
      periods.set(key, { sy, sem, profs, nextSlot: 0, nextProf: 0, sections: new Map() });
    }
    return periods.get(key);
  };
  async function sectionFor(ctx, code, sectionNo = 1) {
    const key = `${code}#${sectionNo}`;
    if (ctx.sections.has(key)) return ctx.sections.get(key);
    const slot = ctx.nextSlot++;
    if (slot >= DAYS.length * TIMES.length) throw new Error(`Out of slots in ${ctx.sy}/${ctx.sem}`);
    const day = DAYS[slot % DAYS.length];
    const [start, end] = TIMES[Math.floor(slot / DAYS.length)];
    // One professor for the lec and lab of the same section number.
    const groupKey = `${code.replace(/\.1$/, '')}#${sectionNo}`;
    ctx.groupProf ??= new Map();
    // Offset by section number so BSIT 1-1 and BSIT 1-2 get different professors.
    if (!ctx.groupProf.has(groupKey)) {
      ctx.groupProf.set(groupKey, ctx.profs[(ctx.nextProf++ + sectionNo - 1) % ctx.profs.length]);
    }
    const prof = ctx.groupProf.get(groupKey);
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
    `, [sectionNo, day, start, end, code, ctx.sy, ctx.sem, prof]);
    const section = { id: r.insertId, code };
    ctx.sections.set(key, section);
    return section;
  }

  async function enroll(studentNo, ctx, yearLevel, entries, graded) {
    const totalUnits = entries.reduce((n, e) => n + courses.get(e.code).units, 0);
    const [r] = await conn.query(`
      INSERT INTO enrollment (
          year_level
        , date_enrolled
        , total_units
        , student_no
        , school_year
        , semester
      )
      VALUES (
          ?
        , ?
        , ?
        , ?
        , ?
        , ?
      )
    `, [yearLevel, graded ? enrolledDate(ctx.sy, ctx.sem) : null, totalUnits, studentNo, ctx.sy, ctx.sem]); // current term: enlisted
    for (const e of entries) {
      const section = await sectionFor(ctx, e.code);
      await conn.query(`
        INSERT INTO enrolled_course (
            enrollment_id
          , section_id
          , grade
          , course_code
        )
        VALUES (
            ?
          , ?
          , ?
          , ?
        )
      `, [r.insertId, section.id, graded ? e.grade : null, e.code]);
    }
  }

  // Past enrollments with grades
  let gradeCounter = 0;
  for (const s of STUDENTS) {
    const offset = PAST_PERIODS.length - s.history.length;
    for (let i = 0; i < s.history.length; i++) {
      const [year, sem, opts] = s.history[i];
      const [sy, psem] = PAST_PERIODS[offset + i];
      if (psem !== sem) throw new Error(`${s.no}: history entry ${i} is sem ${sem}, period is sem ${psem}`);
      const entries = curriculum(year, sem)
        .filter((c) => !(opts.skip || []).includes(c.course_code))
        .map((c) => ({
          code: c.course_code,
          grade: opts.grades?.[c.course_code] ?? PASSING[gradeCounter++ % PASSING.length],
        }))
        .concat(Object.entries(opts.add || {}).map(([code, grade]) => ({ code, grade })));
      // Histories have no gaps, so this equals earlier school years + 1.
      await enroll(s.no, periodCtx(sy, sem, allProfs), Math.ceil((i + 1) / 2), entries, true);
    }
  }

  // Current OPEN period: the same default sections as opening a period.
  const [csy, csem] = CURRENT_PERIOD;
  const current = periodCtx(csy, csem, activeProfs);
  const plan = planDefaultSections(
    courseRows
      .filter((c) => c.semester === csem)
      .map((c) => ({ code: c.course_code, yearLevel: c.year_level })),
    activeProfs,
  );
  for (const s of plan.sections) {
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
    `, [s.sectionNo, s.day, s.timeStart, s.timeEnd, s.code, csy, csem, s.professorId]);
    current.sections.set(`${s.code}#${s.sectionNo}`, { id: r.insertId, code: s.code });
  }

  for (const s of STUDENTS.filter((s) => s.current)) {
    const yearLevel = Math.ceil((s.history.length + 1) / 2);
    await enroll(s.no, current, yearLevel, s.current.map((code) => ({ code })), false);
  }

  // Close past periods and mark their grades submitted.
  // One section is shown as submitted by the admin instead of its professor.
  for (const [sy, sem] of PAST_PERIODS) {
    await conn.query(`
      UPDATE section
      SET grades_submitted_at = ?
      WHERE school_year = ?
        AND semester = ?
    `, [submittedAt(sy, sem), sy, sem]);
    await conn.query(`
      UPDATE enrollment_period
      SET status = 'CLOSED'
      WHERE school_year = ?
        AND semester = ?
    `, [sy, sem]);
  }
  await conn.query(`
    UPDATE section
    SET submitted_by_admin_id = ?
    WHERE course_code = 'PATHFIT2'
      AND school_year = '2025-2026'
      AND semester = 2
  `, [adminId]);

  // As the system does at submission: a subject whose last attempt
  // (2 attempts) ended failed or INC drops the student.
  await conn.query(`
    UPDATE student
    SET status = 'DROPPED'
    WHERE student_no IN (
      SELECT student_no
      FROM (
        SELECT
            e.student_no
          , ec.course_code
        FROM enrolled_course ec
        JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
        GROUP BY
            e.student_no
          , ec.course_code
        HAVING COUNT(*) >= 2
          AND SUBSTRING_INDEX(GROUP_CONCAT(CAST(ec.grade AS CHAR) ORDER BY e.school_year, e.semester), ',', -1) NOT IN ('1.00', '1.25', '1.50', '1.75', '2.00', '2.25', '2.50', '2.75', '3.00')
      ) last_attempts
    )
  `);

  return { students: STUDENTS.length, professors: PROFESSORS.length, admins: 1 };
}
