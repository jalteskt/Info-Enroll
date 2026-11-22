import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pool,
  q,
  freshDatabase,
  sectionId,
  fillSection,
  totalUnitsMismatches,
  currentSubjects,
} from './helpers.js';

const { addSubject, removeSubject } = await import('../src/services/enrollment.js');
const { loadCourses, buildStanding, checkCoRows, loadStatus, findPrerequisiteLoops, checkPrerequisiteLoops } =
  await import('../src/services/academic.js');
const { checkCourse, enrollmentView } = await import('../src/services/eligibility.js');

const ANDREA = '202600001'; // freshman, year 1, cap 23
const AMARA = '202500002'; // year 2, already has GEC_ETHC, BSIT_201, BSIT_201.1
const JOAQUIN = '202500003'; // passed CIST_102, failed CIST_102.1
const MATEO = '202500004'; // INC in PATHFIT2
const ELIANA = '202200005'; // 5th year, no cap
const RAFAEL = '202200006'; // passed all 67
const PAOLO = '202400007'; // dropped: failed GEC_SELF twice

// Expects a rule violation: AppError with this status and message text.
async function rejects(promise, status, text) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected ${status}, got ${err.status}: ${err.message}`);
    if (text) assert.match(err.message, text);
    return true;
  });
}

before(freshDatabase);
after(() => pool.end());

const units = async (code) => (await q(`
  SELECT units
  FROM course
  WHERE course_code = ?
`, [code]))[0].units;
const totalOf = async (no) =>
  (await q(`
    SELECT total_units AS t
    FROM enrollment
    WHERE student_no = ?
      AND school_year = '2026-2027'
  `, [no]))[0].t;

test('CO rows match the lec/lab code pairs (rule 26)', async () => {
  assert.deepEqual(await checkCoRows(), []);
  const [co] = await q(`
    SELECT COUNT(*) AS n
    FROM prerequisite
    WHERE requisite_type = 'CO'
  `);
  assert.equal(co.n, 18);
});

test('the curriculum has no prerequisite loops (rule 22)', async () => {
  assert.deepEqual(await checkPrerequisiteLoops(), []);
});

test('prerequisite loops are found, short and long (rule 22)', () => {
  const pre = (pairs) => pairs.map(([code, req]) => ({ code, req }));
  assert.deepEqual(findPrerequisiteLoops(pre([['A', 'B'], ['B', 'C']])), []);
  assert.deepEqual(findPrerequisiteLoops(pre([['A', 'B'], ['B', 'A']])), [['A', 'B', 'A']]);
  assert.deepEqual(findPrerequisiteLoops(pre([['X', 'A'], ['A', 'B'], ['B', 'C'], ['C', 'A']])), [['A', 'B', 'C', 'A']]);
  // Two subjects sharing a prerequisite is not a loop.
  assert.deepEqual(findPrerequisiteLoops(pre([['A', 'C'], ['B', 'C'], ['A', 'B']])), []);
});

test('first add creates the enrollment; a lec is added on its own (rule 27)', async () => {
  const r = await addSubject(ANDREA, { code: 'CIST_101', sectionNo: 1 });
  assert.equal(r.totalUnits, await units('CIST_101'));
  assert.deepEqual(await currentSubjects(ANDREA), { CIST_101: 1 });
  const [e] = await q(`
    SELECT year_level
    FROM enrollment
    WHERE student_no = ?
      AND school_year = '2026-2027'
  `, [ANDREA]);
  assert.equal(e.year_level, 1);
});

test('a lab needs its lec passed or in the same enrollment (rule 26)', async () => {
  await rejects(addSubject(ANDREA, { code: 'CIST_102.1', sectionNo: 1 }), 409, /Add the lecture CIST_102 first/);
});

test('lab can be in a different section from its lec (rule 26)', async () => {
  await addSubject(ANDREA, { code: 'CIST_101.1', sectionNo: 2 });
  assert.deepEqual(await currentSubjects(ANDREA), { CIST_101: 1, 'CIST_101.1': 2 });
});

test('changing the lec section leaves the lab where it is', async () => {
  const r = await addSubject(ANDREA, { code: 'CIST_101', sectionNo: 2 });
  assert.equal(r.changedSection, true);
  assert.equal(r.totalUnits, (await units('CIST_101')) + (await units('CIST_101.1')));
  assert.deepEqual(await currentSubjects(ANDREA), { CIST_101: 2, 'CIST_101.1': 2 });
});

test('same section twice is refused', async () => {
  await rejects(addSubject(ANDREA, { code: 'CIST_101', sectionNo: 2 }), 409, /already enrolled/);
});

test('unit cap (rule 11): 23 units for 1st year', async () => {
  for (const code of ['CIST_102', 'CIST_102.1', 'GEC_ARTA', 'GEC_MATH', 'GEC_PCOM', 'GEC_STAS', 'PLM_IR01', 'PATHFIT1']) {
    await addSubject(ANDREA, { code, sectionNo: 1 });
  }
  assert.equal(await totalOf(ANDREA), 23);
  await rejects(addSubject(ANDREA, { code: 'GEC_ETHC', sectionNo: 1 }), 409, /limit is 23/);
});

test('removing a lab removes only the lab', async () => {
  const r = await removeSubject(ANDREA, 'CIST_101.1');
  assert.deepEqual(r.removed, ['CIST_101.1']);
  assert.equal(r.totalUnits, 23 - (await units('CIST_101.1')));
  assert.equal((await currentSubjects(ANDREA)).CIST_101, 2);
});

test('removing a lec removes its lab in the same enrollment too (rule 27)', async () => {
  await addSubject(ANDREA, { code: 'CIST_101.1', sectionNo: 1 });
  const r = await removeSubject(ANDREA, 'CIST_101');
  assert.deepEqual(r.removed.sort(), ['CIST_101', 'CIST_101.1']);
  assert.equal(r.totalUnits, 23 - (await units('CIST_101')) - (await units('CIST_101.1')));
});

test('a lec and its lab cannot overlap for the student (rules 19, 28)', async () => {
  const lec = (await q(`
    SELECT *
    FROM section
    WHERE section_id = ?
  `, [await sectionId('CIST_101', 1)]))[0];
  await q(`
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
    SELECT
        3
      , day
      , time_start
      , time_end
      , 'CIST_101.1'
      , school_year
      , semester
      , (
          SELECT professor_id
          FROM professor
          WHERE is_active = 1
            AND professor_id <> ?
          LIMIT 1
        )
    FROM section
    WHERE section_id = ?
  `, [lec.professor_id, lec.section_id]);
  await addSubject(ANDREA, { code: 'CIST_101', sectionNo: 1 });
  await rejects(addSubject(ANDREA, { code: 'CIST_101.1', sectionNo: 3 }), 409, /conflicts with CIST_101 /);
  await removeSubject(ANDREA, 'CIST_101');
  assert.equal(await totalOf(ANDREA), 20);
});

test('removing a subject you do not have is a 404', async () => {
  await rejects(removeSubject(ANDREA, 'GEC_ETHC'), 404);
});

test('schedule conflict (rule 19)', async () => {
  // A second GEC_ETHC section at exactly the time of Andrea's GEC_ARTA section.
  const arta = (await q(`
    SELECT *
    FROM section
    WHERE section_id = ?
  `, [await sectionId('GEC_ARTA', 1)]))[0];
  await q(`
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
    SELECT
        3
      , day
      , time_start
      , time_end
      , 'GEC_ETHC'
      , school_year
      , semester
      , (
          SELECT professor_id
          FROM professor
          WHERE is_active = 1
            AND professor_id <> ?
          LIMIT 1
        )
    FROM section
    WHERE section_id = ?
  `, [arta.professor_id, arta.section_id]);
  await rejects(addSubject(ANDREA, { code: 'GEC_ETHC', sectionNo: 3 }), 409, /conflicts with GEC_ARTA/);
  // Section 1 of the same subject has its own slot, so it works.
  await addSubject(ANDREA, { code: 'GEC_ETHC', sectionNo: 1 });
});

test('wrong semester (rule 17)', async () => {
  await rejects(addSubject(AMARA, { code: 'BSIT_111', sectionNo: 1 }), 409, /2nd semester/);
});

test('section that does not exist', async () => {
  await rejects(addSubject(AMARA, { code: 'GEC_HIST', sectionNo: 9 }), 404);
});

test('missing prerequisite (rule 21)', async () => {
  await rejects(addSubject(JOAQUIN, { code: 'BSIT_202', sectionNo: 1 }), 409, /Pass .* first/);
});

test('failed lab only: the lab is retaken on its own (rules 23, 24)', async () => {
  await rejects(addSubject(JOAQUIN, { code: 'CIST_102', sectionNo: 1 }), 409, /Completed/);
  await addSubject(JOAQUIN, { code: 'CIST_102.1', sectionNo: 1 }); // lec already passed
  assert.deepEqual(await currentSubjects(JOAQUIN), { 'CIST_102.1': 1 });
});

test('a passed lab stays passed when its lec failed (rule 24)', async () => {
  const courses = await loadCourses(pool);
  const standing = buildStanding(
    [{ enrollmentId: 1, status: 'CLOSED', courses: [
      { code: 'CIST_101', grade: '5.00', final: true },
      { code: 'CIST_101.1', grade: '1.50', final: true },
    ] }],
    courses,
  );
  assert.equal(checkCourse('CIST_101.1', { courses, standing }).status, 'passed');
  assert.equal(checkCourse('CIST_101', { courses, standing }).status, 'eligible');
});

test('passed subject cannot be re-enrolled (rule 23)', async () => {
  await rejects(addSubject(JOAQUIN, { code: 'CIST_101', sectionNo: 1 }), 409, /Completed/);
});

test('INC blocks the next subject (rule 34)', async () => {
  await rejects(addSubject(MATEO, { code: 'PATHFIT3', sectionNo: 1 }), 409, /INC/);
});

test('year standing (rule 6)', async () => {
  await rejects(addSubject(AMARA, { code: 'BSIT_E02', sectionNo: 1 }), 409, /3rd year standing/);
});

test('passed all 67 cannot enroll (rule 10)', async () => {
  await rejects(addSubject(RAFAEL, { code: 'GEC_ARTA', sectionNo: 1 }), 409, /all 67/);
});

test('5th year has no unit cap', async () => {
  await addSubject(ELIANA, { code: 'BSIT_E02', sectionNo: 1 });
  const r = await addSubject(ELIANA, { code: 'BSIT_403', sectionNo: 1 });
  assert.equal(r.totalUnits, 6);
});

test('full section (rule 16)', async () => {
  await fillSection('GEC_HIST', 1, 50);
  await rejects(addSubject(AMARA, { code: 'GEC_HIST', sectionNo: 1 }), 409, /full/);
});

test('two students racing for the last seat: exactly one gets it', async () => {
  await fillSection('GEC_WORL', 1, 49);
  const results = await Promise.allSettled([
    addSubject(AMARA, { code: 'GEC_WORL', sectionNo: 1 }),
    addSubject(JOAQUIN, { code: 'GEC_WORL', sectionNo: 1 }),
  ]);
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  assert.equal(ok, 1, JSON.stringify(results.map((r) => r.reason?.message ?? 'ok')));
  const [count] = await q(`
    SELECT COUNT(*) AS n
    FROM enrolled_course
    WHERE section_id = ?
  `, [await sectionId('GEC_WORL', 1)]);
  assert.equal(count.n, 50);
});

test('total_units always matches the enrolled subjects (rule 12)', async () => {
  assert.equal(await totalUnitsMismatches(), 0);
});

// A standing built from closed terms, each given as { CODE: grade }.
const standingOf = async (...terms) =>
  buildStanding(
    terms.map((t, i) => ({
      enrollmentId: i + 1,
      status: 'CLOSED',
      courses: Object.entries(t).map(([code, grade]) => ({ code, grade, final: true })),
    })),
    await loadCourses(pool),
  );

test('year level adds one per school year with a finished term (rule 4)', async () => {
  const courses = await loadCourses(pool);
  const term = (schoolYear, semester, status = 'CLOSED', subjects = 1) => ({
    enrollmentId: `${schoolYear}/${semester}`,
    schoolYear,
    semester,
    status,
    courses: Array.from({ length: subjects }, () => ({ code: 'GEC_ARTA', grade: '2.00', final: true })),
  });
  const level = (terms, schoolYear) => buildStanding(terms, courses, schoolYear).yearLevel;

  // Only the 1st sem of the first year, then back the next school year.
  const oneSem = [term('2025-2026', 1)];
  assert.equal(level([], '2025-2026'), 1);
  assert.equal(level(oneSem, '2026-2027'), 2);
  const back = [...oneSem, term('2026-2027', 1)];
  assert.equal(level(back, '2026-2027'), 2); // same level all school year
  assert.equal(level(back, '2027-2028'), 3);

  // Only the 2nd sem counts the same way.
  assert.equal(level([term('2025-2026', 2)], '2026-2027'), 2);
  // Both semesters are still one school year.
  assert.equal(level([term('2025-2026', 1), term('2025-2026', 2)], '2026-2027'), 2);
  // A fully skipped school year adds nothing.
  assert.equal(level([term('2024-2025', 1), term('2024-2025', 2)], '2026-2027'), 2);
  // Empty or unfinished terms add nothing.
  assert.equal(level([term('2025-2026', 1, 'CLOSED', 0)], '2026-2027'), 1);
  assert.equal(level([term('2025-2026', 1, 'OPEN')], '2026-2027'), 1);
});

test('an INC subject can be retaken (rules 23, 34)', async () => {
  const courses = await loadCourses(pool);
  const standing = await standingOf({ GEC_ARTA: 'INC' });
  assert.equal(checkCourse('GEC_ARTA', { courses, standing }).status, 'eligible');
});

test('at most 2 attempts: the original and 1 retake (rule 23)', async () => {
  const courses = await loadCourses(pool);
  const once = await standingOf({ GEC_ARTA: '5.00' });
  assert.equal(checkCourse('GEC_ARTA', { courses, standing: once }).status, 'eligible');
  const twice = await standingOf({ GEC_ARTA: '5.00' }, { GEC_ARTA: 'INC' });
  const check = checkCourse('GEC_ARTA', { courses, standing: twice });
  assert.equal(check.status, 'blocked');
  assert.match(check.reasons.join(), /2 times/);
});

test('a dropped student cannot enroll, but can still view records (rules 10, 40)', async () => {
  await rejects(addSubject(PAOLO, { code: 'GEC_ARTA', sectionNo: 1 }), 409, /dropped/);
  const view = await enrollmentView(PAOLO);
  assert.equal(view.canEnroll, false);
  assert.equal(view.student.status, 'DROPPED');
  assert.equal((await q(`
    SELECT COUNT(*) AS n
    FROM enrollment
    WHERE student_no = ?
      AND school_year = '2026-2027'
  `, [PAOLO]))[0].n, 0);
});

test('load status is calculated and shown only (rule 39)', async () => {
  assert.equal(loadStatus(20, 23), 'Underload');
  assert.equal(loadStatus(23, 23), 'Regular load');
  assert.equal(loadStatus(40, null), 'No cap');
  assert.equal((await enrollmentView(AMARA)).enrollment.loadStatus, 'Underload');
  assert.equal((await enrollmentView(ELIANA)).enrollment.loadStatus, 'No cap');
});

test('no adds or removes once the period is closed (rule 7)', async () => {
  await q(`
    UPDATE enrollment_period
    SET status = 'CLOSED'
    WHERE school_year = '2026-2027'
      AND semester = 1
  `);
  await rejects(addSubject(AMARA, { code: 'GEC_HIST', sectionNo: 2 }), 409, /closed/);
  await rejects(removeSubject(AMARA, 'GEC_ETHC'), 409, /closed/);
});
