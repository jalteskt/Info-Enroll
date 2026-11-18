import { renderTemplate } from './templates.js';
import { renderStaffView, handleStaffAction } from './staff.js';

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
  bell: renderTemplate('icon-bell'),
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
const TERM = '1st Semester, A.Y. 2026–2027';
const MAX_UNITS = 18;
const offers = [
  {
    id: 'im',
    code: 'CIST_301',
    title: 'Information Management',
    units: 3,
    year: 3,
    type: 'Major subject',
    color: '#82465c',
    bg: '#f6eaef',
    prerequisite: 'Data Structures & Algorithms',
    sections: [
      {
        id: 'im1',
        name: 'BSIT 3-1',
        prof: 'Prof. M. Reyes',
        seats: 12,
        meetings: [{ day: 0, start: 8, end: 10 }],
      },
      {
        id: 'im2',
        name: 'BSIT 3-2',
        prof: 'Prof. M. Reyes',
        seats: 8,
        meetings: [{ day: 0, start: 10, end: 12 }],
      },
    ],
  },
  {
    id: 'web',
    code: 'CIST_302 / CIST_302.1',
    title: 'Web Systems & Technologies',
    units: 4,
    year: 3,
    type: 'Lecture + laboratory',
    pair: true,
    color: '#537e74',
    bg: '#edf3ef',
    prerequisite: 'Computer Programming II',
    sections: [
      {
        id: 'web1',
        name: 'BSIT 3-1',
        prof: 'Prof. A. Santos',
        seats: 14,
        meetings: [
          { day: 1, start: 8, end: 10, label: 'Lecture' },
          { day: 3, start: 8, end: 10, label: 'Laboratory' },
        ],
      },
      {
        id: 'web2',
        name: 'BSIT 3-2',
        prof: 'Prof. A. Santos',
        seats: 0,
        meetings: [
          { day: 1, start: 10, end: 12, label: 'Lecture' },
          { day: 3, start: 10, end: 12, label: 'Laboratory' },
        ],
      },
    ],
  },
  {
    id: 'net',
    code: 'CIST_303 / CIST_303.1',
    title: 'Networking Fundamentals',
    units: 4,
    year: 3,
    type: 'Lecture + laboratory',
    pair: true,
    color: '#ac8851',
    bg: '#f8f1e5',
    prerequisite: 'Computer Systems Organization',
    sections: [
      {
        id: 'net1',
        name: 'BSIT 3-1',
        prof: 'Prof. J. Mendoza',
        seats: 6,
        meetings: [
          { day: 0, start: 10, end: 12, label: 'Lecture' },
          { day: 2, start: 13, end: 15, label: 'Laboratory' },
        ],
      },
      {
        id: 'net2',
        name: 'BSIT 3-2',
        prof: 'Prof. J. Mendoza',
        seats: 19,
        meetings: [
          { day: 1, start: 13, end: 15, label: 'Lecture' },
          { day: 3, start: 13, end: 15, label: 'Laboratory' },
        ],
      },
    ],
  },
  {
    id: 'se',
    code: 'CIST_304',
    title: 'Software Engineering',
    units: 3,
    year: 3,
    type: 'Major subject',
    color: '#677b9c',
    bg: '#edf0f6',
    prerequisite: 'Object-Oriented Programming',
    sections: [
      {
        id: 'se1',
        name: 'BSIT 3-1',
        prof: 'Prof. L. Garcia',
        seats: 11,
        meetings: [{ day: 2, start: 8, end: 10 }],
      },
      {
        id: 'se2',
        name: 'BSIT 3-2',
        prof: 'Prof. L. Garcia',
        seats: 7,
        meetings: [{ day: 2, start: 13, end: 15 }],
      },
    ],
  },
  {
    id: 'tech',
    code: 'CIST_305',
    title: 'Technopreneurship',
    units: 3,
    year: 3,
    type: 'Major subject',
    color: '#9b7459',
    bg: '#f5eee9',
    prerequisite: 'None',
    sections: [
      {
        id: 'tech1',
        name: 'BSIT 3-1',
        prof: 'Prof. E. Villanueva',
        seats: 25,
        meetings: [{ day: 2, start: 9, end: 11 }],
      },
      {
        id: 'tech2',
        name: 'BSIT 3-2',
        prof: 'Prof. E. Villanueva',
        seats: 16,
        meetings: [{ day: 4, start: 8, end: 10 }],
      },
    ],
  },
  {
    id: 'ethics',
    code: 'GE_008',
    title: 'Ethics',
    units: 3,
    year: 3,
    type: 'General education',
    color: '#8c7795',
    bg: '#f2edf5',
    prerequisite: 'None',
    sections: [
      {
        id: 'ethics1',
        name: 'BSIT 3-1',
        prof: 'Prof. C. Ramos',
        seats: 22,
        meetings: [{ day: 4, start: 10, end: 12 }],
      },
      {
        id: 'ethics2',
        name: 'BSIT 3-2',
        prof: 'Prof. C. Ramos',
        seats: 12,
        meetings: [{ day: 5, start: 8, end: 10 }],
      },
    ],
  },
  {
    id: 'cap',
    code: 'CIST_401',
    title: 'Capstone Project I',
    units: 3,
    year: 4,
    type: 'Major subject',
    locked: true,
    reason: 'Pass Software Engineering first',
    sections: [],
  },
  {
    id: 'ds',
    code: 'CIST_201',
    title: 'Data Structures & Algorithms',
    units: 3,
    year: 2,
    type: 'Major subject',
    passed: true,
    reason: 'Passed in 2nd semester',
    sections: [],
  },
];
const initialPlan = [
  { course: 'im', section: 'im2' },
  { course: 'se', section: 'se1' },
  { course: 'ethics', section: 'ethics1' },
];
let stored;
try {
  stored = JSON.parse(localStorage.getItem('plm-design-plan-v1'));
} catch {}
const validStored =
  Array.isArray(stored) &&
  stored.every((x) =>
    offers
      .find((c) => c.id === x.course)
      ?.sections.some((s) => s.id === x.section),
  ) &&
  new Set(stored.map((x) => x.course)).size === stored.length &&
  stored.reduce((n, x) => n + offers.find((c) => c.id === x.course).units, 0) <=
    MAX_UNITS;
let state = {
  view: 'enrollment',
  role: 'student',
  plan: validStored ? stored : structuredClone(initialPlan),
  search: '',
  filter: 'all',
  tab: 'all',
  menu: false,
  mobile: false,
  saved: validStored,
  open: true,
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
const clockLabel = (n) =>
  `${Math.floor(n) % 12 || 12}${n % 1 ? ':30' : ''}${n >= 12 ? ' PM' : ' AM'}`;
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
    ? [
        [
          'workspace',
          state.role === 'professor' ? 'My classes' : 'Overview',
          'grid',
        ],
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
    content4: state.role.toUpperCase(),
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
  const names = {
    student: ['Andrea Dela Cruz', 'BS Information Technology', 'AD'],
    professor: ['Maria Reyes', 'Faculty workspace', 'MR'],
    admin: ['Registrar Office', 'Administration', 'RO'],
  };
  const [name, role, initials] = names[state.role];
  const labels = {
    enrollment: 'Enrollment',
    schedule: 'My schedule',
    record: 'Academic record',
    summary: 'Enrollment summary',
    workspace: state.role === 'professor' ? 'My classes' : 'Overview',
  };
  return renderTemplate('topbar', {
    mobile: state.mobile,
    icon: icon('menu'),
    icon3: icon('chevron-right'),
    content:
      state.role === 'student'
        ? 'Student portal'
        : state.role === 'professor'
          ? 'Faculty portal'
          : 'Administration',
    icon5: icon('chevron-right'),
    content6: labels[state.view],
    icon7: icon('bell'),
    menu: state.menu,
    initials: initials,
    name: name,
    role: role,
    icon12: icon('chevron-down'),
    content13: state.menu
      ? renderTemplate('topbar-2', {
          content: ['student', 'professor', 'admin']
            .map((r) =>
              renderTemplate('topbar-3', {
                content: state.role === r ? 'active' : '',
                r: r,
                content3:
                  r === 'student'
                    ? 'Student portal'
                    : r === 'professor'
                      ? 'Professor workspace'
                      : 'Admin workspace',
              }),
            )
            .join(''),
          icon: icon('arrow'),
        })
      : '',
  });
}
function footer() {
  return renderTemplate('footer');
}
function enrollment() {
  return renderTemplate('enrollment', {
    content: state.open ? 'badge-green' : 'badge-neutral',
    content2: state.open ? 'open' : 'closed',
    length: offers.length,
    icon: icon('search'),
    escapeHTML: escapeHTML(state.search),
    content6: state.filter === 'all' ? 'selected' : '',
    content7: [2, 3, 4]
      .map((y) =>
        renderTemplate('enrollment-2', {
          y: y,
          content: state.filter === String(y) ? 'selected' : '',
          content3: y === 2 ? '2nd' : y === 3 ? '3rd' : '4th',
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
          content4: c.pair ? icon('link') : '',
          type: c.type,
          content6: c.year === 2 ? '2nd' : c.year === 3 ? '3rd' : '4th',
          units: c.units,
          content8: c.pair ? '3 lec + 1 lab' : 'units',
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
                ? 'Enrollment is closed'
                : 'Choose section',
          icon19: icon(selected ? 'check' : c.locked ? 'lock' : 'plus'),
        });
      })
      .join(''),
  });
}
function planPanel() {
  const total = totalUnits();
  return renderTemplate('plan-panel', {
    icon: icon('file'),
    length: state.plan.length,
    icon3: icon('calendar'),
    total: total,
    MAX_UNITS: MAX_UNITS,
    total6: total,
    content: Array.from({ length: 18 }, (_, i) =>
      renderTemplate('plan-panel-2', { content: i < total ? 'filled' : '' }),
    ).join(''),
    icon8: icon('check'),
    content9: MAX_UNITS - total,
    content10: state.plan.length
      ? state.plan
          .map((p) => {
            const c = getCourse(p.course),
              s = getSection(p);
            return renderTemplate('plan-panel-3', {
              color: c.color,
              code: c.code,
              units: c.units,
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
                    content: c.pair ? ' and its laboratory' : '',
                    icon: icon('x'),
                  })
                : icon('lock'),
            });
          })
          .join('')
      : renderTemplate('plan-panel-7', { icon: icon('book') }),
    content11: !state.open || !state.plan.length ? 'disabled' : '',
    icon12: icon(state.saved ? 'check' : 'shield'),
    content13: !state.open
      ? 'Enrollment closed'
      : state.saved
        ? 'Plan saved'
        : 'Save my plan',
    content14: state.saved ? '' : icon('arrow'),
    icon15: icon('calendar'),
    icon16: icon(state.saved ? 'check' : 'clock'),
    content17: state.saved
      ? 'Saved on this device'
      : !state.open
        ? 'Your plan is read-only'
        : 'Changes are not saved yet',
  });
}
function openSections(id) {
  const c = getCourse(id);
  if (!state.open)
    return notify('Enrollment is closed. Your plan is read-only.', true);
  if (!c || c.locked || c.passed) return;
  const current = state.plan.find((p) => p.course === id);
  modal.innerHTML = renderTemplate('open-sections', {
    code: c.code,
    icon: icon('x'),
    id: c.id,
    title: c.title,
    units: c.units,
    content: c.pair
      ? renderTemplate('open-sections-2', {
          icon: icon('link'),
          units: c.units,
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
    content8: current
      ? 'Update section'
      : c.pair
        ? 'Add lecture + laboratory'
        : 'Add to my plan',
    icon9: icon('plus'),
  });
  modal.showModal();
}
function schedule() {
  return renderTemplate('schedule', {
    icon: icon('edit'),
    TERM: TERM,
    length: state.plan.length,
    totalUnits: totalUnits(),
    content: !state.plan.length ? renderTemplate('schedule-2') : '',
    content6: DAYS.map((d) =>
      renderTemplate('schedule-3', { content: d.toUpperCase() }),
    ).join(''),
    content7: Array.from({ length: 10 }, (_, i) =>
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
const recordRows = [
  ['CIST_201', 'Data Structures & Algorithms', 3, '1.75'],
  ['CIST_202', 'Object-Oriented Programming', 3, '1.50'],
  ['CIST_203', 'Computer Systems Organization', 3, '2.00'],
  ['GE_005', 'Purposive Communication', 3, '1.25'],
  ['GE_006', 'Science, Technology & Society', 3, '1.75'],
  ['GE_007', 'Art Appreciation', 3, '1.50'],
];
function academicRecord() {
  return renderTemplate('academic-record', {
    icon: icon('book'),
    icon2: icon('graduation'),
    icon3: icon('calendar'),
    content: recordRows
      .map(([code, title, u, grade]) =>
        renderTemplate('academic-record-2', {
          code: code,
          title: title,
          u: u,
          grade: grade,
        }),
      )
      .join(''),
  });
}
function summary() {
  return renderTemplate('summary', {
    icon: icon('book'),
    content: state.open ? 'badge-amber' : 'badge-green',
    content3: state.open ? 'Provisional plan' : 'Finalized plan',
    TERM: TERM,
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
    icon7: icon('info'),
    content8: state.open
      ? 'This plan remains editable while enrollment is open. Save your changes before leaving the portal.'
      : 'Enrollment is closed. This plan is now read-only.',
  });
}
function login() {
  return renderTemplate('login', {
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
      state.loginRole === 'student'
        ? '202410287'
        : state.loginRole === 'professor'
          ? 'mreyes'
          : 'registrar',
    icon: icon('eye'),
    content7:
      state.loginRole === 'student'
        ? 'student portal'
        : state.loginRole === 'professor'
          ? 'faculty workspace'
          : 'admin workspace',
    icon8: icon('arrow'),
    icon9: icon('arrow'),
  });
}
function mobilePlanBar() {
  return renderTemplate('mobile-plan-bar', {
    totalUnits: totalUnits(),
    MAX_UNITS: MAX_UNITS,
    length: state.plan.length,
    content: state.open ? 'Enrollment open' : 'Read-only',
    icon: icon('arrow'),
  });
}
function render() {
  const scroll = window.scrollY;
  if (state.view === 'login') {
    app.innerHTML = login();
    return;
  }
  const content =
    state.role !== 'student'
      ? renderStaffView(state.role, icon)
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
    footer: footer(),
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
function switchRole(role) {
  state.role = role;
  state.view = role === 'student' ? 'enrollment' : 'workspace';
  state.menu = false;
  state.mobile = false;
  render();
  window.scrollTo(0, 0);
}
function help() {
  modal.innerHTML = renderTemplate('help', {
    icon: icon('x'),
    content: [
      [
        '01 · Choose your subjects',
        'Browse subjects offered this semester. Eligibility tells you which subjects you can take based on the sample academic record.',
      ],
      [
        '02 · Find a section that fits',
        'Choose a schedule without overlaps. Lecture and laboratory pairs are added and removed together. Your load can reach up to 18 units in this preview.',
      ],
      [
        '03 · Save and review',
        'Save your plan, then check your weekly schedule and printable summary. You can keep editing while enrollment remains open.',
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
  const role = e.target.closest('[data-role]');
  if (role) {
    switchRole(role.dataset.role);
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
    if (!state.open) return;
    const c = getCourse(remove.dataset.remove);
    state.plan = state.plan.filter((p) => p.course !== c.id);
    state.saved = false;
    render();
    notify(
      `${c.title}${c.pair ? ' and laboratory' : ''} removed from your plan.`,
    );
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
  if (action === 'staff-period-toggle' && state.open) {
    modal.innerHTML = renderTemplate('dialogs', {
      icon: icon('x'),
      icon2: icon('info'),
      icon3: icon('lock'),
    });
    modal.showModal();
    return;
  }
  if (action.startsWith('staff-')) {
    if (action === 'staff-period-confirm') modal.close();
    const result =
      handleStaffAction(
        action === 'staff-period-confirm' ? 'staff-period-toggle' : action,
      ) || {};
    if (result.rerender) render();
    if (result.toast) notify(result.toast, result.error);
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
  if (action === 'notifications') {
    modal.innerHTML = renderTemplate('dialogs-2', {
      icon: icon('x'),
      content: state.open ? 'open' : 'closed',
      content3: state.open
        ? 'You can now build and save your enrollment plan. Review your prerequisites and unit limit as you choose subjects.'
        : 'Your enrollment plan is now read-only. Contact your adviser for assistance.',
    });
    modal.showModal();
  }
  if (action === 'save-plan') {
    if (!state.open || !state.plan.length) return;
    try {
      localStorage.setItem('plm-design-plan-v1', JSON.stringify(state.plan));
      state.saved = true;
      render();
      notify(
        'Your plan is saved. You can still edit while enrollment is open.',
      );
    } catch {
      notify(
        'This browser could not save your plan. Your changes remain in this session.',
        true,
      );
    }
  }
  if (action === 'reset-filters') {
    state.search = '';
    state.filter = 'all';
    state.tab = 'all';
    render();
  }
  if (action === 'print') window.print();
  if (action === 'preview-login') {
    state.view = 'login';
    state.loginRole = state.role;
    state.menu = false;
    render();
    window.scrollTo(0, 0);
  }
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
  if (e.target.matches('[data-staff-grade]')) {
    handleStaffAction('staff-grade-change');
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
document.addEventListener('submit', (e) => {
  if (e.target.id === 'login-form') {
    e.preventDefault();
    switchRole(state.loginRole);
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
  const next = totalUnits() - (existing ? c.units : 0) + c.units;
  if (next > MAX_UNITS) {
    error.textContent = `This would bring your plan to ${next} units. Your limit is ${MAX_UNITS}. Remove another subject first.`;
    return;
  }
  if (!s?.seats || conflictFor(s, c.id)) {
    error.textContent =
      'This section is unavailable or conflicts with your plan.';
    return;
  }
  state.plan = state.plan.filter((p) => p.course !== c.id);
  state.plan.push({ course: c.id, section: s.id });
  state.saved = false;
  modal.close();
  render();
  notify(
    `${c.title}${c.pair ? ' + laboratory' : ''} ${existing ? 'updated' : 'added'} to your plan.`,
  );
});
window.addEventListener('plm:period-change', (e) => {
  if (!e.detail.open) {
    try {
      localStorage.setItem('plm-design-plan-v1', JSON.stringify(state.plan));
      state.saved = true;
    } catch {}
  }
  state.open = e.detail.open;
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
render();
