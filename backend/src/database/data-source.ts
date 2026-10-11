import 'reflect-metadata';
import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './typeorm.options';

loadDotenv({ quiet: true });

/** Entry point for the TypeORM CLI (migrations) and the seed script. Not imported by the running app. */
export default new DataSource(buildDataSourceOptions(validateEnv(process.env)));
