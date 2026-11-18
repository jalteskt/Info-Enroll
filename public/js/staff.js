const gradeOptions = [
  ...Array.from(
    {
      length: 17,
    },
    (_, i) => (1 + i * 0.25).toFixed(2),
  ),
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
  `<span class="badge badge-${color}">${text}</span>`;
const stat = (label, value, note) => /* HTML */ `<div class="stat-card"
    ><div class="stat-label">${label}</div><div class="stat-value">${value}</div
    ><div class="muted">${note}</div></div
  >`;

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
  return /* HTML */ `<div class="stats-grid">
      ${stat('Assigned sections', '03', '1st semester · AY 2026–2027')}
      ${stat('Students enrolled', '15', 'Across your assigned sections')}
      ${stat('Awaiting submission', String(pending).padStart(2, '0'), pending ? 'Review grades before submitting' : 'All sections are complete')}
    </div>
    <div class="section-label">YOUR TEACHING LOAD</div>
    <div class="stats-grid teaching-load-grid"
      >${sections
        .map(
          (section, i) => /* HTML */ `<button
              type="button"
              class="stat-card"
              data-action="staff-section-${i}"
              aria-pressed="${selectedSection === i}"
            >
              <div class="toolbar"
                ><span class="eyebrow">${section.code}</span
                >${section.submitted ? badge('Submitted', 'green') : badge('In progress', 'amber')}</div
              >
              <h3 class="panel-title">${section.title}</h3
              ><p class="muted"
                >${section.name} · ${section.grades.length} students</p
              ><p class="muted">${section.schedule}</p>
              <span class="button-quiet"
                >${selectedSection === i ? 'Currently viewing' : 'View class list'}
                ${icon('arrow-right')}</span
              >
            </button>`,
        )
        .join('')}</div
    >
    <section class="panel">
      <div class="panel-header"
        ><div
          ><p class="eyebrow">${current.code} / ${current.name}</p
          ><h2 class="panel-title"
            >${current.submitted ? 'Submitted class record' : reviewing ? 'Review your grades' : 'Class record'}</h2
          ><p class="muted"
            >${current.grades.length} students · ${current.schedule}</p
          ></div
        >${current.submitted ? badge('Grades locked', 'green') : badge(reviewing ? 'Ready for submission' : 'Draft grades', 'amber')}</div
      >
      ${reviewing ? '<p class="page-description">Check each grade carefully. Submitting locks this class record; later corrections go through the administrator.</p>' : ''}
      <div class="table-wrap"
        ><table class="data-table"
          ><thead
            ><tr
              ><th scope="col">Student number</th
              ><th scope="col">Student name</th><th scope="col">Final grade</th
              ><th scope="col">Standing</th></tr
            ></thead
          ><tbody>
            ${current.grades
              .map(
                (grade, i) => /* HTML */ `<tr
                    ><td>${roster[i][0]}</td><td>${roster[i][1]}</td
                    ><td
                      >${
                        current.submitted || reviewing
                          ? /* HTML */ `<strong>${grade}</strong>`
                          : /* HTML */ `<select
                              class="input"
                              data-staff-grade="${i}"
                              aria-label="Final grade for ${roster[i][1]}"
                              ><option value="">Select grade</option
                              >${gradeOptions.map((value) => `<option value="${value}"${grade === value ? ' selected' : ''}>${value}</option>`).join('')}</select
                            >`
                      }</td
                    ><td
                      >${grade ? (grade === 'INC' ? badge('Incomplete', 'amber') : Number(grade) <= 3 ? badge('Passed', 'green') : badge('Failed', 'amber')) : badge('Awaiting grade')}</td
                    ></tr
                  >`,
              )
              .join('')}
          </tbody></table
        ></div
      >
      <div class="panel-header"
        ><p class="muted"
          >${current.submitted ? 'This class record is locked. Contact the administrator for a correction.' : 'Grades are saved in this preview while you move between sections.'}</p
        ><div class="toolbar"
          >${
            current.submitted
              ? ''
              : reviewing
                ? '<button type="button" class="button" data-action="staff-edit">Back to editing</button><button type="button" class="button button-primary" data-action="staff-submit">Submit & lock grades</button>'
                : /* HTML */ `<button
                    type="button"
                    class="button button-primary"
                    data-action="staff-review"
                    >Review grades ${icon('arrow-right')}</button
                  >`
          }</div
        ></div
      >
    </section>`;
}

function adminView(icon) {
  return /* HTML */ `<div class="stats-grid"
      >${stat('Active offerings', '06', 'BS Information Technology')}${stat('Available seats', '243', 'Across this term’s sections')}${stat('Enrollment period', periodOpen ? 'Open' : 'Closed', '1st semester · AY 2026–2027')}</div
    >
    <section class="panel admin-period-panel"
      ><div class="panel-header"
        ><div
          ><p class="eyebrow">ACADEMIC CALENDAR</p
          ><h2 class="panel-title">1st semester, AY 2026–2027</h2
          ><p class="muted"
            >${periodOpen ? 'Students can choose and update their subjects.' : 'Student subject selections are finalized and read-only.'}</p
          ></div
        >${badge(periodOpen ? 'Enrollment open' : 'Enrollment closed', periodOpen ? 'green' : 'neutral')}</div
      >
      <div class="panel-header"
        ><p class="page-description"
          >${periodOpen ? 'Closing enrollment makes student selections read-only. Review the term before proceeding.' : 'Reopen this preview period to continue exploring subject selection.'}</p
        ><button
          type="button"
          class="button ${periodOpen ? '' : 'button-primary'}"
          data-action="staff-period-toggle"
          >${icon(periodOpen ? 'lock' : 'calendar')}
          ${periodOpen ? 'Close enrollment' : 'Reopen preview period'}</button
        ></div
      >
    </section>
    <section class="panel"
      ><div class="panel-header"
        ><div
          ><p class="eyebrow">COURSE OFFERINGS</p
          ><h2 class="panel-title">Ready for the semester</h2
          ><p class="muted"
            >Section schedules, teaching assignments, and available seats.</p
          ></div
        >${badge('6 active sections', 'green')}</div
      >
      <div class="table-wrap"
        ><table class="data-table"
          ><thead
            ><tr
              ><th scope="col">Course</th><th scope="col">Section</th
              ><th scope="col">Schedule</th><th scope="col">Professor</th
              ><th scope="col">Seats available</th></tr
            ></thead
          ><tbody>
            ${[
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
              .map(
                (row) => /* HTML */ `<tr
                    ><td
                      ><strong>${row[0]}</strong
                      ><div class="muted">${row[1]}</div></td
                    ><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td
                    ><td
                      >${badge(`${row[5]} of 50`, row[5] < 20 ? 'amber' : 'green')}</td
                    ></tr
                  >`,
              )
              .join('')}
          </tbody></table
        ></div
      > </section
    ><p class="muted"
      >Design preview · The students, grades, and academic records shown here
      are sample data.</p
    >`;
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
      return {
        rerender: true,
      };
    }
  }
  if (action === 'staff-period-toggle') {
    periodOpen = !periodOpen;
    if (typeof window !== 'undefined')
      window.dispatchEvent(
        new CustomEvent('plm:period-change', {
          detail: {
            open: periodOpen,
          },
        }),
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
    return {
      rerender: true,
    };
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
      return {
        rerender: true,
      };
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
