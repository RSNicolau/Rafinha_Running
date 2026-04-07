import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: 'Validation failed' })
  message: string;

  @ApiProperty({ example: ['email must be an email'], required: false, type: [String] })
  errors?: string[];

  @ApiProperty({ example: '2026-04-06T12:00:00.000Z' })
  timestamp: string;
}
