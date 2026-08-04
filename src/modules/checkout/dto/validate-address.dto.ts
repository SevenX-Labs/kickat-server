import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AddressTypeDto } from '../../profile/dto/create-address.dto';

export class CreateAddressInlineDto {
  @IsNotEmpty({ message: 'fullName is required' })
  @IsString({ message: 'fullName must be a string' })
  @MinLength(2, { message: 'fullName must be at least 2 characters' })
  fullName: string;

  @IsNotEmpty({ message: 'phone is required' })
  @Matches(/^\d{10}$/, { message: 'phone must be a valid 10-digit number' })
  phone: string;

  @IsNotEmpty({ message: 'houseNumber is required' })
  @IsString({ message: 'houseNumber must be a string' })
  houseNumber: string;

  @IsNotEmpty({ message: 'street is required' })
  @IsString({ message: 'street must be a string' })
  street: string;

  @IsOptional()
  @IsString({ message: 'landmark must be a string' })
  landmark?: string;

  @IsNotEmpty({ message: 'city is required' })
  @IsString({ message: 'city must be a string' })
  city: string;

  @IsNotEmpty({ message: 'state is required' })
  @IsString({ message: 'state must be a string' })
  state: string;

  @IsNotEmpty({ message: 'pincode is required' })
  @Matches(/^\d{6}$/, { message: 'pincode must be exactly 6 digits' })
  pincode: string;

  @IsOptional()
  @IsEnum(AddressTypeDto, { message: 'type must be HOME, WORK, or OTHER' })
  type?: AddressTypeDto = AddressTypeDto.HOME;
}

export class ValidateAddressDto {
  @IsOptional()
  @IsUUID('4', { message: 'addressId must be a valid UUID v4' })
  addressId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAddressInlineDto)
  address?: CreateAddressInlineDto;
}
