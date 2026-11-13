import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Product, Warehouse, Stock, Movement } from './entities';
import { InitialSchema1794560000000 } from './migrations/1794560000000-InitialSchema';

export function databaseOptions(url = process.env.DATABASE_URL) {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL');
  }
  return {
    type: 'postgres' as const,
    url,
    entities: [Product, Warehouse, Stock, Movement],
    migrations: [InitialSchema1794560000000],
    synchronize: false,
    installExtensions: false,
    extra: { max: 20 },
  };
}

export default new DataSource(databaseOptions());
