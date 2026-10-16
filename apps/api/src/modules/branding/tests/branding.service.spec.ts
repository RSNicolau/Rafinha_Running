/**
 * Unit tests for BrandingService
 *
 * Critical paths:
 *  - getBranding: returns DB record or defaults when not set
 *  - getPublicBranding: looks up by domain, falls back to RR defaults
 *  - updateBranding: upserts with all fields
 *  - uploadFile: throws when Supabase env vars missing
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { BrandingService } from '../branding.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { UploadsService } from '../../uploads/uploads.service';

// ── Prisma mock ────────────────────────────────────────────────────────────────

const configStore = new Map<string, any>();
const mockPrisma: any = {
  tenantBranding: {
    findUnique: jest.fn(),
    upsert:     jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  appConfig: {
    findUnique: jest.fn(async ({ where }: any) => (configStore.has(where.key) ? { key: where.key, value: configStore.get(where.key) } : null)),
    upsert: jest.fn(async ({ where, create, update }: any) => {
      configStore.set(where.key, configStore.has(where.key) ? update.value : create.value);
      return {};
    }),
    delete: jest.fn(async ({ where }: any) => { configStore.delete(where.key); return {}; }),
  },
};

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('BrandingService', () => {
  let service: BrandingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrandingService,
        { provide: PrismaService, useValue: mockPrisma },
        UploadsService,
      ],
    }).compile();

    service = module.get<BrandingService>(BrandingService);
    jest.clearAllMocks();
    configStore.clear();
  });

  // ── getBranding ────────────────────────────────────────────────────────────

  describe('getBranding', () => {
    it('retorna configuração do banco quando existe', async () => {
      const mockBranding = {
        id: 'b1', coachId: 'c1', tenantName: 'Minha Assessoria',
        primaryColor: '#FF0000', niche: 'running', isActive: true,
      };
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(mockBranding);

      const result = await service.getBranding('c1');
      expect(result.tenantName).toBe('Minha Assessoria');
      expect(result.primaryColor).toBe('#FF0000');
    });

    it('retorna defaults quando branding não configurado', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);

      const result = await service.getBranding('c-new') as any;
      expect(result.tenantName).toBe('Rafinha Running');
      expect(result.primaryColor).toBe('#DC2626');
      expect(result.coachId).toBe('c-new');
    });
  });

  // ── getPublicBranding ──────────────────────────────────────────────────────

  describe('getPublicBranding', () => {
    it('retorna branding pelo domínio quando a posse foi verificada pela mesma conta', async () => {
      configStore.set('domain-verified:custom.coach.com', { accountId: 'c1', kind: 'branding' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({
        coachId: 'c1', isActive: true,
        tenantName: 'Custom Coach', primaryColor: '#00FF00',
        secondaryColor: '#000', logoUrl: null, bannerUrl: null,
        welcomeMsg: 'Bem vindo', niche: 'crossfit',
      });

      const result: any = await service.getPublicBranding('Custom.Coach.com');
      expect(result.tenantName).toBe('Custom Coach');
      expect(result.niche).toBe('crossfit');
      expect(result.coachId).toBeUndefined();
    });

    it('A7: domínio gravado sem verificação NÃO resolve a marca (fica RR padrão)', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({ coachId: 'intruso', isActive: true, tenantName: 'Equipe Dois Branding' });
      const result = await service.getPublicBranding('app.rafinharunning.com.br');
      expect(result.tenantName).toBe('Rafinha Running');
    });

    it('retorna defaults RR quando domínio não encontrado', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);

      const result = await service.getPublicBranding('unknown.com');
      expect(result.tenantName).toBe('Rafinha Running');
      expect(result.primaryColor).toBe('#DC2626');
    });

    it('retorna defaults RR quando nenhum domínio fornecido', async () => {
      const result = await service.getPublicBranding();
      expect(result.tenantName).toBe('Rafinha Running');
    });
  });

  // ── updateBranding ─────────────────────────────────────────────────────────

  describe('updateBranding', () => {
    it('faz upsert com todos os campos fornecidos', async () => {
      const updated = {
        id: 'b1', coachId: 'c1', tenantName: 'Novo Nome',
        primaryColor: '#123456', secondaryColor: '#654321', niche: 'cycling',
      };
      mockPrisma.tenantBranding.upsert.mockResolvedValue(updated);

      const result = await service.updateBranding('c1', {
        tenantName: 'Novo Nome',
        primaryColor: '#123456',
        secondaryColor: '#654321',
        niche: 'cycling',
      }) as any;

      expect(mockPrisma.tenantBranding.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { coachId: 'c1' } }),
      );
      expect(result.tenantName).toBe('Novo Nome');
    });
  });

  // ── A7: verificação de domínio ─────────────────────────────────────────────

  describe('domínio white-label (A7)', () => {
    it('PUT com domínio não grava o domínio: cria pedido pendente com token TXT', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.tenantBranding.upsert.mockImplementation(async ({ create }: any) => create);
      const r: any = await service.updateBranding('c2', { domain: 'App.RafinhaRunning.com.br' });
      const call = mockPrisma.tenantBranding.upsert.mock.calls[0][0];
      expect(call.create.domain).toBeNull();
      expect(call.update.domain).toBeUndefined();
      expect(r.pendingDomain.txtName).toBe('_rr-verify.app.rafinharunning.com.br');
      expect(r.pendingDomain.txtValue).toMatch(/^rr-verify=[0-9a-f]{32}$/);
    });

    it('N2: salvar só o domínio cria o branding com o nome da equipe (não "Minha Assessoria")', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.tenantBranding.upsert.mockImplementation(async ({ create }: any) => create);
      mockPrisma.teamMember = { findMany: jest.fn().mockResolvedValue([{ teamId: 't1', role: 'OWNER', createdAt: new Date() }]) };
      mockPrisma.team = { findUnique: jest.fn().mockResolvedValue({ name: 'Rafinha Running Team' }), findFirst: jest.fn() };
      try {
        await service.updateBranding('c3', { domain: 'app.exemplo.com.br' });
        const call = mockPrisma.tenantBranding.upsert.mock.calls[0][0];
        expect(call.create.tenantName).toBe('Rafinha Running Team');
        expect(call.update.tenantName).toBeUndefined();
      } finally {
        delete mockPrisma.teamMember;
        delete mockPrisma.team;
      }
    });

    it('domínio verificado por outra conta → 409 (não 500)', async () => {
      configStore.set('domain-verified:app.rafinharunning.com.br', { accountId: 'rafinha', kind: 'branding' });
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      await expect(service.updateBranding('intruso', { domain: 'app.rafinharunning.com.br' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('violação de unicidade do banco vira 409', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.tenantBranding.upsert.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(service.updateBranding('c2', { tenantName: 'X' })).rejects.toBeInstanceOf(ConflictException);
    });

    it('verify: TXT ausente → 400; TXT correto ativa o domínio e tira de quem o reivindicou sem verificar', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue(null);
      mockPrisma.tenantBranding.upsert.mockImplementation(async (a: any) => ({ ...a.create, ...a.update }));
      const r: any = await service.updateBranding('rafinha', { domain: 'app.rafinharunning.com.br' });
      service.txtResolver = jest.fn().mockResolvedValue([['outra-coisa']]);
      await expect(service.verifyDomain('rafinha')).rejects.toBeInstanceOf(BadRequestException);

      service.txtResolver = jest.fn().mockResolvedValue([[r.pendingDomain.txtValue.slice(0, 10), r.pendingDomain.txtValue.slice(10)]]);
      const ok: any = await service.verifyDomain('rafinha');
      expect(service.txtResolver).toHaveBeenCalledWith('_rr-verify.app.rafinharunning.com.br');
      expect(ok.verified).toBe(true);
      expect(mockPrisma.tenantBranding.updateMany).toHaveBeenCalledWith({ where: { domain: 'app.rafinharunning.com.br', coachId: { not: 'rafinha' } }, data: { domain: null } });
      const last = mockPrisma.tenantBranding.upsert.mock.calls.at(-1)[0];
      expect(last.update.domain).toBe('app.rafinharunning.com.br');
      expect(configStore.get('domain-verified:app.rafinharunning.com.br')).toMatchObject({ accountId: 'rafinha' });
      expect(configStore.has('domain-verify:rafinha')).toBe(false);
    });
  });

  // ── uploadFile ─────────────────────────────────────────────────────────────

  describe('uploadFile', () => {
    it('rejeita arquivo que não é imagem (magic bytes), mesmo com extensão/mimetype de imagem', async () => {
      await expect(
        service.uploadFile('c1', { originalname: 'logo.png', buffer: Buffer.from('<svg onload=alert(1)>........'), mimetype: 'image/png', size: 30 } as any, 'logo'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
