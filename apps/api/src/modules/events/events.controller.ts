import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Eventos')
@Controller('events')
export class EventsController {
  constructor(private eventsService: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar eventos publicados (publico, paginado, filtravel)' })
  @ApiQuery({ name: 'city', required: false, description: 'Filtrar por cidade' })
  @ApiQuery({ name: 'modality', required: false, description: 'Filtrar por modalidade (5K, 10K, 21K, etc.)' })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'Data inicial (ISO 8601)' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'Data final (ISO 8601)' })
  @ApiQuery({ name: 'search', required: false, description: 'Buscar por titulo ou descricao' })
  @ApiQuery({ name: 'page', required: false, description: 'Pagina', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Itens por pagina', example: 20 })
  async listPublished(
    @Query('city') city?: string,
    @Query('modality') modality?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventsService.listPublished({ city, modality, dateFrom, dateTo, search, page, limit });
  }

  @Get('my-registrations')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Listar minhas inscricoes em eventos' })
  @ApiQuery({ name: 'page', required: false, description: 'Pagina', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Itens por pagina', example: 20 })
  async getMyRegistrations(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventsService.getMyRegistrations(userId, page, limit);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalhes do evento com contagem de inscritos' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async findOne(@Param('id') id: string) {
    return this.eventsService.findById(id);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN)
  @ApiOperation({ summary: 'Criar evento (somente COACH ou ADMIN)' })
  async create(@CurrentUser('id') userId: string, @Body() dto: CreateEventDto) {
    return this.eventsService.create(userId, dto);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Atualizar evento (somente criador)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(id, userId, dto);
  }

  @Post(':id/register')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Inscrever-se em um evento (autenticado)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async register(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { shirtSize?: string; kitType?: 'COMPLETO' | 'PREMIUM'; emergencyContact?: string; medicalInfo?: string },
  ) {
    return this.eventsService.register(id, userId, { ...body, kitType: body.kitType as any });
  }

  @Delete(':id/register')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Cancelar inscricao no evento' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async cancelRegistration(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.eventsService.cancelRegistration(id, userId);
  }

  @Get(':id/registrations')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Listar inscricoes do evento (somente criador)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  @ApiQuery({ name: 'page', required: false, description: 'Pagina', example: 1 })
  @ApiQuery({ name: 'limit', required: false, description: 'Itens por pagina', example: 50 })
  async getRegistrations(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventsService.getRegistrations(id, userId, page, limit);
  }
}
