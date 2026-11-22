// The Enroll button: enlisted subjects become final, the admin can reopen,
// and students who never enroll lose their subjects when the period closes.
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, q, freshDatabase, sectionId, currentSubjects } from './helpers.js';

const admin = await import('../src/services/admin.js');
const { addSubject, removeSubject, confirmEnrollment } = await import('../src/services/enrollment.js');
const { enrollmentView } = await import('../src/services/eligibility.js');

const ANDREA = '202600001'; // freshman, no subjects yet
const AMARA = '202500002'; // seeded with 3 enlisted subjects
const MATEO = '202500004';

async function rejects(promise, status, text) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.status, status, `expected ${status}, got ${err.status}: ${err.message}`);
    if (text) assert.match(err.message, text);
    return true;
  });
}
const stateOf = async (no) => (await enrollmentView(no)).enrollment?.status ?? null;

before(freshDatabase);
after(() => pool.end());

test('Enroll needs at least one subject', async () => {
  await rejects(confirmEnrollment(ANDREA), 409, /at least one subject/);
});

test('added subjects are enlisted until the student clicks Enroll', async () => {
  await addSubject(ANDREA, { code: 'GEC_ARTA', sectionNo: 1 });
  await addSubject(ANDREA, { code: 'GEC_MATH', sectionNo: 1 });
  const view = await enrollmentView(ANDREA);
  assert.equal(view.enrollment.status, 'ENLISTED');
  assert.equal(view.enrollment.dateEnrolled, null);
  assert.equal(view.canEnroll, true);
});

test('after Enroll, subjects cannot be added, moved or removed', async () => {
  await confirmEnrollment(ANDREA);
  const view = await enrollmentView(ANDREA);
  assert.equal(view.enrollment.status, 'ENROLLED');
  assert.ok(view.enrollment.dateEnrolled);
  assert.equal(view.canEnroll, false);
  assert.match(view.blockReason, /registrar/);
  await rejects(addSubject(ANDREA, { code: 'GEC_PCOM', sectionNo: 1 }), 409, /already enrolled/);
  await rejects(addSubject(ANDREA, { code: 'GEC_ARTA', sectionNo: 2 }), 409, /already enrolled/);
  await rejects(removeSubject(ANDREA, 'GEC_ARTA'), 409, /already enrolled/);
  await rejects(confirmEnrollment(ANDREA), 409, /already enrolled/);
});

test('the admin can reopen; subjects stay and the student must enroll again', async () => {
  await rejects(admin.reopenEnrollment(MATEO), 409, /not enrolled/);
  await admin.reopenEnrollment(ANDREA);
  const view = await enrollmentView(ANDREA);
  assert.equal(view.enrollment.status, 'ENLISTED');
  assert.match(view.enrollment.reopenNote, /reopened/);
  assert.deepEqual(await currentSubjects(ANDREA), { GEC_ARTA: 1, GEC_MATH: 1 });
  await confirmEnrollment(ANDREA);
  assert.equal((await enrollmentView(ANDREA)).enrollment.reopenNote, null); // notice cleared
});

test('deleting a section moves its enrolled students back to enlisted, with a note', async () => {
  const id = await sectionId('GEC_MATH', 1);
  const [row] = (await admin.listStudents()).filter((s) => s.studentNo === ANDREA);
  assert.equal(row.termState, 'ENROLLED');
  const r = await admin.deleteSection(id);
  assert.equal(r.studentsMovedBack, 1);
  const view = await enrollmentView(ANDREA);
  assert.equal(view.enrollment.status, 'ENLISTED');
  assert.match(view.enrollment.reopenNote, /GEC_MATH was removed/);
  assert.deepEqual(await currentSubjects(ANDREA), { GEC_ARTA: 1 }); // other subjects keep their seats
});

test('a second deleted section is added to the same note', async () => {
  await admin.deleteSection(await sectionId('GEC_ARTA', 1));
  const { reopenNote } = (await enrollmentView(ANDREA)).enrollment;
  assert.match(reopenNote, /GEC_MATH/);
  assert.match(reopenNote, /GEC_ARTA/);
});

test('the close warning counts students who did not enroll', async () => {
  // Andrea was moved back (no subjects left); Amara is enlisted.
  assert.deepEqual(await admin.closePreview(), { notEnrolled: 2, movedBack: 1 });
  await addSubject(ANDREA, { code: 'GEC_PCOM', sectionNo: 1 });
  await confirmEnrollment(ANDREA);
  assert.deepEqual(await admin.closePreview(), { notEnrolled: 1, movedBack: 0 });
});

test('closing removes enlisted students but keeps enrolled ones', async () => {
  const amaraSection = await sectionId('GEC_ETHC', 1);
  const r = await admin.closePeriod();
  assert.equal(r.notEnrolledRemoved, 1);
  assert.equal(await stateOf(ANDREA), 'ENROLLED');
  assert.equal(await stateOf(AMARA), null);
  assert.deepEqual(await currentSubjects(AMARA), {});
  // Her section had no one else, so it is gone too, and no attempt was recorded.
  assert.equal((await q(`
    SELECT COUNT(*) AS n
    FROM section
    WHERE section_id = ?
  `, [amaraSection]))[0].n, 0);
  const [attempts] = await q(`
    SELECT COUNT(*) AS n
    FROM enrolled_course ec
    JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
    WHERE e.student_no = ?
      AND ec.course_code = 'GEC_ETHC'
  `, [AMARA]);
  assert.equal(attempts.n, 0);
});
