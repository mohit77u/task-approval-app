import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { NormalizeEmail } from '../../../common/decorators/trim.decorator';

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // Upper bound only: complexity rules apply when a password is created, not when it is checked.
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
