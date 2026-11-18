# Info-Enroll

Enrollment system for the PLM BS Information Technology program. Students
enroll in subjects, professors encode grades, and the registrar (admin) runs
the enrollment periods, sections and professors.

- **Back end:** Node.js (Express) in `server/`
- **Database:** MariaDB / MySQL from XAMPP
- **Front end:** plain HTML, CSS and JavaScript in `public/`, served by the
  same server. There is no build step.

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer
- [XAMPP](https://www.apachefriends.org/) with MySQL (MariaDB) running.
  Tested on MariaDB 10.4.

## Setup

1. Start **MySQL** in the XAMPP Control Panel.
2. Install the server packages:

   ```sh
   cd server
   npm install
   ```

3. Create your settings file by copying `server/.env.example` to
   `server/.env`. The defaults match a fresh XAMPP install (user `root`, no
   password). Set `SESSION_SECRET` to any long random string.

4. Build the database and load the demo data:

   ```sh
   npm run db:reset
   ```

   This **drops and recreates every table** in the `info_enroll` database
   (creating the database if needed) from `server/database/`, then loads the demo students, professors and terms.
   Run it again any time you want to start over.

5. Start the server:

   ```sh
   npm start        # or: npm run dev   (restarts when a file changes)
   ```

6. Open <http://localhost:3000>.

> **Strict mode.** The app turns on MariaDB strict mode for its own
> connections, so it works with XAMPP's default settings. If you import the
> SQL files by hand (for example in phpMyAdmin), first add
> `STRICT_TRANS_TABLES` to `sql_mode` in XAMPP's `my.ini`. Otherwise MariaDB
> silently blanks invalid values instead of rejecting them.

## Demo accounts

Every account's password is **`password123`**.

The demo has four finished school years (2022–2023 to 2025–2026). The
**1st semester of 2026–2027** is open for enrollment.

### Students (sign in with the student number)

| Student no. | Name | What it shows |
|---|---|---|
| `202600001` | Andrea Dela Cruz | Freshman, no history yet (1st year, 23-unit cap) |
| `202500002` | Amara Sofia Reyes | Regular 2nd year, already enrolled in a few subjects this term |
| `202500003` | Joaquin Luis Santos | Irregular: failed only the CIST_102 lab, so only the lab is retaken |
| `202500004` | Mateo Gabriel Garcia | INC in PATHFIT2, which blocks PATHFIT3 |
| `202200005` | Eliana Mae Ramos | 5th year (no unit cap), failed BSIT_403 once |
| `202400007` | Paolo Miguel Villanueva | **Dropped**: failed GEC_SELF twice. Can sign in and view records, can't enroll |
| `202200006` | Rafael Andres Mendoza | Passed all 67 subjects, so can't enroll again |

### Professors (sign in with the username)

`mreyes`, `asantos`, `lgarcia`, `cramos`, `evillanueva` are active.
`jmendoza` is inactive (has taught before, so he is deactivated, not deleted).

### Admin

`registrar`

## Trying a whole semester

1. **Student** (e.g. `202500003`): add and remove subjects. Joaquin can retake
   the CIST_102 lab; it is his 2nd and last attempt.
2. **Admin:** *Overview → Close enrollment*. Empty enrollments and sections
   with no students are removed.
3. **Professor:** open *My classes*, encode grades, *Save draft*, review, and
   submit. Submitting locks the class record. A failed or INC last attempt
   drops the student.
4. **Admin:** *Grades* lists every section still missing grades (the admin
   can encode and submit them) and every INC to complete.
5. **Admin:** once every section is submitted, *Overview → Open next period*.

Run `npm run db:reset` to get the demo data back.

## Tests

```sh
cd server
npm test
```

The tests use a separate database, `info_enroll_test`, which they rebuild on
each run, so your demo data is never touched. MySQL must be running.

## Project layout

```
public/                  front end (served at http://localhost:3000)
  index.html
  css/styles.css
  js/app.js              sign-in, student pages, page shell
  js/staff.js            professor and admin workspaces
  js/api.js              calls to the server API
  pages/*.html           page markup as <template>s (see pages/README.md)
server/
  database/
    info-enroll.sql         tables, keys, checks, unit limits
    info-enroll_insert.sql  67 courses and their prerequisites
  scripts/
    db-reset.js          rebuilds the database (npm run db:reset)
    seed-demo.js         demo students, professors, terms and grades
  src/
    index.js             starts the server
    db.js                connection pool and transactions
    routes/              API endpoints: auth, student, professor, admin
    services/            the enrollment rules (see below)
  test/                  automated tests (npm test)
```

## Where the rules live

The numbered rules are written as comments next to the code that enforces
them, e.g. `// rule 23`. The main places:

| Area | Rules | File |
|---|---|---|
| Grades, pass/fail, year level, attempts, load status | 4, 23–25, 33, 39 | `server/src/services/academic.js` |
| Who can take what, and why not | 5, 6, 10, 21, 23, 26, 29, 34, 40 | `server/src/services/eligibility.js` |
| Adding and removing subjects, unit cap, conflicts, seats | 7, 8, 11, 12, 16, 17, 19, 27 | `server/src/services/enrollment.js` |
| Lec/lab links | 27, 28 | `server/src/services/pairing.js` |
| Periods, sections, professors | 2, 9, 13–15, 17, 20, 28, 35–37 | `server/src/services/admin.js` |
| Encoding, submitting and completing grades, dropping students | 30–32, 34, 40 | `server/src/services/grades.js` |
| Tables, keys and checks (e.g. one enrollment per term, one section number per course) | 8, 16, 18, 22 (no self-prerequisite), 32 | `server/database/info-enroll.sql` |

Rules the database itself guarantees (keys, unique constraints, checks) are in
the SQL files; everything else is checked in the services above, inside a
database transaction.
