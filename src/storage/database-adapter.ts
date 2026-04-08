export type SupportedDatabaseDialect = 'sqlite' | 'mysql' | 'postgres';

export interface DatabaseAdapter {
  readonly dialect: SupportedDatabaseDialect;
  initialize(schemaStatements: string[]): Promise<void>;
  run(sql: string, params?: Array<string | number | null>): Promise<void>;
  query<T extends Record<string, any>>(sql: string, params?: Array<string | number | null>): Promise<T[]>;
  get<T extends Record<string, any>>(sql: string, params?: Array<string | number | null>): Promise<T | undefined>;
  close(): Promise<void>;
}
