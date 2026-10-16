import { Controller, Get, Put, Post, Delete, Patch, Body, Query, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  UpdateUserRoleDto,
  SetUserPasswordDto,
  SetUserPasswordByEmailDto,
  SetCoachSlugDto,
  SetCoachPlatformFeeDto,
} from './dto/admin.dto';

/**
 * Rotas herdam @Roles(ADMIN) da classe (ADMIN e SUPER_ADMIN passam).
 * Rotas com @Roles(SUPER_ADMIN) são exclusivas de SUPER_ADMIN (ver RolesGuard).
 * Ações sobre contas SUPER_ADMIN (desativar/excluir) são bloqueadas para ADMIN no AdminService.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Listar usuários' })
  async getUsers(@Query('page') page?: number, @Query('limit') limit?: number, @Query('search') search?: string) {
    return this.adminService.getUsers(page, limit, search);
  }

  @Delete('users/:id')
  @ApiOperation({ summary: 'Desativar usuário (soft delete)' })
  async deleteUser(@Param('id') id: string, @CurrentUser() actor: { id: string; role: UserRole }) {
    return this.adminService.deleteUser(id, actor);
  }

  @Delete('users/:id/hard')
  @ApiOperation({ summary: 'Deletar usuário permanentemente' })
  async hardDeleteUser(@Param('id') id: string, @CurrentUser() actor: { id: string; role: UserRole }) {
    return this.adminService.hardDeleteUser(id, actor);
  }

  @Patch('users/:id/role')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar role do usuário (SUPER_ADMIN)' })
  async updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() actor: { id: string; role: UserRole },
  ) {
    return this.adminService.updateUserRole(id, dto.role, actor);
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Dashboard de analytics' })
  async getAnalytics() {
    return this.adminService.getAnalytics();
  }

  @Get('config/theme')
  @ApiOperation({ summary: 'Obter configuração de tema' })
  async getTheme() {
    return this.adminService.getThemeConfig();
  }

  @Put('config/theme')
  @ApiOperation({ summary: 'Atualizar tema' })
  async updateTheme(@Body() theme: Record<string, any>) {
    return this.adminService.updateThemeConfig(theme);
  }

  @Get('config/plans')
  @ApiOperation({ summary: 'Obter configuração de planos e preços' })
  async getPlans() {
    return this.adminService.getPlansConfig();
  }

  @Put('config/plans')
  @ApiOperation({ summary: 'Atualizar planos e preços' })
  async updatePlans(@Body() plans: Record<string, any>) {
    return this.adminService.updatePlansConfig(plans);
  }

  @Patch('users/:id/coach-slug')
  @ApiOperation({ summary: 'Definir slug do perfil de coach (SUPER_ADMIN)' })
  async setCoachSlug(@Param('id') id: string, @Body() dto: SetCoachSlugDto) {
    return this.adminService.setCoachSlug(id, dto.slug);
  }

  @Post('users/:id/activate-subscription')
  @ApiOperation({ summary: 'Ativar assinatura manual para teste (sem pagamento)' })
  async activateSubscription(@Param('id') userId: string) {
    return this.adminService.activateManualSubscription(userId);
  }

  @Patch('users/by-email/password')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Definir senha por email (SUPER_ADMIN)' })
  async setUserPasswordByEmail(
    @Body() dto: SetUserPasswordByEmailDto,
    @CurrentUser() actor: { id: string; role: UserRole },
  ) {
    return this.adminService.setUserPasswordByEmail(dto.email, dto.password, actor);
  }

  @Patch('users/:id/password')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Definir senha de qualquer usuário (SUPER_ADMIN)' })
  async setUserPassword(
    @Param('id') id: string,
    @Body() dto: SetUserPasswordDto,
    @CurrentUser() actor: { id: string; role: UserRole },
  ) {
    return this.adminService.setUserPassword(id, dto.password, actor);
  }

  // ── Platform / Split Payments ──

  @Get('coaches')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar todos os coaches com stats' })
  async getCoaches() {
    return this.adminService.getCoaches();
  }

  @Get('platform-stats')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Estatísticas gerais da plataforma' })
  async getPlatformStats() {
    return this.adminService.getPlatformStats();
  }

  @Patch('coaches/:id/platform-fee')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Definir % de split da plataforma para um coach' })
  async setCoachPlatformFee(
    @Param('id') id: string,
    @Body() dto: SetCoachPlatformFeeDto,
  ) {
    return this.adminService.setCoachPlatformFee(id, dto.platformFeePercent);
  }

  @Patch('coaches/:id/status')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Ativar/desativar coach' })
  async setCoachStatus(
    @Param('id') id: string,
    @Body('isActive') isActive: boolean,
    @CurrentUser() actor: { id: string; role: UserRole },
  ) {
    return this.adminService.setUserActiveStatus(id, isActive === true, actor);
  }
}
