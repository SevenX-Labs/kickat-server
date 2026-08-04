import { IsNotEmpty, IsString } from 'class-validator';

export class QueryIdParamDto {
  @IsNotEmpty({ message: 'queryId is required' })
  @IsString({ message: 'queryId must be a string' })
  queryId: string;
}
