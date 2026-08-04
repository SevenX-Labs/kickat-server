import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IsAtLeastAge } from '../../../common';
import { GenderDto } from './create-pet.dto';
import { CreateAddressDto } from './create-address.dto';
import { CreatePetDto } from './create-pet.dto';

export class CreateProfileDto {
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

  @IsOptional()
  @IsArray({ message: 'addresses must be an array' })
  @ValidateNested({ each: true })
  @Type(() => CreateAddressDto)
  addresses?: CreateAddressDto[];

  @IsOptional()
  @IsArray({ message: 'pets must be an array' })
  @ValidateNested({ each: true })
  @Type(() => CreatePetDto)
  pets?: CreatePetDto[];
}
