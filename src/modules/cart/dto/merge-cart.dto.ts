import { IsNotEmpty, IsUUID } from 'class-validator';

export class MergeCartDto {
  @IsNotEmpty({ message: 'guestSessionId is required' })
  @IsUUID('4', { message: 'guestSessionId must be a valid UUID v4' })
  guestSessionId: string;
}
