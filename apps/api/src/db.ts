import 'dotenv/config';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
export const ROOT = path.resolve(here, '../../..');
