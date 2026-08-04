import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class GoogleAuthDto {
  @IsNotEmpty({ message: 'code is required' })
  @IsString({ message: 'code must be a string' })
  code: string;

  @IsNotEmpty({ message: 'redirectUri is required' })
  @IsString({ message: 'redirectUri must be a string' })
  redirectUri: string;
}
