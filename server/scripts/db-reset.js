// Drops and rebuilds a database from the SQL files, then loads the demo data.
//   npm run db:reset              -> rebuilds DB_NAME from .env (info_enroll)
// The tests call resetDatabase('info_enroll_test') so they never touch dev data.
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mysql from 'mysql2/promise';
import { seedDemo, DEMO_PASSWORD } from './seed-demo.js';
import { checkPrerequisiteLoops } from '../src/services/academic.js';

const dbDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../database');
const files = ['info-enroll.sql', 'info-enroll_insert.sql', 'view.sql'];

export async function resetDatabase(dbName = process.env.DB_NAME || 'info_enroll', { log = () => {} } = {}) {
  if (!/^\w+$/.test(dbName)) throw new Error(`Bad database name: ${dbName}`);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });
  try {
    for (const file of files) {
      log(`Running ${file} ...`);
      const sql = await fs.readFile(path.join(dbDir, file), 'utf8');
      // The SQL files name the database info_enroll; point them at dbName.
      await conn.query(sql.replace(/\binfo_enroll\b/g, dbName));
    }
    await conn.query(`USE \`${dbName}\``);
    await conn.query(`
      SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'
    `);
    // Rule 22: refuse prerequisite data with a loop (the database only blocks
    // a subject requiring itself).
    const loops = await checkPrerequisiteLoops(conn);
    if (loops.length) throw new Error(`Prerequisite data has loops, fix info-enroll_insert.sql:\n  ${loops.join('\n  ')}`);
    log('Seeding demo data ...');
    await conn.beginTransaction();
    try {
      await seedDemo(conn);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }
    const [[counts]] = await conn.query(`
      SELECT
          (
            SELECT COUNT(*)
            FROM course
          ) AS courses
        , (
            SELECT COUNT(*)
            FROM prerequisite
            WHERE requisite_type = 'PRE'
          ) AS pre
        , (
            SELECT COUNT(*)
            FROM prerequisite
            WHERE requisite_type = 'CO'
          ) AS co
        , (
            SELECT COUNT(*)
            FROM student
          ) AS students
        , (
            SELECT COUNT(*)
            FROM professor
          ) AS professors
        , (
            SELECT COUNT(*)
            FROM enrollment_period
          ) AS periods
        , (
            SELECT COUNT(*)
            FROM section
          ) AS sections
        , (
            SELECT COUNT(*)
            FROM enrollment
          ) AS enrollments
        , (
            SELECT COUNT(*)
            FROM enrolled_course
          ) AS enrolled_courses
    `);
    return counts;
  } finally {
    await conn.end();
  }
}

// Run from the command line.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const counts = await resetDatabase(undefined, { log: console.log });
    console.log('Loaded:', counts);
    console.log(`Demo password for every account: ${DEMO_PASSWORD}`);
  } catch (err) {
    console.error(`Failed: ${err.message}`);
    process.exitCode = 1;
  }
}
