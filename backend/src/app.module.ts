import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { forceUtcSession } from './database/utc-session';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { Env, validateEnv } from './config/env.validation';
import { buildDataSourceOptions } from './database/typeorm.options';
import { AuthModule } from './modules/auth/auth.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { HealthModule } from './modules/health/health.module';
import { CommentsModule } from './modules/comments/comments.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { UsersModule } from './modules/users/users.module';
import { SecurityModule } from './modules/security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      dataSourceFactory: async (options) => {
        if (!options) throw new Error('Missing TypeORM options');
        const dataSource = await new DataSource(options).initialize();
        await forceUtcSession(dataSource);
        return dataSource;
      },
      useFactory: (config: ConfigService<Env, true>) =>
        buildDataSourceOptions({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_USER: config.get('DB_USER', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_SSL: config.get('DB_SSL', { infer: true }),
          DB_SSL_CA: config.get('DB_SSL_CA', { infer: true }),
        }),
    }),
    SecurityModule,
    AuthModule,
    UsersModule,
    TasksModule,
    CommentsModule,
    DashboardModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
