import { Controller, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { CompareService } from './compare.service';

@Controller('compare')
@UseGuards(ThrottlerGuard)
export class CompareController {
  constructor(private readonly compareService: CompareService) {}
}
