import { IsNotEmpty, IsString, Matches, MinLength } from 'class-validator';

export class AdminChangePasswordDto {
  @IsString({ message: 'currentPassword must be a string' })
  @IsNotEmpty({ message: 'currentPassword is required' })
  currentPassword: string;

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
