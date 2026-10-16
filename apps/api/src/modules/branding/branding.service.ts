import { ConflictException, Injectable } from '@nestjs/common';
import {
  confirmDomainVerification, defaultTxtResolver, getPendingDomain, isUniqueViolation, normalizeDomain,
  requestDomainVerification, TxtResolver, verificationInstructions, verifiedOwner,
} from './domain-verification';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateBrandingDto } from './dto/branding.dto';
import { UploadsService } from '../uploads/uploads.service';
import { defaultTeamIdForUser } from '../teams/team-scope';

@Injectable()
export class BrandingService {
  constructor(
    private prisma: PrismaService,
    private uploads: UploadsService,
  ) {}

  /**
   * Branding do treinador. Membro de equipe sem branding próprio herda o do dono da equipe e,
   * na falta dele, nome/logo/cor da própria equipe.
   */
  /** Resolver de TXT (substituível em testes). */
  txtResolver: TxtResolver = defaultTxtResolver;

  async getBranding(coachId: string) {
    const branding = await this.prisma.tenantBranding.findUnique({
      where: { coachId },
    });
    if (branding) {
      const pending = await getPendingDomain(this.prisma, coachId).catch(() => null);
      return { ...branding, pendingDomain: pending ? verificationInstructions(pending) : null };
    }

    const teamId = await defaultTeamIdForUser(this.prisma, coachId).catch(() => null);
    if (teamId) {
      const team = await this.prisma.team.findUnique({
        where: { id: teamId },
        select: { ownerId: true, name: true, logoUrl: true, primaryColor: true },
      });
      if (team) {
        const ownerBranding = team.ownerId !== coachId
          ? await this.prisma.tenantBranding.findUnique({ where: { coachId: team.ownerId } })
          : null;
        if (ownerBranding) return { ...ownerBranding, inheritedFromTeam: true };
        return {
          ...this.getDefaults(coachId),
          tenantName: team.name,
          logoUrl: team.logoUrl ?? null,
          primaryColor: team.primaryColor ?? '#DC2626',
          inheritedFromTeam: true,
        };
      }
    }
    return this.getDefaults(coachId);
  }

  async getPublicBranding(domain?: string) {
    if (domain) {
      const d = normalizeDomain(domain);
      const branding = await this.prisma.tenantBranding.findUnique({
        where: { domain: d },
        select: { coachId: true, isActive: true, tenantName: true, primaryColor: true, secondaryColor: true, logoUrl: true, bannerUrl: true, welcomeMsg: true, niche: true },
      });
      // A7: só domínio com posse verificada (TXT) pela MESMA conta resolve a marca
      if (branding && branding.isActive !== false) {
        const owner = await verifiedOwner(this.prisma, d).catch(() => null);
        if (owner && owner.accountId === branding.coachId) {
          const { coachId: _c, isActive: _a, ...pub } = branding as any;
          return pub;
        }
      }
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

  /**
   * A7: o domínio NÃO é gravado direto — vira pedido de verificação (TXT `_rr-verify.<domínio>`).
   * Domínio vazio remove o domínio atual. Conflito → 409.
   */
  async updateBranding(coachId: string, dto: UpdateBrandingDto) {
    let pendingDomain: any = undefined;
    let domainUpdate: { domain: string | null } | null = null;
    if (dto.domain !== undefined) {
      const requested = normalizeDomain(dto.domain);
      const current = await this.prisma.tenantBranding.findUnique({ where: { coachId }, select: { domain: true } }).catch(() => null);
      if (!requested) {
        domainUpdate = { domain: null };
        await this.prisma.appConfig?.delete?.({ where: { key: `domain-verify:${coachId}` } }).catch(() => undefined);
      } else if (requested !== current?.domain) {
        // verificado por outra conta → 409 (dentro do helper); reivindicação NÃO verificada de terceiros não bloqueia
        pendingDomain = await requestDomainVerification(this.prisma, coachId, 'branding', requested);
      }
    }
    const { domain: _ignored, ...rest } = dto;
    try {
      const saved = await this.upsertBranding(coachId, rest, domainUpdate);
      return pendingDomain !== undefined ? { ...saved, pendingDomain } : saved;
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Este domínio já está em uso por outra conta');
      throw e;
    }
  }

  /** Confere o TXT e ativa o domínio (o verificado assume o domínio, mesmo se outro o reivindicou sem verificar). */
  async verifyDomain(coachId: string) {
    const domain = await confirmDomainVerification(this.prisma, coachId, this.txtResolver);
    await this.prisma.tenantBranding.updateMany({ where: { domain, coachId: { not: coachId } }, data: { domain: null } });
    try {
      const saved = await this.upsertBranding(coachId, {}, { domain });
      return { ...saved, pendingDomain: null, verified: true };
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Este domínio já está em uso por outra conta');
      throw e;
    }
  }

  /**
   * N2: nome padrão ao criar o branding sem tenantName (ex.: salvar só o domínio) — nome da equipe principal
   * do treinador; senão o nome dele; 'Minha Assessoria' só em último caso.
   */
  private async defaultTenantName(coachId: string): Promise<string> {
    try {
      const teamId = await defaultTeamIdForUser(this.prisma, coachId).catch(() => null);
      if (teamId && this.prisma.team?.findUnique) {
        const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { name: true } });
        if (team?.name?.trim()) return team.name.trim();
      }
      const owned = await this.prisma.team?.findFirst?.({ where: { ownerId: coachId }, select: { name: true }, orderBy: { createdAt: 'asc' } });
      if (owned?.name?.trim()) return owned.name.trim();
      const user = await this.prisma.user?.findUnique?.({ where: { id: coachId }, select: { name: true } });
      if (user?.name?.trim()) return user.name.trim();
    } catch {
      /* cai no padrão */
    }
    return 'Minha Assessoria';
  }

  private async upsertBranding(coachId: string, dto: Omit<UpdateBrandingDto, 'domain'>, domainUpdate: { domain: string | null } | null) {
    let tenantName = dto.tenantName;
    if (!tenantName) {
      const existing = await this.prisma.tenantBranding.findUnique({ where: { coachId }, select: { id: true } });
      if (!existing) tenantName = await this.defaultTenantName(coachId);
    }
    return this.prisma.tenantBranding.upsert({
      where: { coachId },
      create: {
        coachId,
        tenantName: tenantName || 'Minha Assessoria',
        primaryColor: dto.primaryColor || '#DC2626',
        secondaryColor: dto.secondaryColor || '#1F2937',
        niche: dto.niche || 'running',
        logoUrl: dto.logoUrl,
        bannerUrl: dto.bannerUrl,
        domain: domainUpdate?.domain ?? null,
        welcomeMsg: dto.welcomeMsg,
      },
      update: {
        ...(dto.tenantName && { tenantName: dto.tenantName }),
        ...(dto.primaryColor && { primaryColor: dto.primaryColor }),
        ...(dto.secondaryColor !== undefined && { secondaryColor: dto.secondaryColor }),
        ...(dto.niche !== undefined && { niche: dto.niche }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.bannerUrl !== undefined && { bannerUrl: dto.bannerUrl }),
        ...(domainUpdate ? { domain: domainUpdate.domain } : {}),
        ...(dto.welcomeMsg !== undefined && { welcomeMsg: dto.welcomeMsg }),
      },
    });
  }

  /**
   * Upload de logo/banner. Tipo validado por magic bytes (jpeg/png/webp, ≤5MB), extensão derivada do tipo.
   * Supabase (bucket público 'branding') ou disco local (UPLOADS_DIR) quando SUPABASE_URL não está configurado.
   */
  async uploadFile(coachId: string, file: Express.Multer.File, type: 'logo' | 'banner'): Promise<{ url: string }> {
    const folder = type === 'logo' ? 'logos' : 'banners';
    const url = await this.uploads.uploadPublicImage(file, `branding/${folder}/${coachId}`, 'branding');
    return { url };
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
