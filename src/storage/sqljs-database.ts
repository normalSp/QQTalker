import fs from 'fs';
import path from 'path';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { logger } from '../logger';

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) => {
        try {
          return require.resolve(`sql.js/dist/${file}`);
        } catch {
          return path.resolve(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
        }
      },
    });
  }
  return sqlJsPromise;
}

export class SqlJsDatabase {
  private db: Database | null = null;

  constructor(private readonly filePath: string) {}

  async initialize(schemaStatements: string[]): Promise<void> {
    const SQL = await getSqlJs();
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });

    if (fs.existsSync(this.filePath)) {
      const fileBuffer = fs.readFileSync(this.filePath);
      this.db = new SQL.Database(new Uint8Array(fileBuffer));
    } else {
      this.db = new SQL.Database();
    }

    for (const statement of schemaStatements) {
      this.db.run(statement);
    }
    this.persist();
    logger.info(`[SqlJsDatabase] 数据库已就绪: ${this.filePath}`);
  }

  run(sql: string, params: Array<string | number | null> = []): void {
    this.ensureDb().run(sql, params);
    this.persist();
  }

  exec(sql: string): void {
    this.ensureDb().exec(sql);
    this.persist();
  }

  query<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): T[] {
    const stmt = this.ensureDb().prepare(sql, params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  get<T extends Record<string, any>>(sql: string, params: Array<string | number | null> = []): T | undefined {
    return this.query<T>(sql, params)[0];
  }

  close(): void {
    if (!this.db) return;
    this.persist();
    this.db.close();
    this.db = null;
  }

  private persist(): void {
    if (!this.db) return;
    const data = this.db.export();
    fs.writeFileSync(this.filePath, Buffer.from(data));
  }

  private ensureDb(): Database {
    if (!this.db) {
      throw new Error('SqlJsDatabase is not initialized');
    }
    return this.db;
  }
}
