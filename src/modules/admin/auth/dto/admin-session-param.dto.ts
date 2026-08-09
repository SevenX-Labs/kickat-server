import { IsNotEmpty, IsUUID } from 'class-validator';

export class AdminSessionParamDto {
  @IsUUID('4', { message: 'sessionId must be a valid UUID v4' })
  @IsNotEmpty({ message: 'sessionId is required' })
  sessionId: string;
}
