import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { IsAtLeastAge } from '../../../common';
import { GenderDto } from './create-pet.dto';

export class UpdateUserProfileDto {
  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  @Matches(/^[a-zA-Z\s]+$/, { message: 'name must contain alphabets and spaces only' })
  name: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsEnum(GenderDto, { message: 'gender must be MALE, FEMALE, or PREFER_NOT_TO_SAY' })
  gender?: GenderDto;

  @IsOptional()
  @IsAtLeastAge(13, { message: 'Date of birth must indicate age of 13 years or older' })
  dob?: string;
}
