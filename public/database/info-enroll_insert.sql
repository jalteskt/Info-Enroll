-- ============================================================
-- PLM BSIT Enrollment System - course and prerequisite data
-- Source: BSIT Curriculum Checklist A.Y. 2025-2026
-- 67 courses. NSTP_001 and NSTP_002 are left out. Electives
-- stay as Elective 1 to 4.
-- required_standing: 1-4 from the checklist's "nTH YEAR STANDING"
-- entries, NULL if none.
-- ============================================================

USE info_enroll;

-- ------------------------------------------------------------
-- COURSE
-- (course_code, course_title, units, year_level, semester, required_standing)
-- ------------------------------------------------------------
INSERT INTO course (course_code, course_title, units, year_level, semester, required_standing) VALUES
-- First Year, First Semester (10 courses, 23 units)
('CIST_101',   'Introduction to Computing (lec)',                                          2, 1, 1, NULL),
('CIST_101.1', 'Introduction to Computing (lab)',                                          1, 1, 1, NULL),
('CIST_102',   'Fundamentals of Programming (lec)',                                        2, 1, 1, NULL),
('CIST_102.1', 'Fundamentals of Programming (lab)',                                        1, 1, 1, NULL),
('GEC_ARTA',   'Art Appreciation',                                                         3, 1, 1, NULL),
('GEC_MATH',   'Mathematics in the Modern World',                                          3, 1, 1, NULL),
('GEC_PCOM',   'Purposive Communications',                                                 3, 1, 1, NULL),
('GEC_STAS',   'Science, Technology and Society',                                          3, 1, 1, NULL),
('PLM_IR01',   'Interdisiplinaryong Pagbasa at Pagsulat Tungo sa Mabisang Pagpapahayag',   3, 1, 1, NULL),
('PATHFIT1',   'Physical Activities Towards Health and Fitness 1',                         2, 1, 1, NULL),

-- First Year, Second Semester (11 courses, 23 units)
('BSIT_111',   'Discrete Mathematics',                                                     3, 1, 2, 1),
('BSIT_112',   'Human Computer Interaction (lec)',                                         2, 1, 2, NULL),
('BSIT_112.1', 'Human Computer Interaction (lab)',                                         1, 1, 2, NULL),
('CIST_103',   'Intermediate Programming (lec)',                                           2, 1, 2, NULL),
('CIST_103.1', 'Intermediate Programming (lab)',                                           1, 1, 2, NULL),
('CIST_104',   'Data Structures and Algorithm (lec)',                                      2, 1, 2, NULL),
('CIST_104.1', 'Data Structures and Algorithm (lab)',                                      1, 1, 2, NULL),
('GEC_SELF',   'Understanding the Self',                                                   3, 1, 2, NULL),
('GEE_4MST',   'Living in the IT Era',                                                     3, 1, 2, NULL),
('GEE_4SSP',   'The Entrepreneurial Mind',                                                 3, 1, 2, NULL),
('PATHFIT2',   'Physical Activities Towards Health and Fitness 2',                         2, 1, 2, NULL),

-- Second Year, First Semester (11 courses, 23 units)
('BSIT_201',   'Web Systems and Technology (lec)',                                         2, 2, 1, NULL),
('BSIT_201.1', 'Web Systems and Technology (lab)',                                         1, 2, 1, NULL),
('BSIT_202',   'Object Oriented Programming (lec)',                                        2, 2, 1, NULL),
('BSIT_202.1', 'Object Oriented Programming (lab)',                                        1, 2, 1, NULL),
('CIST_201',   'Information Management (lec)',                                             2, 2, 1, NULL),
('CIST_201.1', 'Information Management (lab)',                                             1, 2, 1, NULL),
('GEC_ETHC',   'Ethics',                                                                   3, 2, 1, NULL),
('GEC_HIST',   'Readings in Philippine History',                                           3, 2, 1, NULL),
('GEC_WORL',   'The Contemporary World',                                                   3, 2, 1, NULL),
('GEE_1MST',   'Environmental Science',                                                    3, 2, 1, NULL),
('PATHFIT3',   'Physical Activities Towards Health and Fitness 3',                         2, 2, 1, NULL),

-- Second Year, Second Semester (11 courses, 23 units)
('BSIT_203',   'Database Management (lec)',                                               2, 2, 2, NULL),
('BSIT_203.1', 'Database Management (lab)',                                                1, 2, 2, NULL),
('BSIT_204',   'Fundamentals of Networking (lec)',                                         2, 2, 2, NULL),
('BSIT_204.1', 'Fundamentals of Networking (lab)',                                         1, 2, 2, NULL),
('BSIT_205',   'Quantitative Methods',                                                     3, 2, 2, NULL),
('BSIT_206',   'Platform Technologies',                                                    3, 2, 2, 2),
('BSIT_207',   'Event Driven Programming (lec)',                                           2, 2, 2, NULL),
('BSIT_207.1', 'Event Driven Programming (lab)',                                           1, 2, 2, NULL),
('BSIT_E01',   'Elective 1',                                                               3, 2, 2, 2),
('GEC_RZAL',   'Rizal''s Life and Works',                                                  3, 2, 2, NULL),
('PATHFIT4',   'Physical Activities Towards Health and Fitness 4',                         2, 2, 2, NULL),

-- Third Year, First Semester (10 courses, 18 units)
('BSIT_301',   'Information Assurance and Security 1 (lec)',                               2, 3, 1, NULL),
('BSIT_301.1', 'Information Assurance and Security 1 (lab)',                               1, 3, 1, NULL),
('BSIT_302',   'Advanced Networking (lec)',                                                2, 3, 1, NULL),
('BSIT_302.1', 'Advanced Networking (lab)',                                                1, 3, 1, NULL),
('BSIT_303',   'System Integration and Architecture 1 (lec)',                              2, 3, 1, NULL),
('BSIT_303.1', 'System Integration and Architecture 1 (lab)',                              1, 3, 1, NULL),
('BSIT_E02',   'Elective 2',                                                               3, 3, 1, 3),
('BSIT_E03',   'Elective 3',                                                               3, 3, 1, 3),
('CIST_301',   'Applications Development and Emerging Technologies (lec)',                 2, 3, 1, 3),
('CIST_301.1', 'Applications Development and Emerging Technologies (lab)',                 1, 3, 1, NULL),

-- Third Year, Second Semester (9 courses, 18 units)
('BSIT_304',   'Capstone Project 1',                                                       3, 3, 2, 3),
('BSIT_305',   'Integrative Programming and Technologies (lec)',                           2, 3, 2, NULL),
('BSIT_305.1', 'Integrative Programming and Technologies (lab)',                           1, 3, 2, NULL),
('BSIT_306',   'Social and Professional Issues',                                           3, 3, 2, 3),
('BSIT_307',   'Information Assurance and Security 2 (lec)',                               2, 3, 2, NULL),
('BSIT_307.1', 'Information Assurance and Security 2 (lab)',                               1, 3, 2, NULL),
('BSIT_308',   'System Integration and Architecture 2 (lec)',                              2, 3, 2, NULL),
('BSIT_308.1', 'System Integration and Architecture 2 (lab)',                              1, 3, 2, NULL),
('BSIT_E04',   'Elective 4',                                                               3, 3, 2, 3),

-- Fourth Year, First Semester (3 courses, 8 units)
('BSIT_401',   'Capstone Project 2',                                                       3, 4, 1, NULL),
('BSIT_402',   'Practicum (Lecture)',                                                      2, 4, 1, 4),
('BSIT_403',   'System Administration and Maintenance',                                    3, 4, 1, 4),

-- Fourth Year, Second Semester (2 courses, 7 units)
('BSIT_404',   'Practicum Industry Immersion (486 hours)',                                 4, 4, 2, NULL),
('BSIT_405',   'Capstone Project 3',                                                       3, 4, 2, NULL);

-- ------------------------------------------------------------
-- PREREQUISITE
-- (course_code, required_course_code, requisite_type)
-- PRE = must already be passed.
-- Requirements are copied as written in the checklist, for the lec
-- and the lab separately (rule 29: a student must meet both).
-- ------------------------------------------------------------
INSERT INTO prerequisite (course_code, required_course_code, requisite_type) VALUES
-- First Year, Second Semester
('CIST_103',   'CIST_102',   'PRE'),
('CIST_103',   'CIST_102.1', 'PRE'),
('CIST_103.1', 'CIST_102',   'PRE'),
('CIST_103.1', 'CIST_102.1', 'PRE'),
('CIST_104',   'CIST_102',   'PRE'),
('CIST_104',   'CIST_102.1', 'PRE'),
('CIST_104.1', 'CIST_102',   'PRE'),
('CIST_104.1', 'CIST_102.1', 'PRE'),
('PATHFIT2',   'PATHFIT1',   'PRE'),

-- Second Year, First Semester
('BSIT_201',   'CIST_101.1', 'PRE'),
('BSIT_201.1', 'CIST_101.1', 'PRE'),
('BSIT_202',   'CIST_103',   'PRE'),
('BSIT_202',   'CIST_104',   'PRE'),
('BSIT_202.1', 'CIST_103',   'PRE'),
('BSIT_202.1', 'CIST_104',   'PRE'),
('CIST_201',   'CIST_104',   'PRE'),
('CIST_201',   'CIST_104.1', 'PRE'),
('CIST_201.1', 'CIST_104',   'PRE'),
('CIST_201.1', 'CIST_104.1', 'PRE'),
('PATHFIT3',   'PATHFIT2',   'PRE'),

-- Second Year, Second Semester
('BSIT_203',   'CIST_201',   'PRE'),
('BSIT_203',   'CIST_201.1', 'PRE'),
('BSIT_203.1', 'CIST_201',   'PRE'),
('BSIT_203.1', 'CIST_201.1', 'PRE'),
('BSIT_205',   'BSIT_111',   'PRE'),
('BSIT_207',   'BSIT_202',   'PRE'),
('BSIT_207',   'BSIT_202.1', 'PRE'),
('BSIT_207.1', 'BSIT_202',   'PRE'),
('BSIT_207.1', 'BSIT_202.1', 'PRE'),
('PATHFIT4',   'PATHFIT3',   'PRE'),

-- Third Year, First Semester
('BSIT_301',   'BSIT_206',   'PRE'),
('BSIT_301.1', 'BSIT_206',   'PRE'),
('BSIT_302',   'BSIT_204',   'PRE'),
('BSIT_302.1', 'BSIT_204',   'PRE'),
('BSIT_303',   'BSIT_202',   'PRE'),
('BSIT_303',   'BSIT_203',   'PRE'),
('BSIT_303',   'BSIT_204',   'PRE'),
('BSIT_303.1', 'BSIT_202',   'PRE'),
('BSIT_303.1', 'BSIT_203',   'PRE'),
('BSIT_303.1', 'BSIT_204',   'PRE'),
('CIST_301.1', 'BSIT_207',   'PRE'),
('CIST_301.1', 'BSIT_203',   'PRE'),

-- Third Year, Second Semester
('BSIT_305',   'CIST_301',   'PRE'),
('BSIT_305',   'BSIT_203',   'PRE'),
('BSIT_305.1', 'CIST_301',   'PRE'),
('BSIT_305.1', 'BSIT_203',   'PRE'),
('BSIT_307',   'BSIT_301',   'PRE'),
('BSIT_307.1', 'BSIT_301',   'PRE'),
('BSIT_308',   'BSIT_303',   'PRE'),
('BSIT_308.1', 'BSIT_303',   'PRE'),

-- Fourth Year
('BSIT_401',   'BSIT_304',   'PRE'),
('BSIT_404',   'BSIT_402',   'PRE'),
('BSIT_405',   'BSIT_401',   'PRE');

-- ------------------------------------------------------------
-- PREREQUISITE - co-requisites, exactly as written in the checklist
-- The checklist puts the co-requisite in parentheses on the LAB row
-- only, so each row below is (lab, its lec, 'CO'). 10 rows.
--
-- These labs show NO co-requisite on the checklist, so they get no
-- CO row: CIST_101.1, CIST_102.1, BSIT_203.1, BSIT_204.1,
-- BSIT_207.1, BSIT_301.1, BSIT_307.1, CIST_301.1.
-- Those labs are still taken together with their lec (same code
-- plus ".1"); the app must pair them by that code convention, since
-- the CO rows do not cover them.
-- ------------------------------------------------------------
INSERT INTO prerequisite (course_code, required_course_code, requisite_type) VALUES
('BSIT_112.1', 'BSIT_112', 'CO'),
('CIST_103.1', 'CIST_103', 'CO'),
('CIST_104.1', 'CIST_104', 'CO'),
('BSIT_201.1', 'BSIT_201', 'CO'),
('BSIT_202.1', 'BSIT_202', 'CO'),
('CIST_201.1', 'CIST_201', 'CO'),
('BSIT_302.1', 'BSIT_302', 'CO'),
('BSIT_303.1', 'BSIT_303', 'CO'),
('BSIT_305.1', 'BSIT_305', 'CO'),
('BSIT_308.1', 'BSIT_308', 'CO');

-- ------------------------------------------------------------
-- Quick checks (should return 67, 23, and 10)
-- ------------------------------------------------------------
-- SELECT COUNT(*) FROM course;
-- SELECT SUM(units) FROM course WHERE year_level = 1 AND semester = 1;   -- 23
-- SELECT COUNT(*) FROM prerequisite WHERE requisite_type = 'CO';          -- 10
