import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { SecurityModule } from '../../security/security.module';
import { AuthController } from './controllers/auth.controller';
import { AuthService } from './services/auth.service';
import { RefreshTokenService } from './services/refresh-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), SecurityModule],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenService],
})
export class AuthModule {}
