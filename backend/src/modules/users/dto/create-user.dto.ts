import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { NormalizeEmail, Trim } from '../../../common/decorators/trim.decorator';

export class CreateUserDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, { message: 'phone must be 7–20 characters: digits, spaces, +, -, ( )' })
  phone?: string;

  // 72 is bcrypt's input limit; longer passwords would be silently truncated.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: 'password must contain at least one letter and one number' })
  password!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  roleId!: number;
}
