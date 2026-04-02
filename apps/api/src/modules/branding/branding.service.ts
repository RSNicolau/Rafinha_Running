import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateBrandingDto } from './dto/branding.dto';

@Injectable()
export class BrandingService {
  constructor(private prisma: PrismaService) {}

  async getBranding(coachId: string) {
    const branding = await this.prisma.tenantBranding.findUnique({
      where: { coachId },
    });
    if (!branding) return this.getDefaults(coachId);
    return branding;
  }

  async getPublicBranding(domain?: string) {
    if (domain) {
      const branding = await this.prisma.tenantBranding.findUnique({
        where: { domain },
        select: { tenantName: true, primaryColor: true, logoUrl: true, welcomeMsg: true },
      });
      if (branding) return branding;
    }
    // Return default RR branding
    return {
      tenantName: 'Rafinha Running',
      primaryColor: '#DC2626',
      logoUrl: null,
      welcomeMsg: 'Entre para acessar seus treinos',
    };
  }

  async updateBranding(coachId: string, dto: UpdateBrandingDto) {
    return this.prisma.tenantBranding.upsert({
      where: { coachId },
      create: {
        coachId,
        tenantName: dto.tenantName || 'Minha Assessoria',
        primaryColor: dto.primaryColor || '#DC2626',
        logoUrl: dto.logoUrl,
        bannerUrl: dto.bannerUrl,
        domain: dto.domain,
        welcomeMsg: dto.welcomeMsg,
      },
      update: {
        ...(dto.tenantName && { tenantName: dto.tenantName }),
        ...(dto.primaryColor && { primaryColor: dto.primaryColor }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
        ...(dto.domain !== undefined && { domain: dto.domain }),
        ...(dto.welcomeMsg !== undefined && { welcomeMsg: dto.welcomeMsg }),
      },
    });
  }

  private getDefaults(coachId: string) {
    return {
      coachId,
      tenantName: 'Rafinha Running',
      primaryColor: '#DC2626',
      logoUrl: null,
      domain: null,
      welcomeMsg: null,
      isActive: true,
    };
  }
}
