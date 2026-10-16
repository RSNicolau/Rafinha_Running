import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, Res,
  UseGuards, HttpCode, HttpStatus, ParseUUIDPipe, UseInterceptors, UploadedFile, BadRequestException, Req,
} from '@nestjs/common';
import { TeamContextService } from '../teams/team-context.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadsService } from '../uploads/uploads.service';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Response } from 'express';
import { UserRole } from '@prisma/client';
import { StoreService } from './store.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { OptionalJwtGuard } from '../payments/guards/optional-jwt.guard';
import {
  CreateProductDto, CreateStoreCouponDto, CreateStoreOrderDto, ListOrdersQueryDto, UpdateOrderStatusDto,
  UpdateProductDto, UpdateStoreCouponDto, ValidateStoreCouponDto,
} from './dto/store.dto';

type AuthUser = { id: string; role: UserRole };

@ApiTags('Loja Virtual')
@Controller('store')
export class StoreController {
  constructor(
    private storeService: StoreService,
    private uploadsService: UploadsService,
    private teamContext: TeamContextService,
  ) {}

  /** Ator com a equipe ATIVA (header x-team-id) — todo o escopo de loja/pedidos/cupons é por equipe. */
  private async actor(user: AuthUser, req: any) {
    return { ...user, team: await this.teamContext.resolve(user, req) };
  }

  // ── Público ──────────────────────────────────────────────────────────────

  @Get('public/:coachId/products')
  @UseGuards(OptionalJwtGuard)
  @ApiOperation({ summary: 'Listar produtos públicos da loja (slug da equipe ou id/slug do coach)' })
  listPublicProducts(@Param('coachId') coachId: string, @CurrentUser('id') userId?: string) {
    return this.storeService.listPublicProducts(coachId, userId ?? null);
  }

  @Get('public/product/:id')
  @ApiOperation({ summary: 'Detalhes de um produto ativo' })
  getProduct(@Param('id', ParseUUIDPipe) id: string) {
    return this.storeService.getProduct(id);
  }

  @Post('public/orders')
  @UseGuards(OptionalJwtGuard)
  @Throttle({ medium: { limit: 15, ttl: 60000 } })
  @ApiOperation({
    summary: 'Criar pedido (pronta-entrega ou encomenda) — reserva por 30 min',
    description: 'Retorna accessToken (uma única vez) para consultar/pagar sem login. Preço calculado no servidor.',
  })
  @HttpCode(HttpStatus.CREATED)
  createOrder(@Body() dto: CreateStoreOrderDto, @CurrentUser() user?: AuthUser | null) {
    return this.storeService.createOrder(dto, user ?? null);
  }

  @Get('public/orders/:id')
  @UseGuards(OptionalJwtGuard)
  @ApiQuery({ name: 'token', required: false })
  @ApiOperation({ summary: 'Status do pedido (sem dados pessoais) — exige token do pedido ou login do dono' })
  getOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('token') token?: string,
    @CurrentUser('id') userId?: string,
  ) {
    return this.storeService.getPublicOrder(id, token, userId);
  }

  @Post('public/validate-coupon')
  @UseGuards(OptionalJwtGuard)
  @Throttle({ medium: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prévia de cupom da loja (público; com login de atleta já considera o desconto de aluno)' })
  validateCoupon(@Body() dto: ValidateStoreCouponDto, @CurrentUser('id') userId?: string) {
    return this.storeService.validateStoreCoupon(dto, userId ?? null);
  }

  // ── Atleta ───────────────────────────────────────────────────────────────

  @Get('athlete/products')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Atleta vê produtos da loja do coach (com desconto aplicado)' })
  listForAthlete(@CurrentUser('id') athleteId: string) {
    return this.storeService.listForAthlete(athleteId);
  }

  @Get('my-orders')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Pedidos do usuário logado' })
  myOrders(@CurrentUser('id') userId: string) {
    return this.storeService.listMyOrders(userId);
  }

  // ── Coach / Admin ────────────────────────────────────────────────────────

  @Get('products')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar produtos (coach: próprios; admin: todos)' })
  async listCoachProducts(@CurrentUser() user: AuthUser, @Req() req: any) {
    const a = await this.actor(user, req);
    return this.storeService.listCoachProducts(a.id, a.role, a.team);
  }

  @Post('products')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar produto (pronta-entrega ou encomenda)' })
  @HttpCode(HttpStatus.CREATED)
  async createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto, @Req() req: any) {
    return this.storeService.createProduct(user.id, dto, await this.actor(user, req));
  }

  @Post('uploads/product-image')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload de imagem de produto (retorna { url })' })
  async uploadProductImage(@CurrentUser('id') coachId: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    // valida o conteúdo real (magic bytes), não só o mimetype declarado
    const url = await this.uploadsService.uploadPublicImage(file, `store/${coachId}/${Date.now()}`);
    return { url };
  }

  @Put('products/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar produto (campos permitidos apenas)' })
  async updateProduct(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateProductDto,
    @Req() req: any,
  ) {
    return this.storeService.updateProduct(id, await this.actor(user, req), dto);
  }

  @Delete('products/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Desativar produto' })
  async deleteProduct(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    return this.storeService.deleteProduct(id, await this.actor(user, req));
  }

  @Get('orders')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar pedidos com filtros (status, encomenda, produto, busca, período)' })
  async listOrders(@CurrentUser() user: AuthUser, @Query() q: ListOrdersQueryDto, @Req() req: any) {
    return this.storeService.listCoachOrders(await this.actor(user, req), q);
  }

  @Get('orders/export.csv')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Exportar pedidos (CSV, mesmos filtros da listagem)' })
  async exportOrders(@CurrentUser() user: AuthUser, @Query() q: ListOrdersQueryDto, @Res() res: Response, @Req() req: any) {
    const csv = await this.storeService.exportOrdersCsv(await this.actor(user, req), q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  }

  @Get('preorders/summary')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Lista de produção das encomendas (por produto/tamanho/cor)' })
  async preOrderSummary(@CurrentUser() user: AuthUser, @Req() req: any) {
    return this.storeService.preOrderSummary(await this.actor(user, req));
  }

  @Get('orders/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Detalhe do pedido (coach) com pagamentos' })
  async getOrderForCoach(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    return this.storeService.getOrderForCoach(id, await this.actor(user, req));
  }

  @Put('orders/:id/status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar status do pedido (PAID manual, PROCESSING, SHIPPED, READY_FOR_PICKUP, DELIVERED, CANCELLED, REFUNDED)' })
  async updateOrderStatus(
    @Param('id', ParseUUIDPipe) orderId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateOrderStatusDto,
    @Req() req: any,
  ) {
    return this.storeService.updateOrderStatus(orderId, await this.actor(user, req), dto);
  }

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Estatísticas da loja' })
  async getStats(@CurrentUser() user: AuthUser, @Req() req: any) {
    const a = await this.actor(user, req);
    return this.storeService.getStoreStats(a.id, a.role, a.team);
  }

  // ── Cupons ───────────────────────────────────────────────────────────────

  @Post('coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar cupom de desconto para a loja' })
  async createCoupon(@CurrentUser() user: AuthUser, @Body() dto: CreateStoreCouponDto, @Req() req: any) {
    return this.storeService.createStoreCoupon(user.id, dto, await this.actor(user, req));
  }

  @Get('coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar cupons da loja' })
  async listCoupons(@CurrentUser() user: AuthUser, @Req() req: any) {
    return this.storeService.listStoreCoupons(await this.actor(user, req));
  }

  @Put('coupons/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Ativar/desativar cupom, alterar valor, limite ou validade' })
  async updateCoupon(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateStoreCouponDto, @Req() req: any) {
    return this.storeService.updateStoreCoupon(id, await this.actor(user, req), dto);
  }
}
