import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import { generatePredictions } from './riegel';

type HRZones = Record<string, { min: number; max: number; label: string }>;
type PaceZones = Record<string, string>;

@Injectable()
export class PhysicalAssessmentsService {
  private readonly logger = new Logger(PhysicalAssessmentsService.name);
  private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  constructor(private prisma: PrismaService) {}

  // ──────────────────────────────────────
  // Create assessment
  // ──────────────────────────────────────

  async create(coachId: string, data: {
    athleteId: string;
    assessedAt?: Date;
    weightKg?: number;
    heightCm?: number;
    bodyFatPct?: number;
    muscleMassPct?: number;
    restingHR?: number;
    maxHR?: number;
    vo2max?: number;
    best5kTime?: number;
    best10kTime?: number;
    flexScore?: number;
    strengthScore?: number;
    coachNotes?: string;
  }) {
    // Verify coach has access to athlete
    const athlete = await this.prisma.user.findFirst({
      where: { id: data.athleteId, athleteProfile: { coachId } },
    });
    if (!athlete) throw new NotFoundException('Atleta não encontrado');

    // Compute derived fields
    const bmi = data.weightKg && data.heightCm
      ? data.weightKg / Math.pow(data.heightCm / 100, 2)
      : undefined;

    const vdot = this.calculateVDOT(data.best5kTime, data.best10kTime);

    const maxHRFinal = data.maxHR ?? (athlete.dateOfBirth
      ? this.estimateMaxHR(athlete.dateOfBirth)
      : undefined);

    const hrZones = maxHRFinal ? this.calculateHRZones(maxHRFinal) : undefined;
    const paceZones = vdot ? this.calculatePaceZones(vdot) : undefined;

    const assessment = await this.prisma.physicalAssessment.create({
      data: {
        athleteId: data.athleteId,
        coachId,
        assessedAt: data.assessedAt ?? new Date(),
        weightKg: data.weightKg,
        heightCm: data.heightCm,
        bmi: bmi ? parseFloat(bmi.toFixed(2)) : undefined,
        bodyFatPct: data.bodyFatPct,
        muscleMassPct: data.muscleMassPct,
        restingHR: data.restingHR,
        maxHR: maxHRFinal,
        vo2max: data.vo2max,
        best5kTime: data.best5kTime,
        best10kTime: data.best10kTime,
        vdot: vdot ? parseFloat(vdot.toFixed(1)) : undefined,
        flexScore: data.flexScore,
        strengthScore: data.strengthScore,
        hrZones: hrZones ?? undefined,
        paceZones: paceZones ?? undefined,
        coachNotes: data.coachNotes,
      },
      include: { athlete: { select: { name: true } } },
    });

    // Fire-and-forget AI analysis if we have enough data
    if (vdot || data.vo2max) {
      this.generateAIAnalysis(assessment.id, coachId).catch(err =>
        this.logger.error(`AI assessment analysis failed: ${err.message}`),
      );
    }

    return assessment;
  }

  // ──────────────────────────────────────
  // Get athlete history
  // ──────────────────────────────────────

  async getHistory(requesterId: string, athleteId: string, asCoach: boolean) {
    if (asCoach) {
      const athlete = await this.prisma.user.findFirst({
        where: { id: athleteId, athleteProfile: { coachId: requesterId } },
      });
      if (!athlete) throw new NotFoundException('Atleta não encontrado');
    } else {
      // Athlete requesting their own
      if (requesterId !== athleteId) throw new NotFoundException('Acesso negado');
    }

    const assessments = await this.prisma.physicalAssessment.findMany({
      where: { athleteId },
      orderBy: { assessedAt: 'desc' },
    });

    return assessments.map(a => {
      if (a.best5kTime) {
        (a as any).riegelPredictions = generatePredictions(a.best5kTime, 5);
      } else if (a.best10kTime) {
        (a as any).riegelPredictions = generatePredictions(a.best10kTime, 10);
      }
      return a;
    });
  }

  async getById(requesterId: string, assessmentId: string, asCoach: boolean) {
    const assessment = await this.prisma.physicalAssessment.findUnique({
      where: { id: assessmentId },
      include: { athlete: { select: { id: true, name: true, email: true } } },
    });

    if (!assessment) throw new NotFoundException('Avaliação não encontrada');

    if (asCoach) {
      if (assessment.coachId !== requesterId) throw new NotFoundException('Avaliação não encontrada');
    } else {
      if (assessment.athleteId !== requesterId) throw new NotFoundException('Acesso negado');
    }

    // Append Riegel race-time predictions when best time data is available
    if (assessment.best5kTime) {
      (assessment as any).riegelPredictions = generatePredictions(assessment.best5kTime, 5);
    } else if (assessment.best10kTime) {
      (assessment as any).riegelPredictions = generatePredictions(assessment.best10kTime, 10);
    }

    return assessment;
  }

  async update(coachId: string, assessmentId: string, data: Partial<{
    assessedAt: Date;
    weightKg: number;
    heightCm: number;
    bodyFatPct: number;
    muscleMassPct: number;
    restingHR: number;
    maxHR: number;
    vo2max: number;
    best5kTime: number;
    best10kTime: number;
    flexScore: number;
    strengthScore: number;
    coachNotes: string;
    aiAnalysis: string;
  }>) {
    const assessment = await this.prisma.physicalAssessment.findFirst({
      where: { id: assessmentId, coachId },
    });
    if (!assessment) throw new NotFoundException('Avaliação não encontrada');

    const bmi = data.weightKg && data.heightCm
      ? parseFloat((data.weightKg / Math.pow(data.heightCm / 100, 2)).toFixed(2))
      : undefined;

    const vdot = this.calculateVDOT(
      data.best5kTime ?? assessment.best5kTime ?? undefined,
      data.best10kTime ?? assessment.best10kTime ?? undefined,
    );

    const maxHR = data.maxHR ?? assessment.maxHR ?? undefined;
    const hrZones = maxHR ? this.calculateHRZones(maxHR) : undefined;
    const paceZones = vdot ? this.calculatePaceZones(vdot) : undefined;

    return this.prisma.physicalAssessment.update({
      where: { id: assessmentId },
      data: {
        ...data,
        bmi: bmi ?? undefined,
        vdot: vdot ? parseFloat(vdot.toFixed(1)) : undefined,
        hrZones: hrZones ?? undefined,
        paceZones: paceZones ?? undefined,
      },
    });
  }

  // ──────────────────────────────────────
  // AI comparison
  // ──────────────────────────────────────

  async compareWithAI(coachId: string, athleteId: string) {
    const athlete = await this.prisma.user.findFirst({
      where: { id: athleteId, athleteProfile: { coachId } },
    });
    if (!athlete) throw new NotFoundException('Atleta não encontrado');

    const assessments = await this.prisma.physicalAssessment.findMany({
      where: { athleteId, coachId },
      orderBy: { assessedAt: 'desc' },
      take: 2,
    });

    if (assessments.length < 2) {
      return { analysis: null, message: 'São necessárias ao menos 2 avaliações para comparar.' };
    }

    const [latest, previous] = assessments;

    const prompt = `Você é um especialista em treinamento de corrida. Compare as duas avaliações físicas de ${athlete.name} e gere uma análise detalhada em português.

Avaliação anterior (${previous.assessedAt.toLocaleDateString('pt-BR')}):
${this.formatAssessment(previous)}

Avaliação mais recente (${latest.assessedAt.toLocaleDateString('pt-BR')}):
${this.formatAssessment(latest)}

Gere um parágrafo detalhado sobre:
1. Evolução nos indicadores principais (peso, VO2max, FC repouso, tempos de prova)
2. O que isso significa para o desempenho do atleta
3. Recomendações para próximo ciclo de treinamento
4. Alertas se houver regressão em algum indicador

Seja técnico, preciso e motivador. Mencione valores específicos.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = response.choices[0]?.message?.content ?? '';

    // Save analysis on latest assessment
    await this.prisma.physicalAssessment.update({
      where: { id: latest.id },
      data: { aiAnalysis: analysis },
    });

    return { analysis, latestId: latest.id, previousId: previous.id };
  }

  private async generateAIAnalysis(assessmentId: string, coachId: string) {
    const assessment = await this.prisma.physicalAssessment.findUnique({
      where: { id: assessmentId },
      include: { athlete: { select: { name: true } } },
    });
    if (!assessment) return;

    // Check if there's a previous assessment to compare
    const previous = await this.prisma.physicalAssessment.findFirst({
      where: { athleteId: assessment.athleteId, id: { not: assessmentId } },
      orderBy: { assessedAt: 'desc' },
    });

    let prompt: string;
    if (previous) {
      prompt = `Analise a evolução de ${assessment.athlete.name}:

Avaliação anterior (${previous.assessedAt.toLocaleDateString('pt-BR')}):
${this.formatAssessment(previous)}

Avaliação atual (${assessment.assessedAt.toLocaleDateString('pt-BR')}):
${this.formatAssessment(assessment)}

Gere uma análise comparativa objetiva em 2-3 frases, destacando as principais mudanças.`;
    } else {
      prompt = `Analise o perfil físico inicial de ${assessment.athlete.name}:
${this.formatAssessment(assessment)}

Gere uma análise objetiva em 2-3 frases com os pontos-chave do perfil atual.`;
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const analysis = response.choices[0]?.message?.content ?? '';

    await this.prisma.physicalAssessment.update({
      where: { id: assessmentId },
      data: { aiAnalysis: analysis },
    });
  }

  // ──────────────────────────────────────
  // Calculation helpers
  // ──────────────────────────────────────

  private calculateVDOT(best5kSeconds?: number | null, best10kSeconds?: number | null): number | null {
    // Jack Daniels VDOT formula
    if (best5kSeconds) {
      const t = best5kSeconds / 60; // time in minutes
      const d = 5000; // meters
      const velocity = d / t; // meters per minute
      const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
      const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * Math.pow(velocity, 2);
      return vo2 / pctMax;
    }
    if (best10kSeconds) {
      const t = best10kSeconds / 60;
      const d = 10000;
      const velocity = d / t;
      const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
      const vo2 = -4.60 + 0.182258 * velocity + 0.000104 * Math.pow(velocity, 2);
      return vo2 / pctMax;
    }
    return null;
  }

  private estimateMaxHR(dateOfBirth: Date): number {
    const age = new Date().getFullYear() - new Date(dateOfBirth).getFullYear();
    return 220 - age; // Haskell & Fox formula
  }

  private calculateHRZones(maxHR: number): HRZones {
    return {
      z1: { min: Math.round(maxHR * 0.50), max: Math.round(maxHR * 0.60), label: 'Recuperação' },
      z2: { min: Math.round(maxHR * 0.60), max: Math.round(maxHR * 0.70), label: 'Aeróbico leve' },
      z3: { min: Math.round(maxHR * 0.70), max: Math.round(maxHR * 0.80), label: 'Aeróbico' },
      z4: { min: Math.round(maxHR * 0.80), max: Math.round(maxHR * 0.90), label: 'Limiar' },
      z5: { min: Math.round(maxHR * 0.90), max: maxHR, label: 'Máximo' },
    };
  }

  private calculatePaceZones(vdot: number): PaceZones {
    // Easy pace: 59-74% VO2max → approx 1.3-1.5x race pace
    const easyPaceSecKm = this.vdotToPaceSeconds(vdot * 0.65);
    const aerobicPaceSecKm = this.vdotToPaceSeconds(vdot * 0.75);
    const tempoPaceSecKm = this.vdotToPaceSeconds(vdot * 0.88);
    const intervalPaceSecKm = this.vdotToPaceSeconds(vdot * 0.98);
    const repPaceSecKm = this.vdotToPaceSeconds(vdot * 1.05);

    return {
      z1: this.secondsToMMSS(easyPaceSecKm * 1.2),
      z2: this.secondsToMMSS(easyPaceSecKm),
      z3: this.secondsToMMSS(aerobicPaceSecKm),
      z4: this.secondsToMMSS(tempoPaceSecKm),
      z5: this.secondsToMMSS(intervalPaceSecKm),
    };
  }

  private vdotToPaceSeconds(vdot: number): number {
    // Approximate: pace (sec/km) from VO2 percentage
    // Using Jack Daniels velocity formula: v = (VDOT + 4.60) / (0.182258 + 0.000104 * v)
    // Simplified: v (m/min) ≈ VDOT * 2.525 (rough approximation)
    const velocityMperMin = (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (vdot + 4.60))) / (2 * 0.000104);
    return (1000 / velocityMperMin) * 60; // seconds per km
  }

  private secondsToMMSS(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private formatAssessment(a: any): string {
    const lines: string[] = [];
    if (a.weightKg) lines.push(`Peso: ${a.weightKg}kg`);
    if (a.heightCm) lines.push(`Altura: ${a.heightCm}cm`);
    if (a.bmi) lines.push(`IMC: ${a.bmi}`);
    if (a.bodyFatPct) lines.push(`Gordura corporal: ${a.bodyFatPct}%`);
    if (a.restingHR) lines.push(`FC repouso: ${a.restingHR}bpm`);
    if (a.vo2max) lines.push(`VO2max: ${a.vo2max}ml/kg/min`);
    if (a.vdot) lines.push(`VDOT: ${a.vdot}`);
    if (a.best5kTime) lines.push(`5K: ${this.secondsToMMSS(a.best5kTime)}`);
    if (a.best10kTime) lines.push(`10K: ${this.secondsToMMSS(a.best10kTime)}`);
    if (a.flexScore) lines.push(`Flexibilidade: ${a.flexScore}/10`);
    if (a.strengthScore) lines.push(`Força: ${a.strengthScore}/10`);
    return lines.join(', ');
  }
}
