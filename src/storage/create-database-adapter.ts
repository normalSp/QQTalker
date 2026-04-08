import path from 'path';
import { config } from '../types/config';
import type { DatabaseAdapter } from './database-adapter';
import { MySqlAdapter } from './mysql-adapter';
import { PostgresAdapter } from './postgres-adapter';
import { SqlJsAdapter } from './sqljs-adapter';

export function createDatabaseAdapter(): DatabaseAdapter {
  switch (config.selfLearning.dbType) {
    case 'mysql':
      return new MySqlAdapter(config.selfLearning.mysqlUrl);
    case 'postgres':
      return new PostgresAdapter(config.selfLearning.postgresUrl);
    case 'sqlite':
    default:
      return new SqlJsAdapter(path.resolve(process.cwd(), config.selfLearning.dbFile));
  }
}
