import { renderTemplate } from './templates.js';
const gradeOptions = [
  ...Array.from({ length: 17 }, (_, i) => (1 + i * 0.25).toFixed(2)),
  'INC',
];
const people = [
  ['2024-01482', 'Reyes, Amara Sofia'],
  ['2024-01836', 'Santos, Joaquin Luis'],
  ['2024-01027', 'Dela Cruz, Isabelle'],
  ['2024-02154', 'Garcia, Mateo Gabriel'],
  ['2024-01609', 'Ramos, Eliana Mae'],
  ['2024-01973', 'Mendoza, Rafael Andres'],
];
const sections = [
  {
    code: 'CIST_201',
    title: 'Data Structures & Algorithms',
    name: 'BSIT 2-1',
    schedule: 'Wed · 1:00–4:00 PM',
    grades: ['1.75', '2.00', '1.50', '2.25', '', ''],
    submitted: false,
  },
  {
    code: 'CIST_301',
    title: 'Information Management',
    name: 'BSIT 3-2',
    schedule: 'Mon · 10:00 AM–12:00 PM',
    grades: ['1.50', '1.75', '2.00', '', ''],
    submitted: false,
  },
  {
    code: 'CIST_101',
    title: 'Introduction to Computing',
    name: 'BSIT 1-1',
    schedule: 'Fri · 9:00 AM–12:00 PM',
    grades: ['1.50', '2.00', '1.75', '2.25'],
    submitted: true,
  },
];
let selectedSection = 0;
let reviewing = false;
let periodOpen = true;
const badge = (text, color = 'neutral') =>
  renderTemplate('badge', { color: color, text: text });
const stat = (label, value, note) =>
  renderTemplate('stat', { label: label, value: value, note: note });

export function renderStaffView(role, icon) {
  return role === 'professor' ? professorView(icon) : adminView(icon);
}

function professorView(icon) {
  const current = sections[selectedSection];
  const roster =
    current.code === 'CIST_301'
      ? people.map((person, i) =>
          i === 2 ? ['2024-10287', 'Dela Cruz, Andrea'] : person,
        )
      : people;
  const pending = sections.filter((section) => !section.submitted).length;
  return renderTemplate('professor-view', {
    stat: stat('Assigned sections', '03', '1st semester · AY 2026–2027'),
    stat2: stat('Students enrolled', '15', 'Across your assigned sections'),
    stat3: stat(
      'Awaiting submission',
      String(pending).padStart(2, '0'),
      pending ? 'Review grades before submitting' : 'All sections are complete',
    ),
    content: sections
      .map((section, i) =>
        renderTemplate('professor-view-2', {
          i: i,
          content: selectedSection === i,
          code: section.code,
          content4: section.submitted
            ? badge('Submitted', 'green')
            : badge('In progress', 'amber'),
          title: section.title,
          name: section.name,
          length: section.grades.length,
          schedule: section.schedule,
          content9:
            selectedSection === i ? 'Currently viewing' : 'View class list',
          icon: icon('arrow-right'),
        }),
      )
      .join(''),
    code: current.code,
    name: current.name,
    content7: current.submitted
      ? 'Submitted class record'
      : reviewing
        ? 'Review your grades'
        : 'Class record',
    length: current.grades.length,
    schedule: current.schedule,
    content10: current.submitted
      ? badge('Grades locked', 'green')
      : badge(reviewing ? 'Ready for submission' : 'Draft grades', 'amber'),
    content11: reviewing ? renderTemplate('professor-view-3') : '',
    content12: current.grades
      .map((grade, i) =>
        renderTemplate('professor-view-4', {
          content: roster[i][0],
          content2: roster[i][1],
          content3:
            current.submitted || reviewing
              ? renderTemplate('professor-view-5', { grade: grade })
              : renderTemplate('professor-view-6', {
                  i: i,
                  content: roster[i][1],
                  content3: gradeOptions
                    .map((value) =>
                      renderTemplate('professor-view-7', {
                        value: value,
                        content: grade === value ? ' selected' : '',
                        value3: value,
                      }),
                    )
                    .join(''),
                }),
          content4: grade
            ? grade === 'INC'
              ? badge('Incomplete', 'amber')
              : Number(grade) <= 3
                ? badge('Passed', 'green')
                : badge('Failed', 'amber')
            : badge('Awaiting grade'),
        }),
      )
      .join(''),
    content13: current.submitted
      ? 'This class record is locked. Contact the administrator for a correction.'
      : 'Grades are saved in this preview while you move between sections.',
    content14: current.submitted
      ? ''
      : reviewing
        ? renderTemplate('professor-view-8')
        : renderTemplate('professor-view-9', { icon: icon('arrow-right') }),
  });
}

function adminView(icon) {
  return renderTemplate('admin-view', {
    stat: stat('Active offerings', '06', 'BS Information Technology'),
    stat2: stat('Available seats', '243', 'Across this term’s sections'),
    stat3: stat(
      'Enrollment period',
      periodOpen ? 'Open' : 'Closed',
      '1st semester · AY 2026–2027',
    ),
    content: periodOpen
      ? 'Students can choose and update their subjects.'
      : 'Student subject selections are finalized and read-only.',
    badge: badge(
      periodOpen ? 'Enrollment open' : 'Enrollment closed',
      periodOpen ? 'green' : 'neutral',
    ),
    content6: periodOpen
      ? 'Closing enrollment makes student selections read-only. Review the term before proceeding.'
      : 'Reopen this preview period to continue exploring subject selection.',
    content7: periodOpen ? '' : 'button-primary',
    icon: icon(periodOpen ? 'lock' : 'calendar'),
    content9: periodOpen ? 'Close enrollment' : 'Reopen preview period',
    badge10: badge('6 active sections', 'green'),
    content11: [
      [
        'CIST_101',
        'Introduction to Computing',
        'BSIT 1-1',
        'Fri · 9:00 AM–12:00 PM',
        'Prof. M. Reyes',
        46,
      ],
      [
        'CIST_201',
        'Data Structures & Algorithms',
        'BSIT 2-1',
        'Wed · 1:00–4:00 PM',
        'Prof. M. Reyes',
        44,
      ],
      [
        'CIST_201.1',
        'Data Structures Laboratory',
        'BSIT 2-1',
        'Tue · 8:00–11:00 AM',
        'Prof. Marco Bautista',
        44,
      ],
      [
        'CIST_301',
        'Information Management',
        'BSIT 3-2',
        'Mon · 10:00 AM–12:00 PM',
        'Prof. M. Reyes',
        45,
      ],
      [
        'CIST_301.1',
        'Information Management Laboratory',
        'BSIT 3-2',
        'Thu · 1:00–4:00 PM',
        'Prof. Celina Torres',
        45,
      ],
      [
        'MATH_201',
        'Discrete Mathematics',
        'BSIT 2-1',
        'Sat · 9:00 AM–12:00 PM',
        'Prof. Paolo Navarro',
        19,
      ],
    ]
      .map((row) =>
        renderTemplate('admin-view-2', {
          content: row[0],
          content2: row[1],
          content3: row[2],
          content4: row[3],
          content5: row[4],
          badge: badge(`${row[5]} of 50`, row[5] < 20 ? 'amber' : 'green'),
        }),
      )
      .join(''),
  });
}

function captureGrades() {
  if (typeof document === 'undefined' || sections[selectedSection].submitted)
    return;
  document.querySelectorAll('[data-staff-grade]').forEach((select) => {
    const index = Number(select.dataset.staffGrade);
    if (
      Number.isInteger(index) &&
      index >= 0 &&
      index < sections[selectedSection].grades.length
    )
      sections[selectedSection].grades[index] = select.value;
  });
}

export function handleStaffAction(action) {
  captureGrades();
  if (/^staff-section-\d+$/.test(action)) {
    const index = Number(action.split('-').pop());
    if (sections[index]) {
      selectedSection = index;
      reviewing = false;
      return { rerender: true };
    }
  }
  if (action === 'staff-period-toggle') {
    periodOpen = !periodOpen;
    if (typeof window !== 'undefined')
      window.dispatchEvent(
        new CustomEvent('plm:period-change', { detail: { open: periodOpen } }),
      );
    return {
      rerender: true,
      toast: periodOpen
        ? 'Preview enrollment period reopened.'
        : 'Enrollment closed. Student selections are now read-only.',
    };
  }
  const current = sections[selectedSection];
  if (action === 'staff-edit') {
    reviewing = false;
    return { rerender: true };
  }
  if (action === 'staff-review' || action === 'staff-submit') {
    if (current.submitted)
      return {
        toast: 'These grades have already been submitted.',
        error: true,
      };
    if (current.grades.some((grade) => !gradeOptions.includes(grade)))
      return {
        toast: 'Enter a valid grade for every student before continuing.',
        error: true,
      };
    if (action === 'staff-review') {
      reviewing = true;
      return { rerender: true };
    }
    if (!reviewing)
      return {
        toast: 'Review the class record before submitting.',
        error: true,
      };
    current.submitted = true;
    reviewing = false;
    return {
      rerender: true,
      toast: 'Grades submitted. This class record is now locked.',
    };
  }
  return {};
}
