import {
  Controller, Get, Post, Put, Body, Param, UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { PlatformService } from './platform.service';
import { AdminSetPlanDto, SubscribePlatformDto, WhiteLabelAddCoachDto, WhiteLabelDto } from './dto/platform.dto';
import { AdminService } from '../admin/admin.service';

@ApiTags('Platform')
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly adminService: AdminService,
  ) {}

  // ─── Public ──────────────────────────────────────────────────────────────

  @Get('plans')
  @ApiOperation({ summary: 'Listar planos disponíveis (público)' })
  async listPlans() {
    return this.platformService.listPlans();
  }

  @Get('plans-config')
  @ApiOperation({ summary: 'Planos e preços (coach + atleta) para landing/checkout (público)' })
  async plansConfig() {
    return this.adminService.getPlansConfig();
  }

  // ─── Coach ───────────────────────────────────────────────────────────────

  @Get('my-subscription')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Ver minha assinatura atual' })
  async getMySubscription(@CurrentUser('id') coachId: string) {
    return this.platformService.getMySubscription(coachId);
  }

  @Post('subscribe')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Assinar um plano (gera cobrança — ativa somente após o pagamento)',
    description: 'Resposta: { status: "PENDING_PAYMENT", checkout: { paymentId, accessToken, checkoutUrl, pix, ... } }',
  })
  async subscribe(
    @CurrentUser() user: { id: string; name: string; email: string },
    @Body() body: SubscribePlatformDto,
  ) {
    return this.platformService.subscribe(user, body);
  }

  // ─── White Label ─────────────────────────────────────────────────────────

  @Post('white-label')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Criar/atualizar conta white-label' })
  async createWhiteLabel(
    @CurrentUser('id') ownerId: string,
    @Body() body: WhiteLabelDto,
  ) {
    return this.platformService.createWhiteLabel(ownerId, body);
  }

  @Post('white-label/domain/verify')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Verificar o domínio próprio (registro TXT _rr-verify.<domínio>)' })
  async verifyWhiteLabelDomain(@CurrentUser('id') ownerId: string) {
    return this.platformService.verifyWhiteLabelDomain(ownerId);
  }

  @Post('white-label/coaches')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Adicionar coach à conta white-label' })
  async addCoach(
    @CurrentUser('id') ownerId: string,
    @Body() body: WhiteLabelAddCoachDto,
  ) {
    return this.platformService.whiteLabelAddCoach(ownerId, body.coachId);
  }

  @Get('white-label/coaches')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar coaches gerenciados pelo white-label' })
  async listCoaches(@CurrentUser('id') ownerId: string) {
    return this.platformService.whiteLabelListCoaches(ownerId);
  }

  // ─── Admin ───────────────────────────────────────────────────────────────

  @Get('admin/subscriptions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: listar todas as assinaturas' })
  async listAllSubscriptions() {
    return this.platformService.listAllSubscriptions();
  }

  @Get('admin/revenue')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: visão geral de receita (MRR/ARR)' })
  async getRevenueOverview() {
    return this.platformService.getRevenueOverview();
  }

  @Put('admin/coaches/:coachId/plan')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: definir plano de um coach manualmente' })
  async adminSetPlan(
    @Param('coachId') coachId: string,
    @Body() body: AdminSetPlanDto,
  ) {
    return this.platformService.adminSetPlan(coachId, body.plan, body.status);
  }

  @Post('admin/seed-plans')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Admin: criar/atualizar planos no banco' })
  async seedPlans() {
    await this.platformService.seedPlans();
    return { ok: true };
  }
}
