import { Injectable, BadRequestException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
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
        select: { tenantName: true, primaryColor: true, secondaryColor: true, logoUrl: true, bannerUrl: true, welcomeMsg: true, niche: true },
      });
      if (branding) return branding;
    }
    return {
      tenantName: 'Rafinha Running',
      primaryColor: '#DC2626',
      secondaryColor: '#1F2937',
      logoUrl: null,
      bannerUrl: null,
      welcomeMsg: 'Entre para acessar seus treinos',
      niche: 'running',
    };
  }

  async updateBranding(coachId: string, dto: UpdateBrandingDto) {
    return this.prisma.tenantBranding.upsert({
      where: { coachId },
      create: {
        coachId,
        tenantName: dto.tenantName || 'Minha Assessoria',
        primaryColor: dto.primaryColor || '#DC2626',
        secondaryColor: dto.secondaryColor || '#1F2937',
        niche: dto.niche || 'running',
        logoUrl: dto.logoUrl,
        bannerUrl: dto.bannerUrl,
        domain: dto.domain,
        welcomeMsg: dto.welcomeMsg,
      },
      update: {
        ...(dto.tenantName && { tenantName: dto.tenantName }),
        ...(dto.primaryColor && { primaryColor: dto.primaryColor }),
        ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
        ...(dto.niche !== undefined && { niche: dto.niche }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
        ...(dto.domain !== undefined && { domain: dto.domain }),
        ...(dto.welcomeMsg !== undefined && { welcomeMsg: dto.welcomeMsg }),
      },
    });
  }

  async uploadFile(coachId: string, file: Express.Multer.File, type: 'logo' | 'banner'): Promise<{ url: string }> {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new BadRequestException('Supabase storage não configurado');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const folder = type === 'logo' ? 'logos' : 'banners';
    const ext = file.originalname.split('.').pop() || 'jpg';
    const path = `${folder}/${coachId}.${ext}`;

    const { error } = await supabase.storage
      .from('branding')
      .upload(path, file.buffer, { contentType: file.mimetype, upsert: true });

    if (error) throw new BadRequestException(`Erro ao fazer upload: ${error.message}`);

    const { data } = supabase.storage.from('branding').getPublicUrl(path);
    return { url: data.publicUrl };
  }

  private getDefaults(coachId: string) {
    return {
      coachId,
      tenantName: 'Rafinha Running',
      primaryColor: '#DC2626',
      secondaryColor: '#1F2937',
      niche: 'running',
      logoUrl: null,
      bannerUrl: null,
      domain: null,
      welcomeMsg: null,
      isActive: true,
    };
  }
}
