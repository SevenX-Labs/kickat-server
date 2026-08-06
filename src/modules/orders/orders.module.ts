import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { ReturnsController } from './returns.controller';
import { OrdersService } from './orders.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [OrdersController, ReturnsController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
