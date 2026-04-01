import {
  IsString,
  IsOptional,
  IsInt,
  IsDateString,
  IsEnum,
  IsArray,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus } from '@prisma/client';

export class CreateEventDto {
  @ApiProperty({ description: 'Titulo do evento', example: 'Corrida Noturna SP' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ description: 'Descricao do evento' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'URL da imagem de capa' })
  @IsString()
  @IsOptional()
  coverImageUrl?: string;

  @ApiProperty({ description: 'Data e hora do evento', example: '2026-06-15T07:00:00Z' })
  @IsDateString({}, { message: 'Data do evento invalida' })
  eventDate: string;

  @ApiPropertyOptional({ description: 'Data de encerramento do evento', example: '2026-06-15T12:00:00Z' })
  @IsDateString({}, { message: 'Data de encerramento invalida' })
  @IsOptional()
  eventEndDate?: string;

  @ApiPropertyOptional({ description: 'Local do evento', example: 'Parque Ibirapuera' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional({ description: 'Cidade do evento', example: 'Sao Paulo' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Estado do evento', example: 'SP' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ description: 'Modalidade do evento (5K, 10K, 21K, 42K, Trail, Ultra)', example: '10K' })
  @IsString()
  @IsOptional()
  modality?: string;

  @ApiPropertyOptional({ description: 'Numero maximo de participantes', example: 500 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxParticipants?: number;

  @ApiPropertyOptional({ description: 'Preco em centavos BRL (0 = gratuito)', example: 15000, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ description: 'Status do evento', enum: EventStatus, default: EventStatus.DRAFT })
  @IsEnum(EventStatus, { message: 'Status de evento invalido' })
  @IsOptional()
  status?: EventStatus;

  @ApiPropertyOptional({ description: 'Tags do evento', example: ['corrida', 'noturna'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ description: 'Regulamento do evento' })
  @IsString()
  @IsOptional()
  rules?: string;

  @ApiPropertyOptional({ description: 'Descricao do kit' })
  @IsString()
  @IsOptional()
  kitDescription?: string;

  @ApiPropertyOptional({ description: 'URL do mapa do percurso' })
  @IsString()
  @IsOptional()
  routeMapUrl?: string;
}
