import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Role } from './entities/role.entity';
import { Task } from '../tasks/entities/task.entity';
import { User } from './entities/user.entity';
import { SecurityModule } from '../security/security.module';
import { RolesController } from './controllers/roles.controller';
import { UsersController } from './controllers/users.controller';
import { UsersService } from './services/users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Role, Task, RefreshToken]),
    SecurityModule,
  ],
  controllers: [UsersController, RolesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
