import { pool } from "@workspace/db";

/**
 * Minimal interface covering the pg.PoolClient methods we need.
 * Using a structural interface avoids importing from `pg` directly
 * (which is a transitive dep of @workspace/db, not a direct dep here).
 */
interface PgPoolClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
  release(err?: Error | boolean): void;
}

/**
 * PostgreSQL session-level advisory locks, correctly using a single dedicated
 * pool connection for the entire lock lifetime.
 *
 * Session-level advisory locks are bound to the PostgreSQL connection, not the
 * transaction. Using db.execute() against a Pool would dispatch acquire and
 * release on different connections, making deduplication unreliable.
 *
 * This module checks out a dedicated PoolClient, acquires the lock on it, holds
 * that client for the full job duration, then releases the lock AND the client
 * together. No other request can reuse the same connection while it is held, so
 * re-entrancy is not a concern.
 *
 * Usage (synchronous / awaited work):
 *   const lock = await AdvisoryLock.tryAcquire("ksef_sync", userId);
 *   if (!lock) { res.status(409)...; return; }
 *   try { await doWork(); } finally { await lock.release(); }
 *
 * Usage (fire-and-forget async work):
 *   const lock = await AdvisoryLock.tryAcquire("insights_generate", userId);
 *   if (!lock) { res.status(202).json({ status: "running" }); return; }
 *   res.status(202).json({ status: "started" });
 *   doWork().finally(() => lock.release());
 */
export class AdvisoryLock {
  private constructor(
    private readonly client: PgPoolClient,
    private readonly namespace: string,
    private readonly key: string,
  ) {}

  /**
   * Try to acquire a database advisory lock.
   * Returns an AdvisoryLock handle if successful, or null if already locked.
   * The caller MUST call release() on the returned handle when done.
   */
  static async tryAcquire(
    namespace: string,
    key: string,
  ): Promise<AdvisoryLock | null> {
    const client = (await pool.connect()) as unknown as PgPoolClient;
    try {
      const result = await client.query(
        "SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired",
        [namespace, key],
      );
      const row = result.rows[0] as { acquired: boolean } | undefined;
      const acquired = row?.acquired === true;
      if (!acquired) {
        client.release();
        return null;
      }
      return new AdvisoryLock(client, namespace, key);
    } catch (err) {
      client.release();
      throw err;
    }
  }

  /**
   * Release the advisory lock and return the connection to the pool.
   */
  async release(): Promise<void> {
    try {
      await this.client.query(
        "SELECT pg_advisory_unlock(hashtext($1), hashtext($2))",
        [this.namespace, this.key],
      );
    } finally {
      this.client.release();
    }
  }
}
