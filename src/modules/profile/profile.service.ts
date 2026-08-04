import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { CreatePetDto } from './dto/create-pet.dto';
import { UpdatePetDto } from './dto/update-pet.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /profile (Get complete user profile with addresses and pets)
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
        profileImage: user.profileImage,
        isProfileComplete: user.isProfileComplete,
        profileCompleted: user.isProfileComplete,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        addresses: user.addresses,
        pets: user.pets,
      },
    };
  }

  /**
   * POST /profile/basic (Step 1 — Create/Update User Basic Profile)
   */
  async updateBasicProfile(userId: string, dto: UpdateUserProfileDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Google verified emails are read-only
    if (existingUser.isEmailVerified && dto.email && dto.email !== existingUser.email) {
      throw new BadRequestException('Email is verified via Google login and cannot be modified');
    }

    // Check email uniqueness if email is changing
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
        ...(dto.email && { email: dto.email }),
        ...(dto.gender && { gender: dto.gender as any }),
        ...(dobValue && { dob: dobValue }),
        ...(dto.profileImage !== undefined && { profileImage: dto.profileImage }),
      },
    });

    return this.getProfile(userId);
  }

  /**
   * POST /profile (Create or update full unified profile in one call)
   */
  async createOrUpdateProfile(userId: string, dto: CreateProfileDto) {
    await this.updateBasicProfile(userId, {
      name: dto.name,
      email: dto.email,
      gender: dto.gender,
      dob: dto.dob,
    });

    if (dto.addresses && dto.addresses.length > 0) {
      for (const addr of dto.addresses) {
        await this.addAddress(userId, addr);
      }
    }

    if (dto.pets && dto.pets.length > 0) {
      for (const pet of dto.pets) {
        await this.addPet(userId, pet);
      }
    }

    return this.completeProfile(userId);
  }

  /**
   * POST /profile/complete (Step 4 — Finalize Onboarding)
   */
  async completeProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.name) {
      throw new BadRequestException('Full name is required to complete profile onboarding');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { isProfileComplete: true },
    });

    return this.getProfile(updatedUser.id);
  }

  /**
   * POST /profile/addresses (Step 2 — Add Delivery Address)
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
        country: dto.country || 'India',
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
   * PUT /profile/addresses/:id (Update Address)
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
        ...(dto.country && { country: dto.country }),
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
   * DELETE /profile/addresses/:id
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
   * POST /profile/pets (Step 3 — Add Pet Profile)
   */
  async addPet(userId: string, dto: CreatePetDto) {
    const dobValue = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;

    const pet = await this.prisma.pet.create({
      data: {
        userId,
        species: dto.species as any,
        name: dto.name,
        breed: dto.breed,
        dateOfBirth: dobValue,
        age: dto.age,
        ageUnit: dto.ageUnit as any,
        gender: dto.gender as any,
        weight: dto.weight,
        weightUnit: (dto.weightUnit || 'KG') as any,
        dietaryPreference: dto.dietaryPreference as any,
        allergies: dto.allergies || [],
        healthNotes: dto.healthNotes,
      },
    });

    return {
      success: true,
      message: 'Pet profile created successfully',
      pet,
    };
  }

  /**
   * PUT /profile/pets/:id (Update Pet Profile)
   */
  async updatePet(userId: string, petId: string, dto: UpdatePetDto) {
    const existing = await this.prisma.pet.findFirst({
      where: { id: petId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Pet profile not found');
    }

    const dobValue = dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined;

    const pet = await this.prisma.pet.update({
      where: { id: petId },
      data: {
        ...(dto.species && { species: dto.species as any }),
        ...(dto.name && { name: dto.name }),
        ...(dto.breed !== undefined && { breed: dto.breed }),
        ...(dobValue && { dateOfBirth: dobValue }),
        ...(dto.age !== undefined && { age: dto.age }),
        ...(dto.ageUnit && { ageUnit: dto.ageUnit as any }),
        ...(dto.gender && { gender: dto.gender as any }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.weightUnit && { weightUnit: dto.weightUnit as any }),
        ...(dto.dietaryPreference && {
          dietaryPreference: dto.dietaryPreference as any,
        }),
        ...(dto.allergies && { allergies: dto.allergies }),
        ...(dto.healthNotes !== undefined && { healthNotes: dto.healthNotes }),
      },
    });

    return {
      success: true,
      message: 'Pet profile updated successfully',
      pet,
    };
  }

  /**
   * DELETE /profile/pets/:id
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
