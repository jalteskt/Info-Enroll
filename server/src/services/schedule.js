// Time helpers. Times are 'HH:MM' or 'HH:MM:SS' strings, which compare
// correctly as text as long as both sides use two-digit hours.
export const hhmm = (t) => t.slice(0, 5);

// Rules 19, 28, 36: same day and the time ranges overlap.
export const overlaps = (a, b) =>
  a.day === b.day && hhmm(a.timeStart) < hhmm(b.timeEnd) && hhmm(b.timeStart) < hhmm(a.timeEnd);

export const describeTime = (s) => `${s.day} ${hhmm(s.timeStart)}-${hhmm(s.timeEnd)}`;
