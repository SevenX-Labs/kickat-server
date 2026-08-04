import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum PetSpeciesDto {
  DOG = 'DOG',
  CAT = 'CAT',
  BIRD = 'BIRD',
  FISH = 'FISH',
  RABBIT = 'RABBIT',
  OTHER = 'OTHER',
}

export enum GenderDto {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  PREFER_NOT_TO_SAY = 'PREFER_NOT_TO_SAY',
}

export enum DietaryPreferenceDto {
  VEG = 'VEG',
  NON_VEG = 'NON_VEG',
  BOTH = 'BOTH',
}

export enum AgeUnitDto {
  MONTHS = 'MONTHS',
  YEARS = 'YEARS',
}

export enum WeightUnitDto {
  KG = 'KG',
  LBS = 'LBS',
}

export class CreatePetDto {
  @IsNotEmpty({ message: 'species is required' })
  @IsEnum(PetSpeciesDto, { message: 'species must be DOG, CAT, BIRD, FISH, RABBIT, or OTHER' })
  species: PetSpeciesDto;

  @IsNotEmpty({ message: 'name is required' })
  @IsString({ message: 'name must be a string' })
  name: string;

  @IsOptional()
  @IsString({ message: 'breed must be a string' })
  breed?: string;

  @IsOptional()
  @IsString({ message: 'dateOfBirth must be a string (YYYY-MM-DD)' })
  dateOfBirth?: string;

  @IsOptional()
  @IsInt({ message: 'age must be an integer' })
  @Min(0, { message: 'age cannot be negative' })
  age?: number;

  @IsOptional()
  @IsEnum(AgeUnitDto, { message: 'ageUnit must be MONTHS or YEARS' })
  ageUnit?: AgeUnitDto;

  @IsOptional()
  @IsEnum(GenderDto, { message: 'gender must be MALE, FEMALE, or PREFER_NOT_TO_SAY' })
  gender?: GenderDto;

  @IsOptional()
  @IsNumber({}, { message: 'weight must be a number' })
  @Min(0, { message: 'weight cannot be negative' })
  weight?: number;

  @IsOptional()
  @IsEnum(WeightUnitDto, { message: 'weightUnit must be KG or LBS' })
  weightUnit?: WeightUnitDto = WeightUnitDto.KG;

  @IsOptional()
  @IsEnum(DietaryPreferenceDto, { message: 'dietaryPreference must be VEG, NON_VEG, or BOTH' })
  dietaryPreference?: DietaryPreferenceDto;

  @IsOptional()
  @IsArray({ message: 'allergies must be an array of strings' })
  @IsString({ each: true, message: 'each allergy must be a string' })
  allergies?: string[];

  @IsOptional()
  @IsString({ message: 'healthNotes must be a string' })
  healthNotes?: string;
}
