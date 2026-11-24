# PLM BSIT Student Enrollment System

**Section:** BSIT 2-4

## Members

- Abuien, Daeniel S.
- Gorres, John Sven
- Jamisola, Yohann Drake B.
- Lapaz, Prince Heaven P.
- Morden, Allesar Leomar C.
- Ong, Mark Angelo M.
- Reapor, Vincent T.

---

## Overview

The PLM BSIT Student Enrollment System is a web application for the
Pamantasan ng Lungsod ng Maynila BS Information Technology program. It
replaces manual enrollment with one system where students choose their
subjects, professors encode grades, and the registrar manages the school
term.

The system has **three roles**:

| Role | What they do |
|---|---|
| **Student** | Enlists subjects and sections, enrolls, views the schedule and academic record, and prints the enrollment summary. |
| **Professor** | Encodes grades for their own classes, saves drafts, and submits the class record. |
| **Admin (Registrar)** | Opens and closes enrollment periods, manages sections, completes INC grades, and manages student and professor accounts. |

The system enforces the enrollment rules for the student: unit limits per
year level and semester, prerequisites, a lab needing its lecture, section
seat limits, schedule conflicts, and a maximum of two attempts per subject.
Grades are 1.00 to 3.00 in steps of 0.25 (passed), 5.00 (failed), or INC
(incomplete).

**Built with:** Node.js and Express (back end), MariaDB/MySQL from XAMPP
(database), and plain HTML, CSS and JavaScript (front end).

## Required software

- [Node.js](https://nodejs.org/) version 20 or newer
- [XAMPP](https://www.apachefriends.org/) with MySQL (MariaDB) running.
  Tested on MariaDB 10.4.
- A web browser such as Chrome, Edge or Firefox

## How to install

1. Open the **XAMPP Control Panel** and start **MySQL**.
2. Open a terminal in the project's `server` folder and install the packages:

   ```sh
   cd server
   npm install
   ```

3. Copy `server/.env.example` to `server/.env`. The defaults match a fresh
   XAMPP install (user `root`, empty password). Change `SESSION_SECRET` to
   any long random text.
4. Build the database and load the demo data:

   ```sh
   npm run db:reset
   ```

   This drops and recreates the `info_enroll` database, so run it again any
   time you want to start over with fresh demo data.
5. Start the server:

   ```sh
   npm start
   ```

   (`npm run dev` does the same but restarts when a file changes.)
6. Open **http://localhost:3000** in your browser.

If the page loads but sign-in fails, MySQL is not running. Start it in XAMPP
and try again.

## Demo accounts and password

On the sign-in page, choose your role (**Student**, **Professor** or
**Admin**), then type the username and password.

**The password for every demo account is `password123`.**

### Admin

| Username | Name |
|---|---|
| `registrar` | Registrar Office |

### Professors

| Username | Name |
|---|---|
| `mreyes` | Maria Reyes |
| `asantos` | Antonio Santos |
| `lgarcia` | Lourdes Garcia |
| `cramos` | Carlos Ramos |
| `evillanueva` | Elena Villanueva |

`jmendoza` (Jose Mendoza) is a deactivated professor and cannot sign in.

### Students (sign in with the student number)

| Student no. | Name | What it shows |
|---|---|---|
| `202600001` | Andrea Dela Cruz | Freshman with no history. Best for a clean enrollment. |
| `202500002` | Amara Sofia Reyes | Regular 2nd year, already enrolled in a few subjects. |
| `202500003` | Joaquin Luis Santos | Irregular. Failed only the CIST_102 lab, so only the lab is retaken. |
| `202500004` | Mateo Gabriel Garcia | Has an INC in PATHFIT2, which blocks PATHFIT3. |
| `202200005` | Eliana Mae Ramos | 5th year, no unit cap. Failed BSIT_403 once. |
| `202400007` | Paolo Miguel Villanueva | Dropped after failing a subject twice. Can view records but cannot enroll. |
| `202200006` | Rafael Andres Mendoza | Passed all 67 subjects, so cannot enroll again. |

The demo has four finished school years (2022-2023 to 2025-2026). The
**1st semester of 2026-2027** is open for enrollment.

---

## Database design (ERD)

The database `info_enroll` has 10 tables. The entity relationship diagram
is stored in the project folder at `docs/ERD.png`.

![Entity relationship diagram of the PLM BSIT Student Enrollment System](docs/ERD.png)

| Table | Purpose |
|---|---|
| `student` | Student accounts: number, name, entrance date, password and status (active or dropped). |
| `professor` | Professor accounts, with an active flag. |
| `admin` | Registrar accounts. |
| `course` | The 67 BSIT subjects: code, title, units, year level, semester and required standing. |
| `prerequisite` | Course requirements. PRE means it must be passed first. CO links a lab to its lecture. |
| `unit_limit` | The minimum and maximum units for each year level and semester. |
| `enrollment_period` | One row per school year and semester, either OPEN or CLOSED. |
| `section` | A class of one course in one period: section number, day, time, professor and the 50-seat limit. |
| `enrollment` | A student's enrollment for one period, with their year level and total units. |
| `enrolled_course` | The subjects inside an enrollment, one row per section, with the grade. |

**How the tables connect**
- A `student` has many `enrollment` rows, one for each period.
- An `enrollment` belongs to one `enrollment_period` and one `unit_limit`.
- An `enrollment` has many `enrolled_course` rows, and each points to one
  `section`.
- A `section` belongs to one `course`, one `enrollment_period` and one
  `professor`, and records the admin who submitted the grades.
- `prerequisite` links a `course` to the courses it requires.

Passed or failed, the weighted average, the year level and the seats left
are calculated from these tables, not stored. The database also has 8 SQL
views that the system reads for its lists.

---

## How to use every feature, per role

After signing in, the sidebar on the left shows the pages for your role.
Use **Sign out** at the bottom of the sidebar to leave.

### 1. Student

Sidebar pages: **Enrollment**, **My schedule**, **Academic record**,
**Enrollment summary**.

**Enrollment**
1. Open **Enrollment**. The list shows the subjects of the open semester.
   Use the tabs **All subjects**, **Eligible for you** and **Selected** to
   filter it.
2. Each subject shows its status. A blocked subject lists the reasons, for
   example a prerequisite not yet passed, a missing year standing, or no
   section offered this term.
3. Click the add button on an eligible subject, then click **Choose
   section**. The dialog lists the sections with their day, time and seats
   left. Full sections and sections that clash with your other subjects
   cannot be picked.
4. A subject with a lab needs its lecture. The lab can be in a different
   section from the lecture.
5. To change a section, click **Change section** on the subject. To drop a
   subject, click **Remove subject**.
6. The **Your enrollment plan** panel shows your selected subjects, total
   units and your unit limit. The system stops you if you go over the limit.
7. When your plan is ready, click **Enroll**, then confirm **Enroll in
   these subjects?**. The subjects become final. Only the admin can reopen
   an enrollment.
8. Subjects you enlisted but did not enroll are removed when the admin closes
   the period.

**My schedule**
- Shows your weekly timetable for the subjects you picked. Use **Edit my
  plan** to go back to Enrollment.

**Academic record**
- Shows every subject you have taken, term by term, with your grades and your
  weighted average. Grades appear only after the professor submits the class.

**Enrollment summary**
- Shows your printable enrollment record. Click **Print / Save PDF** to print
  it or save it as a PDF.

A dropped student or a student who has passed every subject can sign in and
view records but cannot open a new enrollment.

### 2. Professor

Sidebar page: **My classes**.

1. Open **My classes**. Each card is one of your sections, with its subject
   code, name, schedule and student count.
2. Click a section to open its class list.
3. Choose a grade for each student: 1.00 to 3.00 in steps of 0.25, 5.00, or
   INC.
4. Click **Save draft** to keep your grades without publishing them.
   Students cannot see draft grades.
5. Click **Review** to check the grades, then **Back to editing** to change
   them or **Submit & lock grades** to finish.
6. Submitting locks the class record. Later corrections go through the
   admin. A student whose last attempt at a subject is failed or INC, on
   their second attempt, is dropped when you submit.

### 3. Admin (Registrar)

Sidebar pages: **Overview**, **Sections**, **Grades**, **Students**,
**Professors**.

**Overview**
- Shows the current enrollment period and a history of every term.
- Click **Close enrollment** to end the open period. Students who did not
  click Enroll lose their enlisted subjects, and sections with no students
  are removed.
- Click **Open next period** to start the next semester. It is allowed only
  when every section has submitted its grades. The new period is created
  with default sections, days, times and professors, which you can change.

**Sections**
- Lists every section of the open period with its professor, schedule,
  seats and grading progress.
- Click **New section** to add one. Choose the course, section number,
  professor, day and time. A subject with a lab gets its lecture and lab
  together.
- Click **Delete** on a section to remove it while the period is open. Its
  students go back to enlisted and must enroll again.

**Grades**
- **Sections waiting for submission** lists classes whose professor has not
  submitted. Click **Encode grades** to enter and submit the grades for the
  professor, using **Save draft** and **Submit & lock grades**.
- **INC waiting to be completed** lists incomplete grades. Click
  **Complete** and replace the INC with a grade from 1.00 to 3.00, or 5.00.

**Students**
- Lists every student account with status and year level.
- Click **Add student** and enter the first, middle (optional) and last name,
  the entrance date and a temporary password. The student number is
  generated automatically.
- Click **Reopen** on a student to let them change an enrollment they already
  confirmed. They must click Enroll again.

**Professors**
- Lists professor accounts with their teaching load.
- Click **Add professor** and enter the name, username and a temporary
  password.
- Use **Deactivate** or **Activate** to turn an account off or on. A
  professor with no past sections can be deleted.

## Trying a whole semester

1. **Student** (for example `202500003`): add subjects, choose sections, and
   click **Enroll**.
2. **Admin:** **Overview**, then **Close enrollment**.
3. **Professor:** **My classes**, encode the grades, **Save draft**, review,
   and **Submit & lock grades**.
4. **Admin:** **Grades**, to encode any missing sections and complete any
   INC.
5. **Admin:** **Overview**, then **Open next period**.

Run `npm run db:reset` to restore the demo data at any time.
