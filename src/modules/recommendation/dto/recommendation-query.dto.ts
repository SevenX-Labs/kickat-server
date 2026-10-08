import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Query params for "Suggested for You".
 * Only `limit` is accepted — the customer is ALWAYS resolved from the JWT,
 * never from the client, so there is intentionally no userId field here.
 */
export class RecommendationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(20, { message: 'limit cannot exceed 20' })
  limit?: number = 10;
}
