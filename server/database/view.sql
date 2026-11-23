USE info_enroll;

-- Sections: each section with its course, schedule, professor, student
-- count and seats left. Used by section lists, grade sheets and the
-- Student enrollment page.
CREATE OR REPLACE VIEW vwSectionDetails AS
SELECT
    s.section_id
  , s.section_no
  , CONCAT('BSIT ', c.year_level, '-', s.section_no) AS section_name
  , s.course_code
  , c.course_title
  , c.units
  , c.year_level
  , s.day
  , TIME_FORMAT(s.time_start, '%H:%i')               AS time_start
  , TIME_FORMAT(s.time_end, '%H:%i')                 AS time_end
  , s.school_year
  , s.semester
  , p.status                                         AS period_status
  , s.grades_submitted_at
  , s.submitted_by_admin_id
  , s.professor_id
  , CONCAT(pr.first_name, ' ', pr.last_name)         AS professor
  , s.max_students
  , (
      SELECT COUNT(*)
      FROM enrolled_course ec
      WHERE ec.section_id = s.section_id
    ) AS students
  , (
      SELECT COUNT(*)
      FROM enrolled_course ec
      JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
      WHERE ec.section_id = s.section_id
        AND e.date_enrolled IS NOT NULL
    ) AS enrolled_students
  , (
      SELECT COUNT(*)
      FROM enrolled_course ec
      WHERE ec.section_id = s.section_id
        AND ec.grade IS NOT NULL
    ) AS graded
  , s.max_students - (
      SELECT COUNT(*)
      FROM enrolled_course ec
      WHERE ec.section_id = s.section_id
    ) AS slots_left
FROM section s
JOIN course c ON c.course_code = s.course_code
JOIN enrollment_period p ON p.school_year = s.school_year
  AND p.semester = s.semester
JOIN professor pr ON pr.professor_id = s.professor_id;

-- Student subjects: each subject a student took, per term, with the
-- professor's saved grade, the final grade (only after submission)
-- and a status: PENDING, PASSED, FAILED or INC. Used by the class list.
CREATE OR REPLACE VIEW vwStudentSubjects AS
SELECT
    e.enrollment_id
  , e.student_no
  , st.last_name
  , st.first_name
  , st.middle_name
  , CONCAT(st.last_name, ', ', CONCAT_WS(' ', st.first_name, st.middle_name)) AS student_name
  , e.school_year
  , e.semester
  , p.status                                 AS period_status
  , e.year_level
  , e.date_enrolled
  , ec.section_id
  , s.section_no
  , ec.course_code
  , c.course_title
  , c.units
  , s.day
  , TIME_FORMAT(s.time_start, '%H:%i')       AS time_start
  , TIME_FORMAT(s.time_end, '%H:%i')         AS time_end
  , s.professor_id
  , CONCAT(pr.first_name, ' ', pr.last_name) AS professor
  , ec.grade
  , s.grades_submitted_at
  , CASE
      WHEN s.grades_submitted_at IS NOT NULL THEN CAST(ec.grade AS CHAR)
    END AS final_grade
  , CASE
      WHEN s.grades_submitted_at IS NULL OR ec.grade IS NULL THEN 'PENDING'
      WHEN ec.grade = 'INC' THEN 'INC'
      WHEN ec.grade IN ('1.00', '1.25', '1.50', '1.75', '2.00',
                        '2.25', '2.50', '2.75', '3.00') THEN 'PASSED'
      ELSE 'FAILED'
    END AS grade_status
FROM enrolled_course ec
JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
JOIN student st ON st.student_no = e.student_no
JOIN enrollment_period p ON p.school_year = e.school_year
  AND p.semester = e.semester
JOIN section s ON s.section_id = ec.section_id
JOIN course c ON c.course_code = ec.course_code
JOIN professor pr ON pr.professor_id = s.professor_id;

-- Enrolled list: students who clicked Enroll in a term (enlisted-only
-- students are left out). Used by the Overview enrolled count.
CREATE OR REPLACE VIEW vwEnrolledList AS
SELECT
    e.enrollment_id
  , e.student_no
  , CONCAT(st.last_name, ', ', CONCAT_WS(' ', st.first_name, st.middle_name)) AS student_name
  , st.status      AS student_status
  , e.school_year
  , e.semester
  , p.status       AS period_status
  , e.year_level
  , e.total_units
  , (
      SELECT COUNT(*)
      FROM enrolled_course ec
      WHERE ec.enrollment_id = e.enrollment_id
    ) AS subjects
  , e.date_enrolled
FROM enrollment e
JOIN student st ON st.student_no = e.student_no
JOIN enrollment_period p ON p.school_year = e.school_year
  AND p.semester = e.semester
WHERE e.date_enrolled IS NOT NULL;

-- Review queue: items that need staff action: sections with missing
-- grades, incomplete (INC) grades, and reopened enrollments.
-- The INC rows feed the Admin incomplete grades list.
CREATE OR REPLACE VIEW vwReviewQueue AS
SELECT
    'MISSING_GRADES'                         AS item_type
  , s.school_year
  , s.semester
  , s.section_id
  , s.course_code
  , c.course_title
  , s.professor_id
  , CONCAT(pr.first_name, ' ', pr.last_name) AS professor
  , NULL                                     AS student_no
  , NULL                                     AS student_name
  , 'Grades not submitted'                   AS detail
FROM section s
JOIN enrollment_period p ON p.school_year = s.school_year
  AND p.semester = s.semester
JOIN course c ON c.course_code = s.course_code
JOIN professor pr ON pr.professor_id = s.professor_id
WHERE p.status = 'CLOSED'
  AND s.grades_submitted_at IS NULL

UNION ALL

SELECT
    'INC'
  , s.school_year
  , s.semester
  , s.section_id
  , s.course_code
  , c.course_title
  , s.professor_id
  , CONCAT(pr.first_name, ' ', pr.last_name)
  , e.student_no
  , CONCAT(st.last_name, ', ', st.first_name)
  , 'Incomplete grade'
FROM enrolled_course ec
JOIN enrollment e ON e.enrollment_id = ec.enrollment_id
JOIN student st ON st.student_no = e.student_no
JOIN section s ON s.section_id = ec.section_id
JOIN course c ON c.course_code = s.course_code
JOIN professor pr ON pr.professor_id = s.professor_id
WHERE ec.grade = 'INC'
  AND s.grades_submitted_at IS NOT NULL

UNION ALL

SELECT
    'REOPENED'
  , e.school_year
  , e.semester
  , CAST(NULL AS UNSIGNED)
  , NULL
  , NULL
  , CAST(NULL AS UNSIGNED)
  , NULL
  , e.student_no
  , CONCAT(st.last_name, ', ', st.first_name)
  , e.reopen_note
FROM enrollment e
JOIN student st ON st.student_no = e.student_no
JOIN enrollment_period p ON p.school_year = e.school_year
  AND p.semester = e.semester
WHERE p.status = 'OPEN'
  AND e.date_enrolled IS NULL
  AND e.reopen_note IS NOT NULL;

-- Period summary: each period with its section, missing-grade and
-- enrollment counts. Used by the Admin Overview periods table.
CREATE OR REPLACE VIEW vwPeriodSummary AS
SELECT
    p.school_year
  , p.semester
  , p.status
  , (
      SELECT COUNT(*)
      FROM section s
      WHERE s.school_year = p.school_year
        AND s.semester = p.semester
    ) AS sections
  , (
      SELECT COUNT(*)
      FROM section s
      WHERE s.school_year = p.school_year
        AND s.semester = p.semester
        AND s.grades_submitted_at IS NULL
    ) AS sections_without_grades
  , (
      SELECT COUNT(*)
      FROM enrollment e
      WHERE e.school_year = p.school_year
        AND e.semester = p.semester
    ) AS enrollments
FROM enrollment_period p;

-- Professor load: each professor with how many sections they have had
-- and have now. The password is left out. Used by the Admin
-- Professors page.
CREATE OR REPLACE VIEW vwProfessorLoad AS
SELECT
    p.professor_id
  , p.username
  , p.first_name
  , p.last_name
  , CONCAT(p.first_name, ' ', p.last_name) AS professor_name
  , p.is_active
  , (
      SELECT COUNT(*)
      FROM section s
      WHERE s.professor_id = p.professor_id
    ) AS sections_ever
  , (
      SELECT COUNT(*)
      FROM section s
      JOIN enrollment_period ep ON ep.school_year = s.school_year
        AND ep.semester = s.semester
      WHERE s.professor_id = p.professor_id
        AND ep.status = 'OPEN'
    ) AS sections_open
FROM professor p;

-- Prerequisite list: each requirement with both course titles.
-- Used to decide which subjects a student may enroll in.
CREATE OR REPLACE VIEW vwPrerequisiteList AS
SELECT
    pr.course_code
  , c.course_title
  , pr.required_course_code AS required_code
  , rc.course_title         AS required_title
  , pr.requisite_type
FROM prerequisite pr
JOIN course c ON c.course_code = pr.course_code
JOIN course rc ON rc.course_code = pr.required_course_code;

-- Student list: every student with their state this term (ENROLLED,
-- ENLISTED or none) and year level. The password is left out.
-- Used by the Admin Students page.
CREATE OR REPLACE VIEW vwStudentList AS
SELECT
    s.student_no
  , s.first_name
  , s.middle_name
  , s.last_name
  , CONCAT(s.last_name, ', ', CONCAT_WS(' ', s.first_name, s.middle_name)) AS student_name
  , DATE_FORMAT(s.entrance_date, '%Y-%m-%d')                               AS entrance_date
  , s.status
  , CASE
      WHEN cur.date_enrolled IS NOT NULL THEN 'ENROLLED'
      WHEN EXISTS (
        SELECT 1
        FROM enrolled_course ec
        WHERE ec.enrollment_id = cur.enrollment_id
      ) THEN 'ENLISTED'
    END AS term_state
  , (
      SELECT COUNT(DISTINCT e.school_year)
      FROM enrollment e
      JOIN enrollment_period ep ON ep.school_year = e.school_year
        AND ep.semester = e.semester
      WHERE e.student_no = s.student_no
        AND ep.status = 'CLOSED'
        AND e.school_year < COALESCE((
          SELECT cp.school_year
          FROM enrollment_period cp
          ORDER BY
              cp.status = 'OPEN' DESC
            , cp.school_year DESC
            , cp.semester DESC
          LIMIT 1
        ), '9999')
        AND EXISTS (
          SELECT 1
          FROM enrolled_course ec
          WHERE ec.enrollment_id = e.enrollment_id
        )
    ) + 1 AS year_level
FROM student s
LEFT JOIN enrollment_period op ON op.status = 'OPEN'
LEFT JOIN enrollment cur ON cur.student_no = s.student_no
  AND cur.school_year = op.school_year
  AND cur.semester = op.semester;
