import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body for POST /customer/activity/search.
 * Only the search term comes from the client — userId is taken from the JWT.
 */
export class RecordSearchDto {
  @Transform(({ value }): unknown =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty({ message: 'query is required' })
  @IsString({ message: 'query must be a string' })
  @MinLength(1, { message: 'query must not be empty' })
  @MaxLength(100, { message: 'query cannot exceed 100 characters' })
  query: string;
}
