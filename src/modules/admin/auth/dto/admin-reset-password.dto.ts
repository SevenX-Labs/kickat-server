import { IsNotEmpty, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class AdminResetPasswordDto {
  @IsUUID('4', { message: 'resetToken must be a valid UUID v4' })
  @IsNotEmpty({ message: 'resetToken is required' })
  resetToken: string;

  @IsString({ message: 'newPassword must be a string' })
  @IsNotEmpty({ message: 'newPassword is required' })
  @MinLength(8, { message: 'newPassword must be at least 8 characters' })
  @Matches(/^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/, {
    message:
      'newPassword must be at least 8 characters with at least 1 uppercase letter, 1 number, and 1 special character',
  })
  newPassword: string;

  @IsString({ message: 'confirmPassword must be a string' })
  @IsNotEmpty({ message: 'confirmPassword is required' })
  confirmPassword: string;
}
