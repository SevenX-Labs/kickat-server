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
import { CreatePaymentMethodDto, SavedPaymentMethodTypeDto } from './dto/create-payment-method.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Helper function to automatically compute and set profileCompleted
   * Required conditions for profileCompleted = true:
   * 1. Basic user details are set (name, gender, dob)
   * 2. At least one delivery address exists
   * 3. At least one pet profile exists
   */
  async checkAndUpdateProfileCompletion(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        addresses: true,
        pets: true,
      },
    });

    if (!user) return false;

    const hasBasicDetails = Boolean(user.name && user.gender && user.dob);
    const hasAddress = user.addresses.length > 0;
    const hasPet = user.pets.length > 0;

    const isComplete = hasBasicDetails && hasAddress && hasPet;

    
    // If user has a googleId but isEmailVerified is false, automatically fix it to true
    if (user.googleId && !user.isEmailVerified) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isEmailVerified: true },
      });
      user.isEmailVerified = true;
    }

    if (user.isProfileComplete !== isComplete) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isProfileComplete: isComplete },
      });
    }

    return isComplete;
  }

  /**
   * GET /profile or GET /users/me (Get user profile with addresses and petProfiles)
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

    // Automatically re-evaluate profile completion status without duplicate DB query
    const hasBasicDetails = Boolean(user.name && user.gender && user.dob);
    const hasAddress = user.addresses.length > 0;
    const hasPet = user.pets.length > 0;
    const isComplete = hasBasicDetails && hasAddress && hasPet;

    if (user.isProfileComplete !== isComplete) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { isProfileComplete: isComplete },
      });
      user.isProfileComplete = isComplete;
    }

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        gender: user.gender,
        dob: user.dob,
        isNewUser: !user.isProfileComplete,
        profileCompleted: user.isProfileComplete,
        isProfileComplete: user.isProfileComplete,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        profile: {
          name: user.name,
          email: user.email,
          phone: user.phone,
          gender: user.gender,
          dob: user.dob,
        },
        addresses: user.addresses,
        pets: user.pets,
        petProfiles: user.pets,
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

    // Check phone uniqueness if phone is changing
    if (dto.phone && dto.phone !== existingUser.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id: userId } },
      });
      if (phoneTaken) {
        throw new BadRequestException('Phone number is already in use by another account');
      }
    }

    const dobValue = dto.dob ? new Date(dto.dob) : undefined;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        ...(dto.email && { email: dto.email }),
        ...(dto.phone && { phone: dto.phone }),
        ...(dto.gender && { gender: dto.gender as any }),
        ...(dobValue && { dob: dobValue }),
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

    return this.getProfile(userId);
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

    await this.checkAndUpdateProfileCompletion(userId);

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

    await this.checkAndUpdateProfileCompletion(userId);

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

    await this.checkAndUpdateProfileCompletion(userId);

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

    await this.checkAndUpdateProfileCompletion(userId);

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

    await this.checkAndUpdateProfileCompletion(userId);

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

    await this.checkAndUpdateProfileCompletion(userId);

    return {
      success: true,
      message: 'Pet profile deleted successfully',
    };
  }

  /**
   * GET /profile/payment-methods
   */
  async getPaymentMethods(userId: string) {
    const methods = await this.prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return {
      success: true,
      count: methods.length,
      methods: methods.map((m) => ({
        ...m,
        accountNumber: m.accountNumber
          ? `XXXXXX${m.accountNumber.slice(-4)}`
          : null,
      })),
    };
  }

  /**
   * POST /profile/payment-methods
   */
  async addPaymentMethod(userId: string, dto: CreatePaymentMethodDto) {
    if (dto.type === SavedPaymentMethodTypeDto.UPI && !dto.upiId) {
      throw new BadRequestException('upiId is required for UPI payment method');
    }

    if (dto.type === SavedPaymentMethodTypeDto.BANK_ACCOUNT && (!dto.accountNumber || !dto.ifscCode)) {
      throw new BadRequestException('accountNumber and ifscCode are required for BANK_ACCOUNT');
    }

    const existingCount = await this.prisma.userPaymentMethod.count({
      where: { userId },
    });

    const isDefault = dto.isDefault || existingCount === 0;

    if (isDefault) {
      await this.prisma.userPaymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    const paymentMethod = await this.prisma.userPaymentMethod.create({
      data: {
        userId,
        type: dto.type as any,
        upiId: dto.upiId || null,
        accountNumber: dto.accountNumber || null,
        ifscCode: dto.ifscCode ? dto.ifscCode.toUpperCase() : null,
        accountHolderName: dto.accountHolderName || null,
        bankName: dto.bankName || null,
        cardLast4: dto.cardLast4 || null,
        cardNetwork: dto.cardNetwork || null,
        isDefault,
      },
    });

    return {
      success: true,
      message: 'Payment method saved successfully',
      method: {
        ...paymentMethod,
        accountNumber: paymentMethod.accountNumber
          ? `XXXXXX${paymentMethod.accountNumber.slice(-4)}`
          : null,
      },
    };
  }

  /**
   * DELETE /profile/payment-methods/:id
   */
  async deletePaymentMethod(userId: string, methodId: string) {
    const existing = await this.prisma.userPaymentMethod.findFirst({
      where: { id: methodId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Payment method not found');
    }

    await this.prisma.userPaymentMethod.delete({
      where: { id: methodId },
    });

    if (existing.isDefault) {
      const firstRemaining = await this.prisma.userPaymentMethod.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });
      if (firstRemaining) {
        await this.prisma.userPaymentMethod.update({
          where: { id: firstRemaining.id },
          data: { isDefault: true },
        });
      }
    }

    return {
      success: true,
      message: 'Payment method deleted successfully',
    };
  }

  /**
   * PATCH /profile/payment-methods/:id/default
   */
  async setDefaultPaymentMethod(userId: string, methodId: string) {
    const existing = await this.prisma.userPaymentMethod.findFirst({
      where: { id: methodId, userId },
    });

    if (!existing) {
      throw new NotFoundException('Payment method not found');
    }

    await this.prisma.userPaymentMethod.updateMany({
      where: { userId },
      data: { isDefault: false },
    });

    await this.prisma.userPaymentMethod.update({
      where: { id: methodId },
      data: { isDefault: true },
    });

    return {
      success: true,
      message: 'Default payment method updated successfully',
    };
  }
}
