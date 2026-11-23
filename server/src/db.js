import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'info_enroll',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,
});

// Force strict mode per connection: XAMPP's default may blank out bad ENUM values.
// READ COMMITTED lets a transaction see rows another one just committed after a
// lock wait (e.g. the seat it just took).
pool.on('connection', (conn) => {
  conn.query(`
    SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'
  `);
  conn.query(`
    SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED
  `);
});

// Runs fn(conn) in one transaction: commits if it resolves, rolls back if it
// throws. If MariaDB picks it as a deadlock victim, it is retried a few times.
export async function withTransaction(fn, attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      const retryable = err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT';
      if (!retryable || attempt >= attempts) throw err;
    } finally {
      conn.release();
    }
  }
}
