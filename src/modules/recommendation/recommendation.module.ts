import { Module } from '@nestjs/common';
import { CustomerRecommendationController } from './customer-recommendation.controller';
import { RecommendationService } from './recommendation.service';
import { RecentlyViewedService } from './recently-viewed.service';
import { CustomerActivityService } from './customer-activity.service';

/**
 * Customer recommendation system.
 *
 * All logic lives server-side; the client only renders the result. Relies on
 * the globally-provided PrismaService and the existing JWT auth guard.
 */
@Module({
  controllers: [CustomerRecommendationController],
  providers: [
    RecommendationService,
    RecentlyViewedService,
    CustomerActivityService,
  ],
})
export class RecommendationModule {}
