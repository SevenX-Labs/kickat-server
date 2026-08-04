import { IsOptional, IsUUID } from 'class-validator';

export class HomeQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'petId must be a valid UUID v4' })
  petId?: string;
}
