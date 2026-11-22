// The default sections of a period: 2 sections of every subject of that
// semester, each with a day, time and professor. No database access here, so
// the demo seed can use it too.
export const DEFAULT_SECTIONS = 2;

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const TIMES = [
  ['07:00', '08:30'],
  ['08:30', '10:00'],
  ['10:00', '11:30'],
  ['11:30', '13:00'],
  ['13:00', '14:30'],
  ['14:30', '16:00'],
  ['16:00', '17:30'],
  ['17:30', '19:00'],
]; // 6 days x 8 times = 48 slots

const SLOTS = DAYS.length * TIMES.length;
const lecCode = (code) => code.replace(/\.1$/, '');

// courses: [{ code, yearLevel }] of one semester. professorIds: active professors.
// Slots run in order through all of section 1, then all of section 2, wrapping
// after 48. So sections with the same number never overlap each other, and a
// shared slot always goes to two different professors (rule 36).
// A lec and lab get the same professor when one is free for both; the admin
// can change either afterward. Returns { sections, skipped }: skipped counts
// the sections no free professor could take.
export function planDefaultSections(courses, professorIds) {
  const ordered = [...courses].sort(
    (a, b) => a.yearLevel - b.yearLevel || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
  );

  const groups = new Map(); // "lec code#section number" -> its meetings
  let next = 0;
  for (let sectionNo = 1; sectionNo <= DEFAULT_SECTIONS; sectionNo++) {
    for (const { code } of ordered) {
      const slot = next++ % SLOTS;
      const key = `${lecCode(code)}#${sectionNo}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ code, sectionNo, slot });
    }
  }

  const busy = new Map(professorIds.map((id) => [id, new Set()]));
  let turn = 0;
  // The next professor in rotation who is free at all of these slots.
  const pick = (slots) => {
    for (let i = 0; i < professorIds.length; i++) {
      const id = professorIds[(turn + i) % professorIds.length];
      if (slots.every((s) => !busy.get(id).has(s))) {
        turn = (turn + i + 1) % professorIds.length;
        return id;
      }
    }
    return null;
  };

  const sections = [];
  let skipped = 0;
  const place = (meeting, professorId) => {
    busy.get(professorId).add(meeting.slot);
    sections.push({
      code: meeting.code,
      sectionNo: meeting.sectionNo,
      day: DAYS[meeting.slot % DAYS.length],
      timeStart: TIMES[Math.floor(meeting.slot / DAYS.length)][0],
      timeEnd: TIMES[Math.floor(meeting.slot / DAYS.length)][1],
      professorId,
    });
  };
  for (const meetings of groups.values()) {
    const shared = pick(meetings.map((m) => m.slot));
    for (const m of meetings) {
      const professorId = shared ?? pick([m.slot]);
      if (professorId == null) skipped++;
      else place(m, professorId);
    }
  }
  return { sections, skipped };
}
