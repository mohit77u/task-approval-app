import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  NormalizeEmail,
  Trim,
} from '../../../common/decorators/trim.decorator';

export class UpdateUserDto {
  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  // `null` clears the phone; `IsOptional` skips the checks for null and undefined.
  @IsOptional()
  @Trim()
  @IsString()
  @Matches(/^\+?[0-9 ()-]{7,20}$/, {
    message: 'phone must be 7–20 characters: digits, spaces, +, -, ( )',
  })
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password?: string;
}
