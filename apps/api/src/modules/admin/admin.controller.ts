import { Controller, Get, Put, Post, Delete, Patch, Body, Query, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

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
  async deleteUser(@Param('id') id: string) {
    return this.adminService.deleteUser(id);
  }

  @Delete('users/:id/hard')
  @ApiOperation({ summary: 'Deletar usuário permanentemente' })
  async hardDeleteUser(@Param('id') id: string) {
    return this.adminService.hardDeleteUser(id);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Atualizar role do usuário' })
  async updateRole(@Param('id') id: string, @Body('role') role: UserRole) {
    return this.adminService.updateUserRole(id, role);
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
  async setCoachSlug(@Param('id') id: string, @Body('slug') slug: string) {
    return this.adminService.setCoachSlug(id, slug);
  }

  @Post('users/:id/activate-subscription')
  @ApiOperation({ summary: 'Ativar assinatura manual para teste (sem pagamento)' })
  async activateSubscription(@Param('id') userId: string) {
    return this.adminService.activateManualSubscription(userId);
  }

  @Patch('users/by-email/password')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Definir senha por email (SUPER_ADMIN)' })
  async setUserPasswordByEmail(@Body('email') email: string, @Body('password') password: string) {
    return this.adminService.setUserPasswordByEmail(email, password);
  }

  @Patch('users/:id/password')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Definir senha de qualquer usuário (SUPER_ADMIN)' })
  async setUserPassword(@Param('id') id: string, @Body('password') password: string) {
    return this.adminService.setUserPassword(id, password);
  }
}
