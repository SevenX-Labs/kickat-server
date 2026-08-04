import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

export enum AddressTypeDto {
  HOME = 'HOME',
  WORK = 'WORK',
  OTHER = 'OTHER',
}

export class CreateAddressDto {
  @IsOptional()
  @IsEnum(AddressTypeDto, { message: 'type must be HOME, WORK, or OTHER' })
  type?: AddressTypeDto = AddressTypeDto.HOME;

  @IsNotEmpty({ message: 'houseFlat is required' })
  @IsString({ message: 'houseFlat must be a string' })
  houseFlat: string;

  @IsNotEmpty({ message: 'buildingStreet is required' })
  @IsString({ message: 'buildingStreet must be a string' })
  buildingStreet: string;

  @IsOptional()
  @IsString({ message: 'landmark must be a string' })
  landmark?: string;

  @IsNotEmpty({ message: 'city is required' })
  @IsString({ message: 'city must be a string' })
  city: string;

  @IsNotEmpty({ message: 'state is required' })
  @IsString({ message: 'state must be a string' })
  state: string;

  @IsOptional()
  @IsString({ message: 'country must be a string' })
  country?: string = 'India';

  @IsNotEmpty({ message: 'pincode is required' })
  @IsString({ message: 'pincode must be a string' })
  @Matches(/^\d{5,6}$/, { message: 'pincode must be a valid 5 or 6 digit postal code' })
  pincode: string;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean = false;

  @IsOptional()
  @IsString({ message: 'deliveryInstructions must be a string' })
  deliveryInstructions?: string;
}
