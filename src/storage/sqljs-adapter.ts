import { SqlJsDatabase } from './sqljs-database';
import type { DatabaseAdapter } from './database-adapter';

export class SqlJsAdapter implements DatabaseAdapter {
  readonly dialect = 'sqlite' as const;
  private readonly db: SqlJsDatabase;

  constructor(filePath: string) {
    this.db = new SqlJsDatabase(filePath);
  }

  async initialize(schemaStatements: string[]): Promise<void> {
    await this.db.initialize(schemaStatements);
  }

  async run(sql: string, params: Array<string | number | null> = []): Promise<void> {
    this.db.run(sql, params);
  }

  async query<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): Promise<T[]> {
    return this.db.query<T>(sql, params);
  }

  async get<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): Promise<T | undefined> {
    return this.db.get<T>(sql, params);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
