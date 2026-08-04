import { IsNotEmpty, IsString, Length } from 'class-validator';

export class SearchSuggestionsQueryDto {
  @IsNotEmpty({ message: 'q is required' })
  @IsString({ message: 'q must be a string' })
  @Length(2, 50, { message: 'q must be between 2 and 50 characters' })
  q: string;
}
