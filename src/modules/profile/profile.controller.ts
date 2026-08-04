import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { Auth, CurrentUser } from '../../common';

@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Auth()
  @Get()
  async getProfile(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Auth()
  @Post()
  @HttpCode(HttpStatus.OK)
  async createOrUpdateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProfileDto,
  ) {
    return this.profileService.createOrUpdateProfile(userId, dto);
  }

  @Auth()
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(userId, dto);
  }

  @Auth()
  @Patch()
  @HttpCode(HttpStatus.OK)
  async patchProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateProfile(userId, dto);
  }

  @Auth()
  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  async addAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.profileService.addAddress(userId, dto);
  }

  @Auth()
  @Put('addresses/:id')
  @HttpCode(HttpStatus.OK)
  async updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.profileService.updateAddress(userId, addressId, dto);
  }

  @Auth()
  @Delete('addresses/:id')
  @HttpCode(HttpStatus.OK)
  async deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    return this.profileService.deleteAddress(userId, addressId);
  }

  @Auth()
  @Post('pets')
  @HttpCode(HttpStatus.CREATED)
  async addPet(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePetDto,
  ) {
    return this.profileService.addPet(userId, dto);
  }

  @Auth()
  @Put('pets/:id')
  @HttpCode(HttpStatus.OK)
  async updatePet(
    @CurrentUser('id') userId: string,
    @Param('id') petId: string,
    @Body() dto: UpdatePetDto,
  ) {
    return this.profileService.updatePet(userId, petId, dto);
  }

  @Auth()
  @Delete('pets/:id')
  @HttpCode(HttpStatus.OK)
  async deletePet(
    @CurrentUser('id') userId: string,
    @Param('id') petId: string,
  ) {
    return this.profileService.deletePet(userId, petId);
  }
}
