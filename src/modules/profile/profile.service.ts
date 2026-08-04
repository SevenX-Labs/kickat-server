import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /profile (Get user profile with addresses and pets)
   */
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: { orderBy: { createdAt: 'desc' } },
        pets: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return {
      success: true,
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        dob: user.dob,
        isProfileComplete: user.isProfileComplete,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        addresses: user.addresses,
        pets: user.pets,
      },
    };
  }

  /**
   * POST /profile (Create or complete full unified user profile)
   */
  async createOrUpdateProfile(userId: string, dto: CreateProfileDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email !== existingUser.email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id: userId } },
      });
      if (emailTaken) {
        throw new BadRequestException('Email address is already in use');
      }
    }

    const dobValue = dto.dob ? new Date(dto.dob) : undefined;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        email: dto.email ?? existingUser.email,
        gender: dto.gender as any,
        dob: dobValue,
        isProfileComplete: true,
      },
    });

    if (dto.addresses && dto.addresses.length > 0) {
      await this.prisma.address.createMany({
        data: dto.addresses.map((addr) => ({
          userId,
          type: addr.type as any,
          houseFlat: addr.houseFlat,
          buildingStreet: addr.buildingStreet,
          landmark: addr.landmark,
          city: addr.city,
          state: addr.state,
          pincode: addr.pincode,
          isDefault: addr.isDefault ?? false,
          deliveryInstructions: addr.deliveryInstructions,
        })),
      });
    }

    if (dto.pets && dto.pets.length > 0) {
      await this.prisma.pet.createMany({
        data: dto.pets.map((pet) => ({
          userId,
          species: pet.species as any,
          name: pet.name,
          breed: pet.breed,
          dobOrAge: pet.dobOrAge,
          gender: pet.gender as any,
          weight: pet.weight,
          dietaryPreference: pet.dietaryPreference as any,
          allergiesHealthNotes: pet.allergiesHealthNotes,
        })),
      });
    }

    return this.getProfile(userId);
  }

  /**
   * PUT / PATCH /profile (Update user basic details)
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (dto.email && dto.email !== existingUser.email) {
      const emailTaken = await this.prisma.user.findFirst({
        where: { email: dto.email, NOT: { id: userId } },
      });
      if (emailTaken) {
        throw new BadRequestException('Email address is already in use');
      }
    }

    const dobValue = dto.dob ? new Date(dto.dob) : undefined;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email }),
        ...(dto.gender && { gender: dto.gender as any }),
        ...(dobValue && { dob: dobValue }),
      },
    });

    return this.getProfile(userId);
  }

  /**
   * POST /profile/addresses (Add a delivery address)
   */
  async addAddress(userId: string, dto: CreateAddressDto) {
    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.create({
      data: {
        userId,
        type: dto.type as any,
        houseFlat: dto.houseFlat,
        buildingStreet: dto.buildingStreet,
        landmark: dto.landmark,
        city: dto.city,
        state: dto.state,
        pincode: dto.pincode,
        isDefault: dto.isDefault ?? false,
        deliveryInstructions: dto.deliveryInstructions,
      },
    });

    return {
      success: true,
      message: 'Address added successfully',
      address,
    };
  }

  /**
   * PUT /profile/addresses/:id (Update a delivery address)
   */
  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    const existing = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Address not found');
    }

    if (dto.isDefault) {
      await this.prisma.address.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.update({
      where: { id: addressId },
      data: {
        ...(dto.type && { type: dto.type as any }),
        ...(dto.houseFlat && { houseFlat: dto.houseFlat }),
        ...(dto.buildingStreet && { buildingStreet: dto.buildingStreet }),
        ...(dto.landmark !== undefined && { landmark: dto.landmark }),
        ...(dto.city && { city: dto.city }),
        ...(dto.state && { state: dto.state }),
        ...(dto.pincode && { pincode: dto.pincode }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.deliveryInstructions !== undefined && {
          deliveryInstructions: dto.deliveryInstructions,
        }),
      },
    });

    return {
      success: true,
      message: 'Address updated successfully',
      address,
    };
  }

  /**
   * DELETE /profile/addresses/:id (Delete a delivery address)
   */
  async deleteAddress(userId: string, addressId: string) {
    const existing = await this.prisma.address.findFirst({
      where: { id: addressId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Address not found');
    }

    await this.prisma.address.delete({
      where: { id: addressId },
    });

    return {
      success: true,
      message: 'Address deleted successfully',
    };
  }

  /**
   * POST /profile/pets (Add a pet profile)
   */
  async addPet(userId: string, dto: CreatePetDto) {
    const pet = await this.prisma.pet.create({
      data: {
        userId,
        species: dto.species as any,
        name: dto.name,
        breed: dto.breed,
        dobOrAge: dto.dobOrAge,
        gender: dto.gender as any,
        weight: dto.weight,
        dietaryPreference: dto.dietaryPreference as any,
        allergiesHealthNotes: dto.allergiesHealthNotes,
      },
    });

    return {
      success: true,
      message: 'Pet profile created successfully',
      pet,
    };
  }

  /**
   * PUT /profile/pets/:id (Update a pet profile)
   */
  async updatePet(userId: string, petId: string, dto: UpdatePetDto) {
    const existing = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Pet profile not found');
    }

    const pet = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        ...(dto.species && { species: dto.species as any }),
        ...(dto.name && { name: dto.name }),
        ...(dto.breed !== undefined && { breed: dto.breed }),
        ...(dto.dobOrAge !== undefined && { dobOrAge: dto.dobOrAge }),
        ...(dto.gender && { gender: dto.gender as any }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.dietaryPreference && {
          dietaryPreference: dto.dietaryPreference as any,
        }),
        ...(dto.allergiesHealthNotes !== undefined && {
          allergiesHealthNotes: dto.allergiesHealthNotes,
        }),
      },
    });

    return {
      success: true,
      message: 'Pet profile updated successfully',
      pet,
    };
  }

  /**
   * DELETE /profile/pets/:id (Delete a pet profile)
   */
  async deletePet(userId: string, petId: string) {
    const existing = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Pet profile not found');
    }

    await this.prisma.pet.delete({
      where: { id: petId },
    });

    return {
      success: true,
      message: 'Pet profile deleted successfully',
    };
  }
}
