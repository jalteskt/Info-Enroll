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

// XAMPP's my.ini may disable strict mode, which makes MariaDB blank out bad
// ENUM values instead of rejecting them. Force strict mode per connection.
// READ COMMITTED: after a transaction waits for a row lock, its next reads
// see what the other transaction committed (e.g. the seat it just took).
// The default REPEATABLE READ would keep reading an older snapshot.
pool.on('connection', (conn) => {
  conn.query(`
    SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION'
  `);
  conn.query(`
    SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED
  `);
});

// Runs fn(conn) inside one transaction. Commits if fn resolves, rolls back
// if it throws. Every write that touches more than one row goes through here.
// If MariaDB picks this transaction as a deadlock victim (two students taking
// the last seats at once), the whole function is retried a few times.
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
