-- ============================================================
-- NOTE: this drops and recreates the plm_bsit_enrollment database.
-- Turn on strict mode in my.ini first (sql_mode must include
-- STRICT_TRANS_TABLES) or invalid ENUM values are silently blanked.
-- ============================================================
DROP DATABASE IF EXISTS info_enroll;


CREATE DATABASE info_enroll CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;


USE info_enroll;


-- ------------------------------------------------------------
-- 1. STUDENT
-- ------------------------------------------------------------
CREATE TABLE student (
  student_no VARCHAR(20) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  middle_name VARCHAR(50) NULL,
  entrance_date DATE NULL COMMENT 'record only',
  password VARCHAR(255) NOT NULL COMMENT 'store a hash, not plain text',
  PRIMARY KEY (student_no)
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 2. ADMIN
-- ------------------------------------------------------------
CREATE TABLE admin (
  admin_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL COMMENT 'store a hash, not plain text',
  last_name VARCHAR(50) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  PRIMARY KEY (admin_id),
  UNIQUE KEY uq_admin_username (username)
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 3. PROFESSOR
-- ------------------------------------------------------------
CREATE TABLE professor (
  professor_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  password VARCHAR(255) NOT NULL COMMENT 'store a hash, not plain text',
  last_name VARCHAR(50) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (professor_id),
  UNIQUE KEY uq_professor_username (username),
  CONSTRAINT chk_professor_active CHECK (is_active IN (0, 1))
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 4. COURSE
-- ------------------------------------------------------------
CREATE TABLE course (
  course_code VARCHAR(20) NOT NULL,
  course_title VARCHAR(150) NOT NULL,
  units TINYINT UNSIGNED NOT NULL,
  year_level TINYINT UNSIGNED NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  required_standing TINYINT UNSIGNED NULL COMMENT 'minimum year standing 1-4, NULL if none',
  PRIMARY KEY (course_code),
  CONSTRAINT chk_course_units CHECK (units > 0),
  CONSTRAINT chk_course_year CHECK (year_level BETWEEN 1 AND 4),
  CONSTRAINT chk_course_semester CHECK (semester IN (1, 2)),
  CONSTRAINT chk_course_standing CHECK (
    required_standing IS NULL
    OR required_standing BETWEEN 1 AND 4
  )
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 8. ENROLLMENT_PERIOD
-- ------------------------------------------------------------
CREATE TABLE enrollment_period (
  school_year VARCHAR(9) NOT NULL COMMENT 'e.g. 2026-2027',
  semester TINYINT UNSIGNED NOT NULL COMMENT '1 or 2 (no summer term)',
  status ENUM('OPEN', 'CLOSED') NOT NULL DEFAULT 'CLOSED',
  PRIMARY KEY (school_year, semester),
  CONSTRAINT chk_period_semester CHECK (semester IN (1, 2))
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 5. SECTION
-- ------------------------------------------------------------
CREATE TABLE section (
  section_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_no TINYINT UNSIGNED NOT NULL,
  day ENUM(
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat'
  ) NOT NULL,
  time_start TIME NOT NULL,
  time_end TIME NOT NULL,
  max_students TINYINT UNSIGNED NOT NULL DEFAULT 50,
  grades_submitted_at DATETIME NULL,
  course_code VARCHAR(20) NOT NULL,
  school_year VARCHAR(9) NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  professor_id INT UNSIGNED NOT NULL,
  submitted_by_admin_id INT UNSIGNED NULL,
  PRIMARY KEY (section_id),
  UNIQUE KEY uq_section_offering (
    course_code,
    school_year,
    semester,
    section_no
  ),
  UNIQUE KEY uq_section_id_course (section_id, course_code),
  CONSTRAINT chk_section_no CHECK (section_no > 0),
  CONSTRAINT chk_section_time CHECK (time_end > time_start),
  CONSTRAINT chk_section_max CHECK (max_students = 50),
  CONSTRAINT chk_section_submit CHECK (
    submitted_by_admin_id IS NULL
    OR grades_submitted_at IS NOT NULL
  ),
  CONSTRAINT fk_section_course FOREIGN KEY (course_code) REFERENCES course (course_code),
  CONSTRAINT fk_section_period FOREIGN KEY (school_year, semester) REFERENCES enrollment_period (school_year, semester),
  CONSTRAINT fk_section_professor FOREIGN KEY (professor_id) REFERENCES professor (professor_id),
  CONSTRAINT fk_section_admin FOREIGN KEY (submitted_by_admin_id) REFERENCES admin (admin_id)
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 6. PREREQUISITE
-- ------------------------------------------------------------
CREATE TABLE prerequisite (
  course_code VARCHAR(20) NOT NULL,
  required_course_code VARCHAR(20) NOT NULL,
  requisite_type ENUM('PRE', 'CO') NOT NULL,
  PRIMARY KEY (course_code, required_course_code),
  CONSTRAINT chk_prereq_not_self CHECK (course_code <> required_course_code),
  CONSTRAINT fk_prereq_course FOREIGN KEY (course_code) REFERENCES course (course_code),
  CONSTRAINT fk_prereq_required FOREIGN KEY (required_course_code) REFERENCES course (course_code)
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 7. UNIT_LIMIT
-- ------------------------------------------------------------
CREATE TABLE unit_limit (
  year_level TINYINT UNSIGNED NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  min_units TINYINT UNSIGNED NOT NULL DEFAULT 0,
  max_units TINYINT UNSIGNED NULL COMMENT 'NULL = no limit',
  PRIMARY KEY (year_level, semester),
  CONSTRAINT chk_limit_year CHECK (year_level BETWEEN 1 AND 6),
  CONSTRAINT chk_limit_semester CHECK (semester IN (1, 2)),
  CONSTRAINT chk_limit_range CHECK (
    max_units IS NULL
    OR min_units <= max_units
  )
) ENGINE = InnoDB;


INSERT INTO
  unit_limit (
    year_level,
    semester,
    min_units,
    max_units
  )
VALUES
  (1, 1, 0, 23),
  (1, 2, 0, 23),
  (2, 1, 0, 23),
  (2, 2, 0, 23),
  (3, 1, 0, 18),
  (3, 2, 0, 18),
  (4, 1, 0, 8),
  (4, 2, 0, 7),
  (5, 1, 0, NULL),
  (5, 2, 0, NULL),
  (6, 1, 0, NULL),
  (6, 2, 0, NULL);


-- ------------------------------------------------------------
-- 9. ENROLLMENT
-- ------------------------------------------------------------
CREATE TABLE enrollment (
  enrollment_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  year_level TINYINT UNSIGNED NOT NULL,
  date_enrolled DATE NOT NULL,
  total_units SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  student_no VARCHAR(20) NOT NULL,
  school_year VARCHAR(9) NOT NULL,
  semester TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (enrollment_id),
  UNIQUE KEY uq_enrollment_term (student_no, school_year, semester),
  CONSTRAINT chk_enrollment_year CHECK (year_level BETWEEN 1 AND 6),
  CONSTRAINT fk_enrollment_student FOREIGN KEY (student_no) REFERENCES student (student_no),
  CONSTRAINT fk_enrollment_period FOREIGN KEY (school_year, semester) REFERENCES enrollment_period (school_year, semester),
  CONSTRAINT fk_enrollment_unit_limit FOREIGN KEY (year_level, semester) REFERENCES unit_limit (year_level, semester)
) ENGINE = InnoDB;


-- ------------------------------------------------------------
-- 10. ENROLLED_COURSE
-- ------------------------------------------------------------
CREATE TABLE enrolled_course (
  enrollment_id INT UNSIGNED NOT NULL,
  section_id INT UNSIGNED NOT NULL,
  grade ENUM(
    '1.00',
    '1.25',
    '1.50',
    '1.75',
    '2.00',
    '2.25',
    '2.50',
    '2.75',
    '3.00',
    '3.25',
    '3.50',
    '3.75',
    '4.00',
    '4.25',
    '4.50',
    '4.75',
    '5.00',
    'INC'
  ) NULL,
  course_code VARCHAR(20) NOT NULL,
  PRIMARY KEY (enrollment_id, section_id),
  UNIQUE KEY uq_ec_enrollment_course (enrollment_id, course_code),
  CONSTRAINT fk_ec_enrollment FOREIGN KEY (enrollment_id) REFERENCES enrollment (enrollment_id) ON DELETE CASCADE,
  CONSTRAINT fk_ec_section FOREIGN KEY (section_id, course_code) REFERENCES section (section_id, course_code)
) ENGINE = InnoDB;
