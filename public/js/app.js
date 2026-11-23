import { renderTemplate } from './templates.js';
import { renderStaffView, handleStaffAction, loadStaffData } from './staff.js';
import { api } from './api.js';

const paths = {
  book: renderTemplate('icon-book'),
  grid: renderTemplate('icon-grid'),
  calendar: renderTemplate('icon-calendar'),
  file: renderTemplate('icon-file'),
  graduation: renderTemplate('icon-graduation'),
  arrow: renderTemplate('icon-arrow'),
  'arrow-right': renderTemplate('icon-arrow-right'),
  'chevron-right': renderTemplate('icon-chevron-right'),
  'chevron-down': renderTemplate('icon-chevron-down'),
  search: renderTemplate('icon-search'),
  plus: renderTemplate('icon-plus'),
  check: renderTemplate('icon-check'),
  x: renderTemplate('icon-x'),
  clock: renderTemplate('icon-clock'),
  shield: renderTemplate('icon-shield'),
  info: renderTemplate('icon-info'),
  link: renderTemplate('icon-link'),
  lock: renderTemplate('icon-lock'),
  users: renderTemplate('icon-users'),
  download: renderTemplate('icon-download'),
  print: renderTemplate('icon-print'),
  menu: renderTemplate('icon-menu'),
  mail: renderTemplate('icon-mail'),
  eye: renderTemplate('icon-eye'),
  edit: renderTemplate('icon-edit'),
  settings: renderTemplate('icon-settings'),
};
export function icon(name) {
  return renderTemplate('icon', { content: paths[name] || paths.book });
}
const escapeHTML = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Student data from the API
const COLORS = [
  ['#82465c', '#f6eaef'],
  ['#537e74', '#edf3ef'],
  ['#ac8851', '#f8f1e5'],
  ['#677b9c', '#edf0f6'],
  ['#9b7459', '#f5eee9'],
  ['#8c7795', '#f2edf5'],
];
let offers = []; // catalog items in the shape the render code expects
let term = null; // GET /api/student/enrollment
let record = null; // GET /api/student/record
const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][n] ?? 'th'}`;
const periodText = (p) =>
  p ? `${ord(p.semester)} Semester, A.Y. ${p.schoolYear.replace('-', '–')}` : '';
const termText = () => periodText(term?.period);
const maxUnits = () => term?.unitLimit?.maxUnits ?? null; // null = no cap
// Shown only, never blocks. Same formula as the server's loadStatus().
const loadLabel = (total = totalUnits(), max = maxUnits()) =>
  max == null ? 'No cap' : total < max ? 'Underload' : 'Regular load';
// Load status belongs to an enrollment; there is none until the first subject is added.
const hasEnrollment = () => Boolean(term?.enrollment || state.plan.length);
// Enlisted subjects become final when the student clicks Enroll.
const isEnrolled = () => term?.enrollment?.status === 'ENROLLED';
const periodIsOpen = () => state.open || (isEnrolled() && term?.period?.status === 'OPEN');
const toHours = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
};
const toMeeting = (m, label) => ({
  day: DAYS.indexOf(m.day),
  start: toHours(m.timeStart),
  end: toHours(m.timeEnd),
  ...(label ? { label } : {}),
});
// Lec and lab are separate subjects: one offer per course.
function toOffer(item, i) {
  const [color, bg] = COLORS[i % COLORS.length];
  return {
    id: item.code,
    code: item.code,
    title: item.title,
    units: item.units,
    year: item.yearLevel,
    type:
      item.kind === "lab"
        ? "Laboratory"
        : item.kind === "lec"
          ? "Lecture"
          : /^(GEC|GEE|PLM|PATHFIT)/.test(item.code)
            ? "General education"
            : "Major subject",
    pair: false,
    partner: item.lecCode ?? item.labCode,
    color,
    bg,
    locked: item.status === "blocked",
    passed: item.status === "passed",
    reason: item.status === "eligible" ? "" : item.reasons.join(" · "),
    enrolledSectionNo: item.enrolledSectionNo,
    sections: item.sections.map((s) => ({
      id: `${item.code}#${s.sectionNo}`,
      sectionNo: s.sectionNo,
      name: s.name,
      prof: s.professor,
      seats: Math.max(0, s.seatsLeft),
      meetings: [toMeeting(s)],
    })),
  };
}
async function loadStudentData() {
  const [view, rec] = await Promise.all([
    api('/student/enrollment'),
    api('/student/record'),
  ]);
  record = rec;
  applyView(view);
}
// The server is the source of truth: every add/remove returns the new view.
function applyView(view) {
  term = view;
  offers = view.items.map(toOffer);
  state.plan = offers
    .filter((c) => c.enrolledSectionNo)
    .map((c) => ({ course: c.id, section: `${c.id}#${c.enrolledSectionNo}` }));
  state.open = view.canEnroll;
  state.saved = true;
}
// Lec and lab are separate subjects.
function pairNote(c) {
  const partner = c.partner && getCourse(c.partner);
  if (!partner) return '';
  const has = state.plan.some((p) => p.course === partner.id);
  if (c.type === 'Lecture')
    return partner.passed
      ? `Its laboratory ${partner.code} is already passed.`
      : `Its laboratory ${partner.code} is a separate subject. You may choose any of its sections, or take it in a later semester.`;
  return has
    ? `Its lecture ${partner.code} is in your plan, so this lab can be in a different section.`
    : `Its lecture ${partner.code} is already passed.`;
}
let busy = false;
let state = {
  view: 'login',
  role: 'student',
  user: null,
  plan: [],
  search: '',
  filter: 'all',
  tab: 'eligible',
  menu: false,
  mobile: false,
  saved: true,
  open: false,
  loginRole: 'student',
};
let toastTimer;
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
const getCourse = (id) => offers.find((c) => c.id === id);
const getSection = (item) =>
  getCourse(item.course)?.sections.find((s) => s.id === item.section);
const totalUnits = () =>
  state.plan.reduce((sum, item) => sum + getCourse(item.course).units, 0);
const clockLabel = (n) => {
  const minutes = Math.round((n % 1) * 60);
  return `${Math.floor(n) % 12 || 12}${minutes ? ':' + String(minutes).padStart(2, '0') : ''}${n >= 12 ? ' PM' : ' AM'}`;
};
const timeRange = (m) => `${clockLabel(m.start)}–${clockLabel(m.end)}`;
const meetingLabel = (m) => `${DAYS[m.day]} ${timeRange(m)}`;
const shortMeetings = (s) =>
  s.meetings
    .map((m) => `${DAYS[m.day]} ${clockLabel(m.start)}–${clockLabel(m.end)}`)
    .join(' · ');
function notify(message, error = false) {
  const box = document.querySelector('#toast');
  clearTimeout(toastTimer);
  box.textContent = message;
  box.className = `toast visible${error ? ' error' : ''}`;
  toastTimer = setTimeout(() => box.classList.remove('visible'), 4500);
}
function conflictFor(section, exclude) {
  for (const p of state.plan) {
    if (p.course === exclude) continue;
    const s = getSection(p);
    for (const m of section.meetings) {
      if (
        s.meetings.some(
          (other) =>
            m.day === other.day && m.start < other.end && other.start < m.end,
        )
      )
        return getCourse(p.course).title;
    }
  }
  return null;
}
function campusArt() {
  return renderTemplate('campus-art');
}
function brand() {
  return renderTemplate('brand', { icon: icon('book') });
}
function sidebar() {
  const staff = state.role !== 'student';
  const nav = staff
    ? state.role === 'professor'
      ? [['workspace', 'My classes', 'grid']]
      : [
          ['workspace', 'Overview', 'grid'],
          ['admin-sections', 'Sections', 'calendar'],
          ['admin-grades', 'Grades', 'graduation'],
          ['admin-students', 'Students', 'users'],
          ['admin-professors', 'Professors', 'users'],
        ]
    : [
        ['enrollment', 'Enrollment', 'book'],
        ['schedule', 'My schedule', 'calendar'],
        ['record', 'Academic record', 'graduation'],
        ['summary', 'Enrollment summary', 'file'],
      ];
  return renderTemplate('sidebar', {
    content: state.mobile ? renderTemplate('sidebar-2') : '',
    content2: state.mobile ? 'is-open' : '',
    brand: brand(),
    portalLabel: `${state.role.toUpperCase()} PORTAL`,
    content5: nav
      .map(([key, label, i]) =>
        renderTemplate('sidebar-3', {
          content: state.view === key ? 'active' : '',
          key: key,
          content3: state.view === key ? 'aria-current="page"' : '',
          icon: icon(i),
          label: label,
          content6: state.view === key ? renderTemplate('sidebar-4') : '',
        }),
      )
      .join(''),
  });
}
function topbar() {
  const user = state.user;
  const name = `${user.firstName} ${user.lastName}`;
  const role = {
    student: `Student no. ${user.login}`,
    professor: 'Professor portal',
    admin: 'Administration',
  }[user.role];
  const labels = {
    enrollment: 'Enrollment',
    schedule: 'My schedule',
    record: 'Academic record',
    summary: 'Enrollment summary',
    workspace: state.role === 'professor' ? 'My classes' : 'Overview',
    'admin-sections': 'Sections',
    'admin-grades': 'Grades',
    'admin-students': 'Students',
    'admin-professors': 'Professors',
  };
  return renderTemplate('topbar', {
    mobile: state.mobile,
    icon: icon('menu'),
    icon3: icon('chevron-right'),
    content:
      state.role === 'student'
        ? 'Student portal'
        : state.role === 'professor'
          ? 'Professor portal'
          : 'Administration',
    icon5: icon('chevron-right'),
    content6: labels[state.view],
    menu: state.menu,
    name: name,
    role: role,
    icon12: icon('chevron-down'),
    content13: state.menu
      ? renderTemplate('topbar-2', {
          content: escapeHTML(user.login),
          icon: icon('arrow'),
        })
      : '',
  });
}
function enrollment() {
  const st = term.student;
  return renderTemplate('enrollment', {
    campusPhoto: campusArt(),
    reopenNotice:
      term.enrollment?.reopenNote && !isEnrolled()
        ? renderTemplate('enrollment-notice', {
            icon: icon('info'),
            note: escapeHTML(term.enrollment.reopenNote),
          })
        : '',
    termLabel: escapeHTML(termText() || 'No enrollment period'),
    yearStanding: `${ord(term.yearLevel)} year${st.status === 'DROPPED' ? ' · Dropped' : ''}`,
    studentName: escapeHTML(
      [st.firstName, st.middleName, st.lastName].filter(Boolean).join(' '),
    ),
    studentNo: escapeHTML(st.studentNo),
    standing: `BS Information Technology · ${ord(term.yearLevel)} year${st.status === 'DROPPED' ? ' · Dropped' : ''}`,
    semester: term.period ? `${ord(term.period.semester)} semester` : 'No period',
    content: periodIsOpen() ? 'badge-green' : 'badge-neutral',
    content2: periodIsOpen() ? 'open' : 'closed',
    length: offers.length,
    icon: icon('search'),
    escapeHTML: escapeHTML(state.search),
    content6: state.filter === 'all' ? 'selected' : '',
    content7: [1, 2, 3, 4]
      .map((y) =>
        renderTemplate('enrollment-2', {
          y: y,
          content: state.filter === String(y) ? 'selected' : '',
          content3: ord(y),
        }),
      )
      .join(''),
    content8: [
      ['all', 'All subjects'],
      ['eligible', 'Eligible for you'],
      ['selected', 'Selected'],
    ]
      .map(([key, label]) =>
        renderTemplate('enrollment-3', {
          content: state.tab === key ? 'active' : '',
          key: key,
          content3: state.tab === key,
          label: label,
        }),
      )
      .join(''),
    courseRows: courseRows(),
    icon10: icon('info'),
    planPanel: planPanel(),
    icon12: icon('shield'),
  });
}
function courseRows() {
  let rows = offers.filter(
    (c) =>
      (state.filter === 'all' || String(c.year) === state.filter) &&
      `${c.code} ${c.title}`
        .toLowerCase()
        .includes(state.search.toLowerCase()) &&
      (state.tab !== 'eligible' || (!c.locked && !c.passed)) &&
      (state.tab !== 'selected' || state.plan.some((p) => p.course === c.id)),
  );
  if (!rows.length)
    return renderTemplate('course-rows', { icon: icon('search') });
  return renderTemplate('course-rows-2', {
    content: rows
      .map((c) => {
        const selected = state.plan.some((p) => p.course === c.id);
        return renderTemplate('course-rows-3', {
          content: selected ? 'selected-row' : '',
          code: c.code,
          title: c.title,
          content4: c.partner ? icon('link') : '',
          type: c.type,
          content6: ord(c.year),
          units: c.units,
          content8: c.units === 1 ? 'unit' : 'units',
          content9: c.locked || c.passed ? 'locked' : '',
          icon: icon(c.locked ? 'lock' : 'check'),
          content11: c.locked
            ? 'Not yet eligible'
            : c.passed
              ? 'Completed'
              : selected
                ? 'Selected'
                : 'Eligible',
          content12: c.reason
            ? renderTemplate('course-rows-4', { reason: c.reason })
            : '',
          content13: selected ? 'added' : '',
          id: c.id,
          content15: c.locked || c.passed || !state.open ? 'disabled' : '',
          content16: selected ? 'Change section for' : 'Choose a section for',
          title17: c.title,
          content18: selected
            ? 'Change section'
            : c.locked || c.passed
              ? c.reason
              : !state.open
                ? term?.blockReason || 'Enrollment is closed'
                : 'Choose section',
          icon19: icon(selected ? 'check' : c.locked ? 'lock' : 'plus'),
        });
      })
      .join(''),
  });
}
function planPanel() {
  const total = totalUnits();
  const max = maxUnits();
  const boxes = max ?? Math.max(total, 1);
  return renderTemplate('plan-panel', {
    icon: icon('file'),
    length: state.plan.length,
    icon3: icon('calendar'),
    term: termText(),
    total: total,
    MAX_UNITS: max == null ? '· no cap' : `/ ${max}`,
    total6: total,
    max: boxes,
    content: Array.from({ length: boxes }, (_, i) =>
      renderTemplate('plan-panel-2', { content: i < total ? 'filled' : '' }),
    ).join(''),
    icon8: icon('check'),
    content9: !hasEnrollment() && !state.open
      ? 'Not enrolled this term'
      : (hasEnrollment() ? `${loadLabel(total, max)} · ` : '') +
        (max == null
          ? `${hasEnrollment() ? 'no' : 'No'} unit cap for ${ord(term.yearLevel)} year`
          : `${max - total} units available in your load`),
    content10: state.plan.length
      ? state.plan
          .map((p) => {
            const c = getCourse(p.course),
              s = getSection(p);
            return renderTemplate('plan-panel-3', {
              color: c.color,
              code: c.code,
              units: c.units === 1 ? '1 unit' : `${c.units} units`,
              title: c.title,
              icon: icon('users'),
              name: s.name,
              content: s.meetings
                .map((m) =>
                  renderTemplate('plan-panel-4', {
                    icon: icon('clock'),
                    meetingLabel: meetingLabel(m),
                    content: m.label
                      ? renderTemplate('plan-panel-5', { label: m.label })
                      : '',
                  }),
                )
                .join(''),
              content8: state.open
                ? renderTemplate('plan-panel-6', {
                    id: c.id,
                    title: c.title,
                    content:
                      c.type === 'Lecture' &&
                      state.plan.some((p) => p.course === c.partner)
                        ? ' and its laboratory'
                        : '',
                    icon: icon('x'),
                  })
                : icon('lock'),
            });
          })
          .join('')
      : renderTemplate('plan-panel-7', { icon: icon('book') }),
    content11: state.open && state.plan.length ? '' : 'disabled',
    icon12: icon(state.open || isEnrolled() ? 'check' : 'lock'),
    content13: isEnrolled()
      ? 'Enrolled'
      : !state.open
        ? 'Enrollment closed'
        : state.plan.length
          ? 'Enroll'
          : 'No subjects yet',
    content14: '',
    icon15: icon('calendar'),
    icon16: icon(state.open || isEnrolled() ? 'check' : 'lock'),
    content17: isEnrolled()
      ? `Enrolled on ${term.enrollment.dateEnrolled}. Ask the registrar if you need changes.`
      : !state.open
        ? term?.blockReason ?? 'Your enrollment is read-only'
        : state.plan.length
          ? 'Enlisted, not yet enrolled. Click Enroll before the period ends, or these subjects are removed.'
          : 'Changes are saved as you make them',
  });
}
function openSections(id) {
  const c = getCourse(id);
  if (!state.open)
    return notify(term?.blockReason ?? 'Enrollment is closed. Your plan is read-only.', true);
  if (!c || c.locked || c.passed) return;
  const current = state.plan.find((p) => p.course === id);
  modal.innerHTML = renderTemplate('open-sections', {
    code: c.code,
    icon: icon('x'),
    id: c.id,
    title: c.title,
    units: c.units,
    content: pairNote(c)
      ? renderTemplate('open-sections-2', {
          icon: icon('link'),
          note: pairNote(c),
        })
      : '',
    content7: c.sections
      .map((s) => {
        const conflict = conflictFor(s, id);
        return renderTemplate('open-sections-3', {
          id: s.id,
          content: current?.section === s.id ? 'checked' : '',
          content3: !s.seats || conflict ? 'disabled' : '',
          name: s.name,
          content5: s.seats ? 'badge-green' : 'badge-neutral',
          content6: s.seats ? `${s.seats} seats left` : 'Full',
          prof: s.prof,
          content8: s.meetings
            .map((m) =>
              renderTemplate('open-sections-4', {
                content: m.label ? `${m.label} · ` : '',
                meetingLabel: meetingLabel(m),
              }),
            )
            .join(''),
          content9: conflict
            ? renderTemplate('open-sections-5', { conflict: conflict })
            : '',
        });
      })
      .join(''),
    content8: current ? 'Change section' : 'Add to my enrollment',
    icon9: icon('plus'),
    removeButton: current
      ? renderTemplate('open-sections-remove', {
          id: c.id,
          title: c.title,
          lab:
            c.type === 'Lecture' && state.plan.some((p) => p.course === c.partner)
              ? ' and its laboratory'
              : '',
          icon: icon('x'),
        })
      : '',
  });
  modal.showModal();
}
function schedule() {
  return renderTemplate('schedule', {
    icon: icon('edit'),
    TERM: termText(),
    length: state.plan.length,
    totalUnits: totalUnits(),
    content: !state.plan.length ? renderTemplate('schedule-2') : '',
    content6: DAYS.map((d) =>
      renderTemplate('schedule-3', { content: d.toUpperCase() }),
    ).join(''),
    content7: Array.from({ length: 12 }, (_, i) =>
      renderTemplate('schedule-4', { clockLabel: clockLabel(i + 7) }),
    ).join(''),
    content8: DAYS.map((_, day) =>
      renderTemplate('schedule-5', {
        content: DAYS[day],
        content2: state.plan
          .flatMap((p) => {
            const c = getCourse(p.course),
              s = getSection(p);
            return s.meetings
              .filter((m) => m.day === day)
              .map((m) =>
                renderTemplate('schedule-6', {
                  content: (m.start - 7) * 56,
                  content2: (m.end - m.start) * 56 - 5,
                  color: c.color,
                  bg: c.bg,
                  title: c.title,
                  content6: m.label || s.name,
                  timeRange: timeRange(m),
                }),
              );
          })
          .join(''),
      }),
    ).join(''),
    content9: state.plan
      .map((p) => {
        const c = getCourse(p.course);
        return renderTemplate('schedule-7', { color: c.color, title: c.title });
      })
      .join(''),
  });
}
const GRADE_BADGE = {
  passed: ['green', 'Passed'],
  failed: ['amber', 'Failed'],
  inc: ['amber', 'Incomplete'],
  pending: ['neutral', 'Pending'],
};
function academicRecord() {
  const r = record;
  return renderTemplate('academic-record', {
    icon: icon('book'),
    icon2: icon('graduation'),
    icon3: icon('calendar'),
    unitsPassed: r.unitsPassed,
    coursesPassed: `${r.coursesPassed} of ${r.totalCourses} subjects passed`,
    average: r.latestAverage ?? '—',
    yearLevel: ord(term?.yearLevel ?? r.yearLevel),
    standingNote:
      r.status === 'DROPPED'
        ? 'Dropped from the program'
        : 'BS Information Technology',
    passedBadge: `${r.coursesPassed} passed`,
    content: r.terms.length
      ? r.terms
          .map((t) =>
            renderTemplate('academic-record-term', {
              term: `${ord(t.semester)} semester · A.Y. ${t.schoolYear.replace('-', '–')} · ${ord(t.yearLevel)} year · ${t.totalUnits} units, ${t.loadStatus}`,
              content: t.courses
                .map((c) =>
                  renderTemplate('academic-record-2', {
                    code: c.code,
                    title: escapeHTML(c.title),
                    u: c.units,
                    grade: c.grade ?? '—',
                    color: GRADE_BADGE[c.status][0],
                    status: GRADE_BADGE[c.status][1],
                  }),
                )
                .join(''),
            }),
          )
          .join('')
      : renderTemplate('academic-record-empty'),
  });
}
function summary() {
  const st = term.student;
  return renderTemplate('summary', {
    content: isEnrolled() ? 'badge-green' : 'badge-amber',
    content3: isEnrolled() ? 'Enrolled' : state.open ? 'Enlisted, not yet enrolled' : 'Not enrolled',
    studentName: escapeHTML(
      [st.firstName, st.middleName, st.lastName].filter(Boolean).join(' '),
    ),
    studentNo: escapeHTML(st.studentNo),
    yearLevel: ord(term.yearLevel),
    TERM: termText(),
    content5: state.plan.length
      ? state.plan
          .map((p) => {
            const c = getCourse(p.course),
              s = getSection(p);
            return renderTemplate('summary-2', {
              code: c.code,
              title: c.title,
              name: s.name,
              content: s.meetings
                .map((m) =>
                  renderTemplate('summary-3', {
                    meetingLabel: meetingLabel(m),
                    content: m.label ? ` · ${m.label}` : '',
                  }),
                )
                .join(''),
              units: c.units,
            });
          })
          .join('')
      : renderTemplate('summary-4'),
    totalUnits: totalUnits(),
    loadStatus: hasEnrollment() ? loadLabel() : '—',
    icon7: icon('info'),
    content8: isEnrolled()
      ? 'Your enrollment is final.'
      : state.open
        ? 'These subjects are enlisted only. Click Enroll on the Enrollment page before the period ends, or they are removed.'
        : 'Enrollment is closed.',
  });
}
let demoAccounts = null;
function login() {
  return renderTemplate('login', {
    demoLogin: demoAccounts ? renderTemplate('demo-login', { role: state.loginRole }) : '',
    brand: brand(),
    campusArt: campusArt(),
    content: ['student', 'professor', 'admin']
      .map((r) =>
        renderTemplate('login-2', {
          content: state.loginRole === r ? 'active' : '',
          r: r,
          content3: state.loginRole === r,
          content4: r[0].toUpperCase() + r.slice(1),
        }),
      )
      .join(''),
    content4: state.loginRole === 'student' ? 'Student number' : 'Username',
    content5:
      state.loginRole === 'student' ? 'e.g. 202500002' : 'e.g. mreyes',
    icon: icon('eye'),
  });
}
function mobilePlanBar() {
  return renderTemplate('mobile-plan-bar', {
    totalUnits: totalUnits(),
    MAX_UNITS: maxUnits() == null ? '· no unit cap' : `/ ${maxUnits()} units`,
    length: state.plan.length,
    content: isEnrolled() ? 'Enrolled' : state.open ? 'Enlisted' : 'Read-only',
    icon: icon('arrow'),
  });
}
function render() {
  const scroll = window.scrollY;
  if (!state.user) state.view = 'login';
  if (state.view === 'login') {
    app.innerHTML = login();
    return;
  }
  const content =
    state.role !== 'student'
      ? renderStaffView(state.role, icon, state.view)
      : state.view === 'schedule'
        ? schedule()
        : state.view === 'record'
          ? academicRecord()
          : state.view === 'summary'
            ? summary()
            : enrollment();
  app.innerHTML = renderTemplate('render', {
    sidebar: sidebar(),
    topbar: topbar(),
    content: content,
    content5:
      state.role === 'student' && state.view === 'enrollment'
        ? mobilePlanBar()
        : '',
  });
  window.scrollTo(0, scroll);
}
function navigate(view) {
  state.view = view;
  state.mobile = false;
  state.menu = false;
  render();
  window.scrollTo(0, 0);
  document.querySelector('#main-content')?.focus({ preventScroll: true });
}
// Staff actions may call the API; one at a time.
let staffBusy = false;
async function runStaffAction(action, value) {
  if (staffBusy) return;
  staffBusy = true;
  try {
    const result =
      (await handleStaffAction(action, state.role, value, icon)) || {};
    if (result.closeModal && modal.open) modal.close();
    if (result.rerender) render();
    if (result.modal) {
      modal.innerHTML = result.modal;
      if (!modal.open) modal.showModal();
    }
    if (result.formError) {
      // Show the reason inside the open dialog, or as a toast.
      const box = modal.open && modal.querySelector('#staff-form-error');
      if (box) box.textContent = result.formError;
      else notify(result.formError, true);
    }
    if (result.toast) notify(result.toast, result.error);
  } catch (err) {
    notify(err.message, true);
  } finally {
    staffBusy = false;
  }
}
// Called after sign-in, or on page load when a session already exists.
async function applyUser(user) {
  state.role = user.role;
  state.loginRole = user.role;
  try {
    if (user.role === 'student') await loadStudentData();
    else await loadStaffData(user.role);
  } catch (err) {
    state.user = null;
    render();
    notify(`Could not load your portal: ${err.message}`, true);
    return;
  }
  state.user = user;
  state.view = user.role === 'student' ? 'enrollment' : 'workspace';
  state.menu = false;
  state.mobile = false;
  render();
  window.scrollTo(0, 0);
}
async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {}
  state.user = null;
  state.view = 'login';
  state.menu = false;
  state.mobile = false;
  render();
  window.scrollTo(0, 0);
}
function openEnrollConfirm() {
  if (!state.open || !state.plan.length) return;
  const n = state.plan.length;
  modal.innerHTML = renderTemplate('enroll-confirm', {
    icon: icon('x'),
    term: termText(),
    count: `${n} subject${n === 1 ? '' : 's'}`,
    units: totalUnits(),
    check: icon('check'),
  });
  modal.showModal();
}
async function submitEnroll() {
  if (busy) return;
  busy = true;
  const button = modal.querySelector('[data-action="enroll-confirm"]');
  if (button) button.disabled = true;
  try {
    applyView(await api('/student/enrollment/confirm', { method: 'POST' }));
    modal.close();
    render();
    notify('You are now enrolled. Your subjects are final.');
  } catch (err) {
    const box = modal.querySelector('#enroll-error');
    if (box) box.textContent = err.message;
    if (button) button.disabled = false;
    try {
      applyView(await api('/student/enrollment'));
      render();
    } catch {}
  } finally {
    busy = false;
  }
}
function help() {
  modal.innerHTML = renderTemplate('help', {
    icon: icon('x'),
    content: [
      [
        '01 · Choose your subjects',
        'Browse subjects offered this semester. Eligibility tells you which subjects you can take based on your academic record.',
      ],
      [
        '02 · Find a section that fits',
        'Choose a schedule without overlaps. Lecture and laboratory are separate subjects and can be in different sections; take the lecture first (removing a lecture also removes its lab). Your unit limit depends on your year level.',
      ],
      [
        '03 · Review and enroll',
        'Every change is saved as you make it, but your subjects are only enlisted. Check your weekly schedule, then click Enroll to make them final. Subjects not enrolled when the period ends are removed.',
      ],
      [
        'Need an adviser?',
        'For official curriculum and enrollment decisions, consult your college adviser or the University Registrar.',
      ],
    ]
      .map(([h, p]) => renderTemplate('help-2', { h: h, p: p }))
      .join(''),
    icon3: icon('check'),
  });
  modal.showModal();
}
document.addEventListener('click', (e) => {
  if (demoAccounts && e.target.closest('[data-demo-login]')) {
    const form = document.querySelector('#login-form');
    form.querySelector('#login-username').value = demoAccounts.logins[state.loginRole];
    form.querySelector('#login-password').value = demoAccounts.password;
    form.requestSubmit();
    return;
  }
  const loginRole = e.target.closest('[data-login-role]');
  if (loginRole) {
    state.loginRole = loginRole.dataset.loginRole;
    render();
    return;
  }
  const nav = e.target.closest('[data-view]');
  if (nav) {
    navigate(nav.dataset.view);
    return;
  }
  const tab = e.target.closest('[data-tab]');
  if (tab) {
    state.tab = tab.dataset.tab;
    render();
    return;
  }
  const course = e.target.closest('[data-course]');
  if (course && !course.disabled) {
    openSections(course.dataset.course);
    return;
  }
  const remove = e.target.closest('[data-remove]');
  if (remove) {
    if (!state.open || busy) return;
    if (modal.open) modal.close(); // "Remove subject" in the section dialog
    const c = getCourse(remove.dataset.remove);
    const withLab =
      c.type === 'Lecture' && state.plan.some((p) => p.course === c.partner);
    busy = true;
    api(`/student/enrollment/subjects/${encodeURIComponent(c.id)}`, {
      method: 'DELETE',
    })
      .then((view) => {
        applyView(view);
        render();
        notify(
          `${c.code} ${c.title}${withLab ? ` and its laboratory ${c.partner}` : ''} removed.`,
        );
      })
      .catch((err) => notify(err.message, true))
      .finally(() => (busy = false));
    return;
  }
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) {
    if (state.menu && !e.target.closest('.account-menu')) {
      state.menu = false;
      render();
    }
    return;
  }
  if (action.startsWith('staff-')) {
    runStaffAction(action);
    return;
  }
  if (action === 'close-modal') modal.close();
  if (action === 'account-menu') {
    state.menu = !state.menu;
    render();
  }
  if (action === 'mobile-menu') {
    state.mobile = !state.mobile;
    render();
  }
  if (action === 'mobile-plan')
    document
      .querySelector('.plan-panel')
      ?.scrollIntoView({
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
        block: 'start',
      });
  if (action === 'help') help();
  if (action === 'reset-filters') {
    state.search = '';
    state.filter = 'all';
    state.tab = 'all';
    render();
  }
  if (action === 'enroll') openEnrollConfirm();
  if (action === 'enroll-confirm') submitEnroll();
  if (action === 'print') window.print();
  if (action === 'sign-out') signOut();
  if (action === 'show-password') {
    const field = document.querySelector('#login-password');
    field.type = field.type === 'password' ? 'text' : 'password';
    e.target
      .closest('button')
      .setAttribute(
        'aria-label',
        field.type === 'password' ? 'Show password' : 'Hide password',
      );
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'subject-search') {
    state.search = e.target.value;
    document.querySelector('#course-results').innerHTML = courseRows();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'year-filter') {
    state.filter = e.target.value;
    document.querySelector('#course-results').innerHTML = courseRows();
  }
  if (e.target.id === 'staff-term') runStaffAction('staff-term', e.target.value);
  if (e.target.matches('[data-staff-reassign]'))
    runStaffAction(
      'staff-reassign',
      `${e.target.dataset.staffReassign}:${e.target.value}`,
    );
  if (e.target.matches('[data-staff-grade]')) {
    handleStaffAction('staff-grade-change', state.role);
    const grade = e.target.value;
    const label = !grade
      ? 'Awaiting grade'
      : grade === 'INC'
        ? 'Incomplete'
        : Number(grade) <= 3
          ? 'Passed'
          : 'Failed';
    const color =
      label === 'Passed'
        ? 'green'
        : label === 'Awaiting grade'
          ? 'neutral'
          : 'amber';
    e.target.closest('tr').lastElementChild.innerHTML = renderTemplate(
      'dialogs-3',
      { color: color, label: label },
    );
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'login-form') {
    e.preventDefault();
    const error = document.querySelector('#login-error');
    const button = e.target.querySelector('button[type="submit"]');
    error.textContent = '';
    button.disabled = true;
    try {
      const { user } = await api('/auth/login', {
        method: 'POST',
        body: {
          role: state.loginRole,
          login: document.querySelector('#login-username').value,
          password: document.querySelector('#login-password').value,
        },
      });
      await applyUser(user);
    } catch (err) {
      error.textContent = err.message;
      button.disabled = false;
    }
    return;
  }
  if (e.target.dataset.staffForm) {
    e.preventDefault();
    const error = e.target.querySelector('#staff-form-error');
    if (error) error.textContent = '';
    runStaffAction(`staff-form-${e.target.dataset.staffForm}`, e.target);
    return;
  }
  if (e.target.id !== 'section-form') return;
  e.preventDefault();
  const c = getCourse(e.target.dataset.courseId);
  const selected = new FormData(e.target).get('section');
  const error = document.querySelector('#section-error');
  if (!state.open) {
    error.textContent = 'Enrollment is closed.';
    return;
  }
  if (!selected) {
    error.textContent = 'Please choose an available section.';
    return;
  }
  const s = c.sections.find((x) => x.id === selected);
  const existing = state.plan.find((p) => p.course === c.id);
  // Quick checks for a friendly message; the server checks everything again.
  const next = totalUnits() - (existing ? c.units : 0) + c.units;
  const max = maxUnits();
  if (max != null && next > max) {
    error.textContent = `This would bring you to ${next} units. Your limit is ${max}. Remove another subject first.`;
    return;
  }
  if (!s?.seats || conflictFor(s, c.id)) {
    error.textContent =
      'This section is full or conflicts with your schedule.';
    return;
  }
  if (busy) return;
  busy = true;
  const button = e.target.querySelector('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const view = await api('/student/enrollment/subjects', {
      method: 'POST',
      body: { code: c.id, sectionNo: s.sectionNo },
    });
    applyView(view);
    modal.close();
    render();
    notify(
      `${c.code} ${existing ? 'moved to' : 'added in'} ${s.name}.`,
    );
  } catch (err) {
    error.textContent = err.message;
    if (button) button.disabled = false;
    // Seats or the period may have changed meanwhile: refresh the catalog.
    if (err.status === 409) {
      try {
        applyView(await api('/student/enrollment'));
        render();
      } catch {}
    }
  } finally {
    busy = false;
  }
});
modal.addEventListener('click', (e) => {
  if (e.target === modal) {
    const bounds = modal.getBoundingClientRect();
    if (
      e.clientX < bounds.left ||
      e.clientX > bounds.right ||
      e.clientY < bounds.top ||
      e.clientY > bounds.bottom
    )
      modal.close();
  }
});

// Restore an existing session on page load; otherwise show the sign-in page.
try {
  const { user, demoLogin } = await api('/auth/me');
  demoAccounts = demoLogin;
  if (user) await applyUser(user);
  else render();
} catch {
  render();
}
