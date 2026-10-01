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
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import { ProfileService } from './profile.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { Auth, CurrentUser } from '../../common';

@Controller('profile')
@UseGuards(ThrottlerGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  /**
   * GET /profile (60 req / min / user)
   */
  @Throttle({ 'address-read': { limit: 60, ttl: 60000 } })
  @Auth()
  @Get()
  async getProfile(@CurrentUser('id') userId: string) {
    return this.profileService.getProfile(userId);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Post('basic')
  @HttpCode(HttpStatus.OK)
  async updateBasicProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.profileService.updateBasicProfile(userId, dto);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Post('address')
  @HttpCode(HttpStatus.CREATED)
  async addAddressStep(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.profileService.addAddress(userId, dto);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Post('pet')
  @HttpCode(HttpStatus.CREATED)
  async addPetStep(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePetDto,
  ) {
    return this.profileService.addPet(userId, dto);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Post()
  @HttpCode(HttpStatus.OK)
  async createOrUpdateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateProfileDto,
  ) {
    return this.profileService.createOrUpdateProfile(userId, dto);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateBasicProfile(userId, dto as any);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Patch()
  @HttpCode(HttpStatus.OK)
  async patchProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateBasicProfile(userId, dto as any);
  }

  /**
   * Address mutations (30 req / min / user)
   */
  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  async addAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.profileService.addAddress(userId, dto);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
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

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Delete('addresses/:id')
  @HttpCode(HttpStatus.OK)
  async deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id') addressId: string,
  ) {
    return this.profileService.deleteAddress(userId, addressId);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Post('pets')
  @HttpCode(HttpStatus.CREATED)
  async addPet(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePetDto,
  ) {
    return this.profileService.addPet(userId, dto);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
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

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Delete('pets/:id')
  @HttpCode(HttpStatus.OK)
  async deletePet(
    @CurrentUser('id') userId: string,
    @Param('id') petId: string,
  ) {
    return this.profileService.deletePet(userId, petId);
  }

  @Throttle({ 'address-read': { limit: 60, ttl: 60000 } })
  @Auth()
  @Get('payment-methods')
  @HttpCode(HttpStatus.OK)
  async getPaymentMethods(@CurrentUser('id') userId: string) {
    return this.profileService.getPaymentMethods(userId);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Post('payment-methods')
  @HttpCode(HttpStatus.CREATED)
  async addPaymentMethod(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePaymentMethodDto,
  ) {
    return this.profileService.addPaymentMethod(userId, dto);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Delete('payment-methods/:id')
  @HttpCode(HttpStatus.OK)
  async deletePaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') methodId: string,
  ) {
    return this.profileService.deletePaymentMethod(userId, methodId);
  }

  @Throttle({ 'address-mutation': { limit: 30, ttl: 60000 } })
  @Auth()
  @Patch('payment-methods/:id/default')
  @HttpCode(HttpStatus.OK)
  async setDefaultPaymentMethod(
    @CurrentUser('id') userId: string,
    @Param('id') methodId: string,
  ) {
    return this.profileService.setDefaultPaymentMethod(userId, methodId);
  }
}
