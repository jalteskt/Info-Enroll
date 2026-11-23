export const hhmm = (t) => t.slice(0, 5);

// Same day and the time ranges overlap.
export const overlaps = (a, b) =>
  a.day === b.day && hhmm(a.timeStart) < hhmm(b.timeEnd) && hhmm(b.timeStart) < hhmm(a.timeEnd);

export const describeTime = (s) => `${s.day} ${hhmm(s.timeStart)}-${hhmm(s.timeEnd)}`;
