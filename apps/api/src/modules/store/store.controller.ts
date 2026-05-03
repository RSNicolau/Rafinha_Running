import {
  Controller, Get, Post, Put, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole, ProductCategory, StoreOrderStatus } from '@prisma/client';
import { StoreService } from './store.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Loja Virtual')
@Controller('store')
export class StoreController {
  constructor(private storeService: StoreService) {}

  // ── Public endpoints ──

  @Get('public/:coachId/products')
  @ApiOperation({ summary: 'Listar produtos públicos da loja' })
  listPublicProducts(@Param('coachId') coachId: string) {
    return this.storeService.listPublicProducts(coachId);
  }

  @Get('public/product/:id')
  @ApiOperation({ summary: 'Detalhes de um produto' })
  getProduct(@Param('id') id: string) {
    return this.storeService.getProduct(id);
  }

  @Post('public/orders')
  @ApiOperation({ summary: 'Criar pedido (pré-encomenda)' })
  @HttpCode(HttpStatus.CREATED)
  createOrder(@Body() body: {
    productId: string;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    size?: string;
    color?: string;
    quantity: number;
    shippingAddress?: string;
    notes?: string;
    couponCode?: string;
  }) {
    return this.storeService.createOrder(body);
  }

  @Get('public/orders/:id')
  @ApiOperation({ summary: 'Consultar status do pedido' })
  getOrder(@Param('id') id: string) {
    return this.storeService.getOrderById(id);
  }

  // ── Athlete vitrine ──

  @Get('athlete/products')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Atleta vê produtos da loja do coach (com desconto aplicado)' })
  listForAthlete(@CurrentUser('id') athleteId: string) {
    return this.storeService.listForAthlete(athleteId);
  }

  // ── Coach / Admin endpoints ──

  @Get('products')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar todos os produtos do coach' })
  listCoachProducts(@CurrentUser('id') coachId: string) {
    return this.storeService.listCoachProducts(coachId);
  }

  @Post('products')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar produto' })
  @HttpCode(HttpStatus.CREATED)
  createProduct(
    @CurrentUser('id') coachId: string,
    @Body() body: {
      name: string;
      description?: string;
      category: ProductCategory;
      priceInCents: number;
      images?: string[];
      sizes?: string[];
      colors?: string[];
      totalStock?: number;
      featured?: boolean;
      athleteDiscountPercent?: number;
    },
  ) {
    return this.storeService.createProduct(coachId, body);
  }

  @Put('products/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar produto' })
  updateProduct(
    @Param('id') id: string,
    @CurrentUser('id') coachId: string,
    @Body() body: Partial<{
      name: string;
      description: string;
      category: ProductCategory;
      priceInCents: number;
      images: string[];
      sizes: string[];
      colors: string[];
      totalStock: number;
      active: boolean;
      featured: boolean;
      athleteDiscountPercent: number;
    }>,
  ) {
    return this.storeService.updateProduct(id, coachId, body);
  }

  @Delete('products/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Desativar produto' })
  deleteProduct(@Param('id') id: string, @CurrentUser('id') coachId: string) {
    return this.storeService.deleteProduct(id, coachId);
  }

  @Get('orders')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar pedidos do coach' })
  listOrders(
    @CurrentUser('id') coachId: string,
    @Query('status') status?: StoreOrderStatus,
  ) {
    return this.storeService.listCoachOrders(coachId, status);
  }

  @Put('orders/:id/status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar status do pedido' })
  updateOrderStatus(
    @Param('id') orderId: string,
    @CurrentUser('id') coachId: string,
    @Body() body: { status: StoreOrderStatus },
  ) {
    return this.storeService.updateOrderStatus(orderId, coachId, body.status);
  }

  @Get('stats')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Estatísticas da loja' })
  getStats(@CurrentUser('id') coachId: string) {
    return this.storeService.getStoreStats(coachId);
  }

  // ── COUPONS ──

  @Post('coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar cupom de desconto para a loja' })
  createCoupon(
    @CurrentUser('id') coachId: string,
    @Body() body: { code: string; type: 'PERCENT' | 'FIXED' | 'COURTESY'; value?: number; maxUses?: number; expiresAt?: string },
  ) {
    return this.storeService.createStoreCoupon(coachId, body);
  }

  @Get('coupons')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar cupons da loja' })
  listCoupons(@CurrentUser('id') coachId: string) {
    return this.storeService.listStoreCoupons(coachId);
  }

  @Post('public/validate-coupon')
  @ApiOperation({ summary: 'Validar cupom da loja (público)' })
  validateCoupon(@Body() body: { coachId: string; code: string; priceInCents: number }) {
    return this.storeService.validateStoreCoupon(body.coachId, body.code, body.priceInCents);
  }
}
