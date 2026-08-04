import { Module } from '@nestjs/common';
import { CompareService } from './compare.service';
import { CompareController } from './compare.controller';

@Module({
  controllers: [CompareController],
  providers: [CompareService],
})
export class CompareModule {}
