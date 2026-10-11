import { config } from 'dotenv';
import { resolve } from 'node:path';

// .env.test is a local copy of .env.test.example (never committed).
config({ path: resolve(__dirname, '..', '.env.test'), quiet: true });
