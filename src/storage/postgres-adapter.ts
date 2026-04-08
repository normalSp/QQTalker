import { Pool } from 'pg';
import type { DatabaseAdapter } from './database-adapter';

function convertPlaceholders(sql: string): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    index += 1;
    return `$${index}`;
  });
}

export class PostgresAdapter implements DatabaseAdapter {
  readonly dialect = 'postgres' as const;
  private readonly pool: Pool;

  constructor(connectionUri: string) {
    if (!connectionUri) {
      throw new Error('SELF_LEARNING_POSTGRES_URL 未配置');
    }
    this.pool = new Pool({
      connectionString: connectionUri,
      max: 10,
    });
  }

  async initialize(schemaStatements: string[]): Promise<void> {
    for (const statement of schemaStatements) {
      await this.pool.query(statement);
    }
  }

  async run(sql: string, params: Array<string | number | null> = []): Promise<void> {
    await this.pool.query(convertPlaceholders(sql), params);
  }

  async query<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): Promise<T[]> {
    const result = await this.pool.query(convertPlaceholders(sql), params);
    return result.rows as T[];
  }

  async get<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): Promise<T | undefined> {
    const rows = await this.query<T>(sql, params);
    return rows[0];
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
