// A full semester: admin sets up sections, students enroll, the period closes,
// professors grade, the admin finishes grading and opens the next period.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, q, freshDatabase, sectionId, totalUnitsMismatches, currentSubjects } from './helpers.js';

const admin = await import('../src/services/admin.js');
const grades = await import('../src/services/grades.js');
const { addSubject, removeSubject } = await import('../src/services/enrollment.js');
const { enrollmentView } = await import('../src/services/eligibility.js');

const ANDREA = '202600001';
const AMARA = '202500002';
const JOAQUIN = '202500003';
const ELIANA = '202200005'; // failed BSIT_403 once
const statusOf = async (no) => (await q('SELECT status FROM student WHERE student_no = ?', [no]))[0].status;
const PROF = { mreyes: 1, asantos: 2, lgarcia: 3, cramos: 4, evillanueva: 5, jmendoza: 6 };
const ADMIN_ID = 1;

async function rejects(promise, status, text) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected ${status}, got ${err.status}: ${err.message}`);
    if (text) assert.match(err.message, text);
    return true;
  });
}
const sectionRow = async (id) => (await q('SELECT * FROM section WHERE section_id = ?', [id]))[0];

before(freshDatabase);
after(() => pool.end());

// ------------------------------------------------------------ admin, OPEN period

test('next period cannot open while one is OPEN', async () => {
  await rejects(admin.openNextPeriod(), 409, /Close the current/);
});

test('professor time conflict when creating a section (rule 36)', async () => {
  const busy = (await q('SELECT * FROM section WHERE professor_id = ? AND school_year = ? LIMIT 1', [PROF.mreyes, '2026-2027']))[0];
  await rejects(
    admin.createSection({
      code: 'GEC_ETHC',
      professorId: PROF.mreyes,
      lec: { day: busy.day, timeStart: busy.time_start.slice(0, 5), timeEnd: busy.time_end.slice(0, 5) },
    }),
    409,
    /already teaches/,
  );
});

test('wrong semester, inactive professor, lec/lab overlap are refused (rules 17, 37, 28)', async () => {
  const slot = { day: 'Sat', timeStart: '19:00', timeEnd: '20:30' };
  await rejects(admin.createSection({ code: 'BSIT_111', professorId: PROF.asantos, lec: slot }), 409, /2nd-semester/);
  await rejects(admin.createSection({ code: 'GEC_ETHC', professorId: PROF.jmendoza, lec: slot }), 409, /inactive/);
  await rejects(
    admin.createSection({
      code: 'BSIT_201',
      professorId: PROF.asantos,
      lec: slot,
      lab: { day: 'Sat', timeStart: '20:00', timeEnd: '21:00' },
    }),
    409,
    /overlap/,
  );
  await rejects(admin.createSection({ code: 'BSIT_201', professorId: PROF.asantos, lec: slot }), 400, /Laboratory/);
});

let newLec;
test('a lec + lab section pair is created together with the next section_no (rule 28)', async () => {
  const r = await admin.createSection({
    code: 'BSIT_201',
    professorId: PROF.asantos,
    lec: { day: 'Sat', timeStart: '19:00', timeEnd: '20:30' },
    lab: { day: 'Fri', timeStart: '19:00', timeEnd: '20:30' },
  });
  const rows = await q('SELECT professor_id AS p FROM section WHERE section_id IN (?)', [r.sectionIds]);
  assert.deepEqual(rows.map((x) => x.p), [PROF.asantos, PROF.asantos]); // one professor for lec + lab
  assert.equal(r.sectionNo, 2);
  assert.equal(r.name, 'BSIT 2-2');
  assert.equal(r.sectionIds.length, 2);
  newLec = r.sectionIds[0];
});

test('deleting a lab section removes only that section and its students (rule 13)', async () => {
  await addSubject(JOAQUIN, { code: 'BSIT_201', sectionNo: 2 });
  await addSubject(JOAQUIN, { code: 'BSIT_201.1', sectionNo: 2 });
  const r = await admin.deleteSection(await sectionId('BSIT_201.1', 2));
  assert.equal(r.deletedSection, 'BSIT_201.1');
  assert.equal(r.studentsUnenrolled, 1);
  assert.ok(await sectionRow(newLec)); // the lec section stays
  assert.deepEqual(await currentSubjects(JOAQUIN), { BSIT_201: 2 });
  assert.equal(await totalUnitsMismatches(), 0);
});

test('the missing lab section can be created again with the same number (rule 28)', async () => {
  // its time must not overlap the lec section that is still there
  await rejects(
    admin.createSection({ code: 'BSIT_201', sectionNo: 2, lab: { day: 'Sat', timeStart: '19:30', timeEnd: '21:00' } }),
    409,
    /overlap/,
  );
  const r = await admin.createSection({
    code: 'BSIT_201', sectionNo: 2, lab: { day: 'Fri', timeStart: '19:00', timeEnd: '20:30' },
  });
  assert.deepEqual(r.created, ['BSIT_201.1']);
  // it takes the professor of the lec section that is still there
  assert.equal((await sectionRow(r.sectionIds[0])).professor_id, PROF.asantos);
  await rejects(admin.createSection({ code: 'BSIT_201', sectionNo: 2 }), 409, /already exists/);
});

test('deleting a lec section also drops its students\' lab, but keeps the lab section (rules 13, 27)', async () => {
  await addSubject(JOAQUIN, { code: 'BSIT_201.1', sectionNo: 2 });
  const r = await admin.deleteSection(newLec);
  assert.equal(r.deletedSection, 'BSIT_201');
  assert.equal(r.labsRemoved, 1);
  assert.deepEqual(await currentSubjects(JOAQUIN), {});
  assert.ok(await sectionId('BSIT_201.1', 2)); // lab section still offered
  assert.equal(await totalUnitsMismatches(), 0);
});

test('reassigning a section moves its lec and lab to the new professor together', async () => {
  const lec = await sectionId('BSIT_201', 1);
  const free = await q(
    `SELECT p.professor_id AS id FROM professor p WHERE p.is_active = 1 AND NOT EXISTS (
       SELECT 1 FROM section s JOIN section mine ON mine.section_id IN (?, ?)
       WHERE s.professor_id = p.professor_id AND s.school_year = mine.school_year AND s.semester = mine.semester
         AND s.day = mine.day AND s.time_start < mine.time_end AND mine.time_start < s.time_end)`,
    [lec, await sectionId('BSIT_201.1', 1)],
  );
  const r = await admin.reassignProfessor(lec, free[0].id);
  assert.deepEqual(r.reassigned, ['BSIT_201', 'BSIT_201.1']);
  const [a, b] = await q('SELECT professor_id AS p FROM section WHERE section_id IN (?, ?)', [lec, await sectionId('BSIT_201.1', 1)]);
  assert.equal(a.p, free[0].id);
  assert.equal(b.p, free[0].id);
});

test('reassigning a professor (rule 37)', async () => {
  const id = await sectionId('GEC_HIST', 1);
  await rejects(admin.reassignProfessor(id, PROF.jmendoza), 409, /inactive/);
  // evillanueva is free at a time no one else uses
  await admin.reassignProfessor(id, PROF.evillanueva).catch(async (err) => {
    // if that professor happens to be busy then, any free one will do
    if (err.status !== 409) throw err;
    await admin.reassignProfessor(id, PROF.cramos);
  });
});

test('demo seed: every lec and lab with the same section number share one professor', async () => {
  const [bad] = await q(
    `SELECT COUNT(*) AS n FROM section lab JOIN section lec
       ON lec.course_code = SUBSTRING(lab.course_code, 1, CHAR_LENGTH(lab.course_code) - 2)
      AND lab.course_code LIKE '%.1' AND lec.section_no = lab.section_no
      AND lec.school_year = lab.school_year AND lec.semester = lab.semester
     WHERE lec.professor_id <> lab.professor_id`,
  );
  assert.equal(bad.n, 0);
});

test('professor management (rule 37)', async () => {
  await rejects(admin.setProfessorActive(PROF.mreyes, false), 409, /Reassign/);
  await rejects(admin.deleteProfessor(PROF.mreyes), 409, /Deactivate/);
  const { id } = await admin.createProfessor({ username: 'newprof', password: 'longenough', firstName: 'New', lastName: 'Prof' });
  await rejects(admin.createProfessor({ username: 'newprof', password: 'longenough', firstName: 'A', lastName: 'B' }), 409, /taken/);
  await admin.deleteProfessor(id); // never had a section
});

test('the admin adds students; the number is generated from the entrance year', async () => {
  const [[{ last }]] = await pool.query("SELECT MAX(student_no) AS last FROM student WHERE student_no LIKE '2026%'");
  const a = await admin.createStudent({ firstName: ' Lea ', lastName: 'Santos', entranceDate: '2026-08-10', password: 'longenough' });
  assert.equal(a.studentNo, String(Number(last) + 1));
  const b = await admin.createStudent({ firstName: 'Noel', middleName: 'Cruz', lastName: 'Lim', entranceDate: '2026-08-11', password: 'longenough' });
  assert.equal(Number(b.studentNo), Number(a.studentNo) + 1);
  const c = await admin.createStudent({ firstName: 'Ivy', lastName: 'Tan', entranceDate: '2031-06-01', password: 'longenough' });
  assert.equal(c.studentNo, '203100001'); // first of a new entrance year

  const [[row]] = await pool.query('SELECT first_name, middle_name, status, password FROM student WHERE student_no = ?', [a.studentNo]);
  assert.deepEqual([row.first_name, row.middle_name, row.status], ['Lea', null, 'ACTIVE']);
  const bcrypt = (await import('bcryptjs')).default;
  assert.ok(await bcrypt.compare('longenough', row.password)); // hashed (rule 38), and the login password works

  const listed = (await admin.listStudents()).find((s) => s.studentNo === a.studentNo);
  assert.deepEqual([listed.yearLevel, listed.entranceDate, listed.status], [1, '2026-08-10', 'ACTIVE']);

  await rejects(admin.createStudent({ firstName: 'X', password: 'longenough' }), 400, /first and last name/);
  await rejects(admin.createStudent({ firstName: 'X', lastName: 'Y', password: 'short' }), 400, /8 characters/);
  await rejects(admin.createStudent({ firstName: 'X', lastName: 'Y', password: 'longenough', entranceDate: '2026-02-30' }), 400, /entrance date/);
  await pool.query('DELETE FROM student WHERE student_no IN (?, ?, ?)', [a.studentNo, b.studentNo, c.studentNo]);
});

test('grades cannot be encoded while enrollment is open', async () => {
  const id = await sectionId('GEC_ETHC', 1);
  await rejects(grades.saveGrades(id, [{ studentNo: AMARA, grade: '1.00' }], { adminId: ADMIN_ID }), 409, /closed/);
});

// ------------------------------------------------------------ closing

let closeResult;
test('closing deletes empty enrollments and empty sections (rules 9, 20)', async () => {
  await addSubject(ANDREA, { code: 'GEC_ARTA', sectionNo: 1 });
  await removeSubject(ANDREA, 'GEC_ARTA'); // leaves an empty enrollment
  await addSubject(JOAQUIN, { code: 'CIST_102.1', sectionNo: 1 }); // lab only (lec passed), 2nd attempt
  await addSubject(ELIANA, { code: 'BSIT_403', sectionNo: 1 }); // 2nd attempt
  closeResult = await admin.closePeriod();
  assert.equal(closeResult.emptyEnrollmentsDeleted, 1);
  assert.ok(closeResult.emptySectionsDeleted > 30);
  const [left] = await q(
    `SELECT COUNT(*) AS n FROM section s WHERE school_year = '2026-2027'
     AND NOT EXISTS (SELECT 1 FROM enrolled_course ec WHERE ec.section_id = s.section_id)`,
  );
  assert.equal(left.n, 0);
  assert.equal((await q("SELECT COUNT(*) AS n FROM enrollment WHERE student_no = ? AND school_year = '2026-2027'", [ANDREA]))[0].n, 0);
});

test('after closing: no student changes, no section changes (rules 7, 13)', async () => {
  await rejects(addSubject(AMARA, { code: 'GEC_HIST', sectionNo: 1 }), 409, /closed/);
  await rejects(admin.deleteSection(await sectionId('GEC_ETHC', 1)), 409, /open/);
});

// ------------------------------------------------------------ grading

test('a professor only sees their own sections (rule 30)', async () => {
  const id = await sectionId('GEC_ETHC', 1);
  const owner = (await sectionRow(id)).professor_id;
  const other = Object.values(PROF).find((p) => p !== owner && p !== PROF.jmendoza);
  await rejects(grades.sectionRoster(id, { professorId: other }), 404);
  const { students } = await grades.sectionRoster(id, { professorId: owner });
  assert.deepEqual(students.map((s) => s.studentNo), [AMARA]);
});

test('invalid grade, missing grades, then submit and lock; failed last attempt drops the student (rules 31, 32, 40)', async () => {
  const id = await sectionId('CIST_102.1', 1);
  const owner = { professorId: (await sectionRow(id)).professor_id };
  await rejects(grades.saveGrades(id, [{ studentNo: JOAQUIN, grade: '3.10' }], owner), 400, /not a valid grade/);
  await rejects(grades.saveGrades(id, [{ studentNo: AMARA, grade: '2.00' }], owner), 400, /not in this section/);
  await rejects(grades.submitGrades(id, owner), 409, /no grade/);
  await grades.saveGrades(id, [{ studentNo: JOAQUIN, grade: '5.00' }], owner);
  assert.equal(await statusOf(JOAQUIN), 'ACTIVE'); // not before submission
  const r = await grades.submitGrades(id, owner);
  assert.deepEqual(r.dropped, [JOAQUIN]); // 2nd and last attempt failed
  assert.equal(await statusOf(JOAQUIN), 'DROPPED');
  const row = await sectionRow(id);
  assert.ok(row.grades_submitted_at);
  assert.equal(row.submitted_by_admin_id, null);
  await rejects(grades.saveGrades(id, [{ studentNo: JOAQUIN, grade: '1.00' }], owner), 409, /locked/);
});

test('next period stays closed until every section is submitted (rule 35)', async () => {
  await rejects(admin.openNextPeriod(), 409, /still need submitted grades/);
});

test('admin encodes and submits the rest; INC on the last attempt drops, on the first does not (rules 31, 34, 35, 40)', async () => {
  const dropped = [];
  const pending = await q("SELECT section_id AS id, course_code AS code FROM section WHERE grades_submitted_at IS NULL");
  for (const s of pending) {
    const { students } = await grades.sectionRoster(s.id, { adminId: ADMIN_ID });
    const g = students.map((st) => ({ studentNo: st.studentNo, grade: ['GEC_ETHC', 'BSIT_403'].includes(s.code) ? 'INC' : '1.50' }));
    await grades.saveGrades(s.id, g, { adminId: ADMIN_ID });
    dropped.push(...(await grades.submitGrades(s.id, { adminId: ADMIN_ID })).dropped);
  }
  assert.deepEqual(dropped, [ELIANA]); // Amara's INC is her 1st attempt
  assert.equal(await statusOf(ELIANA), 'DROPPED');
  assert.equal(await statusOf(AMARA), 'ACTIVE');
  // The grade itself is not changed (rule 40).
  const [ec] = await q('SELECT CAST(grade AS CHAR) AS g FROM enrolled_course WHERE section_id = ?', [await sectionId('BSIT_403', 1)]);
  assert.equal(ec.g, 'INC');
  const [row] = await q('SELECT submitted_by_admin_id FROM section WHERE section_id = ?', [await sectionId('GEC_ETHC', 1)]);
  assert.equal(row.submitted_by_admin_id, ADMIN_ID);
});

test('the admin completes an INC by replacing it with a grade (rule 34)', async () => {
  const id = await sectionId('GEC_ETHC', 1);
  assert.equal((await grades.listIncompletes()).filter((i) => i.sectionId === id).length, 1);
  await rejects(grades.completeInc(id, AMARA, 'INC', ADMIN_ID), 400);
  await grades.completeInc(id, AMARA, '1.75', ADMIN_ID);
  await rejects(grades.completeInc(id, AMARA, '2.00', ADMIN_ID), 409, /Only an INC/);
  // Completing a dropped student's INC does not undo the drop (rule 40 only sets DROPPED).
  await grades.completeInc(await sectionId('BSIT_403', 1), ELIANA, '2.00', ADMIN_ID);
  assert.equal(await statusOf(ELIANA), 'DROPPED');
});

// ------------------------------------------------------------ next period

test('next period opens as the 2nd semester, OPEN', async () => {
  const r = await admin.openNextPeriod();
  assert.deepEqual(r, { schoolYear: '2026-2027', semester: 2, status: 'OPEN' });
});

test('year levels count only finalized, non-empty terms (rule 4)', async () => {
  assert.equal((await enrollmentView(ANDREA)).yearLevel, 1); // her empty term was deleted
  assert.equal((await enrollmentView(AMARA)).yearLevel, 2); // 3 terms -> ceil(4/2)
  assert.equal(await totalUnitsMismatches(), 0);
});

test('dropped students cannot enroll, but their records still load (rules 10, 40)', async () => {
  await rejects(addSubject(JOAQUIN, { code: 'CIST_103', sectionNo: 1 }), 409, /dropped/);
  const view = await enrollmentView(JOAQUIN);
  assert.equal(view.canEnroll, false);
  assert.match(view.blockReason, /dropped/);
  assert.equal(view.student.status, 'DROPPED');
});
