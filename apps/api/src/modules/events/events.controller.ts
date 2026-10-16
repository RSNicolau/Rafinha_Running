import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { TeamActorInterceptor } from '../teams/team-actor.interceptor';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole, EventStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  CheckinScanDto,
  CreateDistanceDto,
  CreateEventCouponDto,
  DistanceDto,
  KitDeliverDto,
  KitSessionDto,
  NotifyRegistrantsDto,
  QuoteEventDto,
  RegisterEventDto,
  RegistrationPaymentActionDto,
  RegistrationsQueryDto,
  UpdateEventCouponDto,
  UpdateRegistrationStatusDto,
  ValidateEventCouponDto,
} from './dto/event-management.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UploadsService } from '../uploads/uploads.service';
import { OptionalJwtGuard } from '../payments/guards/optional-jwt.guard';

type AuthUser = { id: string; role: UserRole; team?: any };
const MANAGERS = [UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN];

@ApiTags('Eventos')
@Controller('events')
@UseInterceptors(TeamActorInterceptor)
export class EventsController {
  constructor(
    private eventsService: EventsService,
    private uploadsService: UploadsService,
  ) {}

  // ════════ Público / atleta ════════

  @Get()
  @ApiOperation({ summary: 'Listar eventos publicados (público, paginado, filtrável)' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'modality', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
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
  @ApiOperation({ summary: 'Minhas inscrições' })
  async getMyRegistrations(
    @CurrentUser('id') userId: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.eventsService.getMyRegistrations(userId, Number(page) || 1, Math.min(Number(limit) || 20, 100));
  }

  @Get('my-registrations/:registrationId/qr')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'QR Code da minha inscrição (retirada de kit / check-in)' })
  async myRegistrationQr(@Param('registrationId', ParseUUIDPipe) registrationId: string, @CurrentUser('id') userId: string) {
    return this.eventsService.myRegistrationQr(registrationId, userId);
  }

  @Get('manage')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Eventos que gerencio (todos os status) com contadores' })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  @ApiQuery({ name: 'search', required: false })
  async listManaged(@CurrentUser() user: AuthUser, @Query('status') status?: EventStatus, @Query('search') search?: string) {
    return this.eventsService.listManaged(user, { status, search });
  }

  // ════════ Kit (voluntários, via token) — rotas fixas antes de ':id' ════════

  @Get('kit-delivery')
  @ApiOperation({ summary: 'Dados da sessão de entrega de kit (público via token)' })
  @ApiQuery({ name: 'token', required: true })
  async getKitDeliveryData(@Query('token') token: string) {
    return this.eventsService.getKitDeliveryData(token);
  }

  @Get('kit-delivery/search')
  @ApiOperation({ summary: 'Buscar inscrição por nome, peito ou QR (RRKIT:<id>)' })
  @ApiQuery({ name: 'token', required: true })
  @ApiQuery({ name: 'q', required: true })
  async searchKitRegistrations(@Query('token') token: string, @Query('q') q: string) {
    const session = await this.eventsService.getKitDeliveryData(token);
    return this.eventsService.searchKitRegistrations(session.eventId, token, q);
  }

  @Post('kit-delivery/scan')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Dar baixa na entrega do kit (registrationId ou conteúdo do QR)' })
  async deliverKit(@Body() body: KitDeliverDto) {
    return this.eventsService.deliverKit(body.registrationId, body.token, body.volunteerLabel);
  }

  @Delete('kit-sessions/:sessionId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Revogar link de voluntário' })
  async revokeKitSession(@Param('sessionId', ParseUUIDPipe) sessionId: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.revokeKitSession(sessionId, user);
  }

  @Post('validate-coupon')
  @Throttle({ medium: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validar cupom (público, prévia)' })
  async validateCoupon(@Body() body: ValidateEventCouponDto) {
    return this.eventsService.validateCoupon(body.eventId, body.code);
  }

  @Post('quote')
  @Throttle({ medium: { limit: 30, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prévia de preço: percurso + kit + cupom (público)' })
  async quote(@Body() body: QuoteEventDto) {
    return this.eventsService.quote(body.eventId, body);
  }

  @Put('distances/:distanceId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Atualizar percurso' })
  async updateDistance(@Param('distanceId', ParseUUIDPipe) distanceId: string, @CurrentUser() user: AuthUser, @Body() body: DistanceDto) {
    return this.eventsService.updateDistance(distanceId, user, body);
  }

  @Delete('distances/:distanceId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Desativar percurso' })
  async deleteDistance(@Param('distanceId', ParseUUIDPipe) distanceId: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.deleteDistance(distanceId, user);
  }

  @Put('coupons/:couponId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Ativar/desativar cupom, alterar limite ou validade' })
  async updateCoupon(@Param('couponId', ParseUUIDPipe) couponId: string, @CurrentUser() user: AuthUser, @Body() body: UpdateEventCouponDto) {
    return this.eventsService.updateCoupon(couponId, user, body);
  }

  // ════════ Evento ════════

  @Get(':id')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Detalhes do evento (rascunho só para o organizador)' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user?: AuthUser | null) {
    return this.eventsService.findById(id, user ?? null);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Criar evento (COACH/ADMIN)' })
  async create(@CurrentUser() user: AuthUser, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.id, dto, user);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Atualizar evento — publicar (PUBLISHED), encerrar (COMPLETED), cancelar (CANCELED)' })
  async update(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateEventDto) {
    return this.eventsService.update(id, user, dto);
  }

  @Post(':id/cover-image')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload da imagem de capa' })
  async uploadCoverImage(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    await this.eventsService.assertCanManage(id, user);
    // valida o conteúdo real (magic bytes), não só o mimetype declarado
    const url = await this.uploadsService.uploadPublicImage(file, `events/${id}/cover-${Date.now()}`);
    return this.eventsService.update(id, user, { coverImageUrl: url } as UpdateEventDto);
  }

  @Get(':id/stats')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Painel do evento: vagas, pagamentos, receita, percursos, camisetas, kits' })
  async stats(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.getStats(id, user);
  }

  @Post(':id/notify')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Enviar notificação (push/in-app) para os inscritos' })
  async notify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() body: NotifyRegistrantsDto) {
    return this.eventsService.notifyRegistrants(id, user, body.message);
  }

  // ════════ Inscrição ════════

  @Post(':id/register')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @Throttle({ medium: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Inscrever-se (autenticado)',
    description: 'Evento pago → inscrição PENDING por 30 min (requiresPayment=true); conclua com POST /checkout {purpose: EVENT_REGISTRATION, refId: id}. Gratuito/cortesia → CONFIRMED com número de peito.',
  })
  async register(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string, @Body() body: RegisterEventDto) {
    return this.eventsService.register(id, userId, body);
  }

  @Delete(':id/register')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Cancelar minha inscrição' })
  async cancelRegistration(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.eventsService.cancelRegistration(id, userId);
  }

  @Post(':id/checkin')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Atleta faz check-in (±1h do horário)' })
  async checkin(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.eventsService.checkin(id, userId);
  }

  // ════════ Gestão de inscritos ════════

  @Get(':id/registrations')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Inscritos com filtros (status, pagamento, percurso, kit entregue, busca)' })
  async getRegistrations(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Query() q: RegistrationsQueryDto) {
    return this.eventsService.getRegistrations(id, user, q);
  }

  @Get(':id/registrations/export.csv')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Exportar inscritos (CSV)' })
  async exportRegistrations(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Query() q: RegistrationsQueryDto,
    @Res() res: Response,
  ) {
    const { filename, csv } = await this.eventsService.exportRegistrationsCsv(id, user, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get(':id/attendees')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Lista de presença' })
  async getAttendees(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.getAttendees(id, user);
  }

  @Post(':id/checkin-scan')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check-in pelo organizador (QR, id ou número de peito)' })
  async checkinScan(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() body: CheckinScanDto) {
    return this.eventsService.checkinScan(id, user, body.code, body.force === true);
  }

  @Put(':id/registrations/:regId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Presença manual: CHECKED_IN, ABSENT ou CONFIRMED (desfazer)' })
  async updateRegistration(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('regId', ParseUUIDPipe) regId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: UpdateRegistrationStatusDto,
  ) {
    return this.eventsService.updateRegistrationStatus(id, regId, user, body.status);
  }

  @Post(':id/registrations/:regId/payment')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'MARK_PAID (pagamento manual/cortesia), CANCEL ou REFUND (marcação de estorno)' })
  async registrationPayment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('regId', ParseUUIDPipe) regId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: RegistrationPaymentActionDto,
  ) {
    return this.eventsService.registrationPaymentAction(id, regId, user, body.action);
  }

  // ════════ Cupons ════════

  @Post(':id/coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Criar cupom do evento' })
  async createCoupon(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() body: CreateEventCouponDto) {
    return this.eventsService.createCoupon(id, user, body);
  }

  @Get(':id/coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Listar cupons do evento' })
  async listCoupons(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.listCoupons(id, user);
  }

  // ════════ Percursos ════════

  @Post(':id/distances')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Criar percurso' })
  async createDistance(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() body: CreateDistanceDto) {
    return this.eventsService.createDistance(id, user, body);
  }

  @Get(':id/distances')
  @ApiOperation({ summary: 'Listar percursos (público; ?all=true inclui inativos)' })
  async listDistances(@Param('id', ParseUUIDPipe) id: string, @Query('all') all?: string) {
    return this.eventsService.listDistances(id, all === 'true');
  }

  // ════════ Kit ════════

  @Post(':id/kit-session')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Criar link de voluntário para entrega de kit' })
  async createKitSession(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() body: KitSessionDto) {
    return this.eventsService.createKitSession(id, user, body.label, body.hours);
  }

  @Get(':id/kit-sessions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(...MANAGERS)
  @ApiOperation({ summary: 'Links de voluntário do evento' })
  async listKitSessions(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.eventsService.listKitSessions(id, user);
  }
}
