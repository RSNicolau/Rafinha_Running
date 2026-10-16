import { Controller, Get, Put, Post, Body, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import { BrandingService } from './branding.service';
import { UpdateBrandingDto } from './dto/branding.dto';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@Controller('config/branding')
export class BrandingController {
  constructor(private brandingService: BrandingService) {}

  // Public — used by app on startup (no auth required)
  @Get('public')
  getPublic(@Query('domain') domain?: string) {
    return this.brandingService.getPublicBranding(domain);
  }

  // Coach — get own branding
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  getBranding(@CurrentUser('id') coachId: string) {
    return this.brandingService.getBranding(coachId);
  }

  // Coach — update own branding
  @Put()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  updateBranding(@CurrentUser('id') coachId: string, @Body() dto: UpdateBrandingDto) {
    return this.brandingService.updateBranding(coachId, dto);
  }

  // Coach — confere o registro TXT _rr-verify.<domínio> e ativa o domínio
  @Post('domain/verify')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  verifyDomain(@CurrentUser('id') coachId: string) {
    return this.brandingService.verifyDomain(coachId);
  }

  // Coach — upload logo or banner to Supabase Storage
  @Post('upload')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadFile(
    @CurrentUser('id') coachId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body('type') type: string,
  ) {
    if (!file) throw new BadRequestException('Arquivo não enviado');
    if (!['logo', 'banner'].includes(type)) throw new BadRequestException('type deve ser "logo" ou "banner"');
    return this.brandingService.uploadFile(coachId, file, type as 'logo' | 'banner');
  }
}
