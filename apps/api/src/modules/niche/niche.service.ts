import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, SportNiche } from '@prisma/client';
import {
  getNicheConfig, NICHE_CONFIGS,
  calculateCyclingPowerZones, calculateSwimCSS, calculateSwimZones,
} from './niche.constants';

@Injectable()
export class NicheService {
  constructor(private prisma: PrismaService) {}

  /** Return all niche options (for onboarding selection) */
  listNiches() {
    return Object.values(NICHE_CONFIGS).map(({ key, label, icon, description, color, primaryMetric, features, integrations, pricing }) => ({
      key, label, icon, description, color, primaryMetric, features, integrations,
      monthlyPrice: pricing.monthly.priceInCents,
    }));
  }

  /** Return full config for a specific niche */
  getNicheDetails(niche: SportNiche) {
    return getNicheConfig(niche);
  }

  /** Return question templates for a niche */
  getQuestionTemplates(niche: SportNiche) {
    return getNicheConfig(niche).questionTemplates;
  }

  /** Get coach's current niche */
  async getCoachNiche(coachId: string): Promise<SportNiche> {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId: coachId },
      select: { niche: true },
    });
    return profile?.niche ?? SportNiche.RUNNING;
  }

  /** Update coach's niche and optionally seed onboarding form with niche questions */
  async updateCoachNiche(coachId: string, niche: SportNiche, seedQuestions = true) {
    // Update coach profile niche
    await this.prisma.coachProfile.upsert({
      where: { userId: coachId },
      create: { userId: coachId, niche },
      update: { niche },
    });

    // Update onboarding form niche
    const form = await this.prisma.onboardingForm.findUnique({ where: { coachId } });
    if (form) {
      await this.prisma.onboardingForm.update({
        where: { coachId },
        data: { niche },
      });

      // Optionally seed new questions based on niche
      if (seedQuestions) {
        await this.seedNicheQuestions(form.id, niche);
      }
    }

    return { niche, config: getNicheConfig(niche) };
  }

  /** Seed onboarding form with niche-specific question templates */
  async seedNicheQuestions(formId: string, niche: SportNiche) {
    const templates = getNicheConfig(niche).questionTemplates;

    // Remove existing questions
    await this.prisma.onboardingQuestion.deleteMany({ where: { formId } });

    // Create new questions from templates
    await this.prisma.onboardingQuestion.createMany({
      data: templates.map((t) => ({
        formId,
        order: t.order,
        question: t.question,
        type: t.type as any,
        options: t.options ? t.options : Prisma.JsonNull,
        required: t.required,
        placeholder: t.placeholder ?? null,
        aiHint: t.aiHint ?? null,
      })),
    });

    return templates.length;
  }

  /** Calculate cycling power zones from FTP */
  calculatePowerZones(ftp: number) {
    return {
      ftp,
      wPerKg: null as number | null, // needs weight
      zones: calculateCyclingPowerZones(ftp),
    };
  }

  /** Calculate swimming zones from CSS */
  calculateSwimmingZones(best100mSeconds: number, best400mSeconds: number) {
    const cssSeconds = calculateSwimCSS(best100mSeconds, best400mSeconds);
    return {
      cssSeconds,
      cssPace: this.formatPace(cssSeconds),
      zones: calculateSwimZones(cssSeconds),
    };
  }

  /** Get niche-specific pricing options */
  getNichePricing(niche: SportNiche) {
    return getNicheConfig(niche).pricing;
  }

  private formatPace(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
