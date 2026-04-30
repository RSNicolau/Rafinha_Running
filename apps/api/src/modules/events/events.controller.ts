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
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { UserRole, EventRegistrationStatus } from '@prisma/client';
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
    @Body() body: { shirtSize?: string; kitType?: 'COMPLETO' | 'PREMIUM'; emergencyContact?: string; medicalInfo?: string; couponId?: string },
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

  @Post(':id/checkin')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Atleta faz check-in no evento (±1h do horario)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async checkin(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.eventsService.checkin(id, userId);
  }

  @Get(':id/attendees')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN)
  @ApiOperation({ summary: 'Coach ve lista de presenca do evento (CHECKED_IN, REGISTERED, ABSENT)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async getAttendees(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.eventsService.getAttendees(id, userId);
  }

  @Put(':id/registrations/:regId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN)
  @ApiOperation({ summary: 'Coach atualiza status da inscricao manualmente' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  @ApiParam({ name: 'regId', description: 'ID da inscricao' })
  async updateRegistration(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @CurrentUser('id') userId: string,
    @Body() body: { status: EventRegistrationStatus },
  ) {
    return this.eventsService.updateRegistrationStatus(id, regId, userId, body.status);
  }

  // ========== COUPONS ==========

  @Post(':id/coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Criar cupom de desconto para o evento (somente criador)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async createCoupon(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { code: string; type: 'PERCENT' | 'FIXED' | 'COURTESY'; value?: number; maxUses?: number; expiresAt?: string },
  ) {
    return this.eventsService.createCoupon(id, userId, body);
  }

  @Get(':id/coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Listar cupons do evento (somente criador)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async listCoupons(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.eventsService.listCoupons(id, userId);
  }

  @Post('validate-coupon')
  @ApiOperation({ summary: 'Validar cupom (publico) — retorna desconto' })
  async validateCoupon(@Body() body: { eventId: string; code: string }) {
    return this.eventsService.validateCoupon(body.eventId, body.code);
  }

  // ========== KIT DELIVERY ==========

  @Post(':id/kit-session')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Criar sessao de entrega de kit para voluntario (token 8h)' })
  @ApiParam({ name: 'id', description: 'ID do evento' })
  async createKitSession(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @Body() body: { label: string },
  ) {
    return this.eventsService.createKitSession(id, userId, body.label);
  }

  @Get('kit-delivery')
  @ApiOperation({ summary: 'Dados de entrega de kit para voluntario (publico via token)' })
  @ApiQuery({ name: 'token', required: true, description: 'Token de sessao do voluntario' })
  async getKitDeliveryData(@Query('token') token: string) {
    return this.eventsService.getKitDeliveryData(token);
  }

  @Get('kit-delivery/search')
  @ApiOperation({ summary: 'Buscar inscricoes por nome ou numero de peito' })
  @ApiQuery({ name: 'token', required: true })
  @ApiQuery({ name: 'q', required: true, description: 'Nome ou numero de peito' })
  async searchKitRegistrations(
    @Query('token') token: string,
    @Query('q') q: string,
  ) {
    const session = await this.eventsService.getKitDeliveryData(token);
    return this.eventsService.searchKitRegistrations(session.eventId, token, q);
  }

  @Post('kit-delivery/scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dar baixa na entrega do kit via QR code ou ID' })
  async deliverKit(
    @Body() body: { registrationId: string; token: string; volunteerLabel?: string },
  ) {
    return this.eventsService.deliverKit(body.registrationId, body.token, body.volunteerLabel);
  }
}
