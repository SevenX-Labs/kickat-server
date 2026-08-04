import { IsUUID } from 'class-validator';

export class GuestSessionIdParamDto {
  @IsUUID('4', { message: 'sessionId must be a valid UUID v4' })
  sessionId: string;
}
