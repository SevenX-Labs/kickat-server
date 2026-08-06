import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { ProfileModule } from '../profile/profile.module';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [ProfileModule, PrismaModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
