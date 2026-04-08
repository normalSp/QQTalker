import mysql, { type Pool } from 'mysql2/promise';
import type { DatabaseAdapter } from './database-adapter';

export class MySqlAdapter implements DatabaseAdapter {
  readonly dialect = 'mysql' as const;
  private pool: Pool;

  constructor(connectionUri: string) {
    if (!connectionUri) {
      throw new Error('SELF_LEARNING_MYSQL_URL 未配置');
    }
    this.pool = mysql.createPool({
      uri: connectionUri,
      connectionLimit: 10,
      waitForConnections: true,
    });
  }

  async initialize(schemaStatements: string[]): Promise<void> {
    for (const statement of schemaStatements) {
      await this.pool.query(statement);
    }
  }

  async run(sql: string, params: Array<string | number | null> = []): Promise<void> {
    await this.pool.query(sql, params);
  }

  async query<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): Promise<T[]> {
    const [rows] = await this.pool.query(sql, params);
    return rows as T[];
  }

  async get<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
