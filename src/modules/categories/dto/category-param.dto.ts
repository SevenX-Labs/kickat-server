import { IsNotEmpty, IsString } from 'class-validator';

export class CategoryParamDto {
  @IsString({ message: 'id must be a string' })
  @IsNotEmpty({ message: 'id cannot be empty' })
  id: string;
}
