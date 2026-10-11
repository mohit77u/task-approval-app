import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../../database/entities';
import { SecurityModule } from '../security/security.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), SecurityModule],
  controllers: [AuthController],
  providers: [AuthService, RefreshTokenService],
})
export class AuthModule {}
