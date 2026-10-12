import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { DEMO_PASSWORDS } from '../../src/database/seeds/demo-data';
import { User } from '../../src/modules/users/entities/user.entity';

export const ADMIN = {
  email: 'admin@taskapp.dev',
  password: DEMO_PASSWORDS.admin,
};
export const PRIYA = {
  email: 'priya@taskapp.dev',
  password: DEMO_PASSWORDS.employee,
};
export const RAHUL = {
  email: 'rahul@taskapp.dev',
  password: DEMO_PASSWORDS.employee,
};

export type Agent = ReturnType<typeof request.agent>;

/** A supertest agent that keeps the session cookies, like a browser tab would. */
export async function loginAgent(
  app: INestApplication,
  credentials: { email: string; password: string },
): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/api/auth/login').send(credentials).expect(200);
  return agent;
}

export async function userIdOf(
  dataSource: DataSource,
  email: string,
): Promise<number> {
  return (await dataSource.getRepository(User).findOneByOrFail({ email })).id;
}
