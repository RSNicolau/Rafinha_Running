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
import { BadRequestException } from '@nestjs/common';
import { BrandingService } from '../branding.service';
import { PrismaService } from '../../../prisma/prisma.service';

// ── Prisma mock ────────────────────────────────────────────────────────────────

const mockPrisma = {
  tenantBranding: {
    findUnique: jest.fn(),
    upsert:     jest.fn(),
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
      ],
    }).compile();

    service = module.get<BrandingService>(BrandingService);
    jest.clearAllMocks();
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
    it('retorna branding pelo domínio quando encontrado', async () => {
      mockPrisma.tenantBranding.findUnique.mockResolvedValue({
        tenantName: 'Custom Coach', primaryColor: '#00FF00',
        secondaryColor: '#000', logoUrl: null, bannerUrl: null,
        welcomeMsg: 'Bem vindo', niche: 'crossfit',
      });

      const result = await service.getPublicBranding('custom.coach.com');
      expect(result.tenantName).toBe('Custom Coach');
      expect(result.niche).toBe('crossfit');
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

  // ── uploadFile ─────────────────────────────────────────────────────────────

  describe('uploadFile', () => {
    it('throws BadRequestException when Supabase env vars not set', async () => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;

      await expect(
        service.uploadFile('c1', { originalname: 'logo.png', buffer: Buffer.from(''), mimetype: 'image/png' } as any, 'logo'),
      ).rejects.toThrow(BadRequestException);

      process.env.SUPABASE_URL = originalUrl;
      process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
    });
  });
});
