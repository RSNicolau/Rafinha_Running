import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');
import { Writable } from 'stream';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Generates a monthly PDF report for an athlete.
   * @param requesterId  The user requesting the PDF (must be the athlete or their coach)
   * @param athleteId    The target athlete
   * @param month        'YYYY-MM' format (defaults to last month)
   */
  async generateMonthlyPdf(requesterId: string, athleteId: string, month?: string): Promise<Buffer> {
    // ── Resolve month range ──────────────────────────────────────────────────
    const targetMonth = month ?? this.lastMonthString();
    const [year, mon] = targetMonth.split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end   = new Date(year, mon, 1);

    // ── Authorization: requester must be the athlete or their coach ──────────
    const athlete = await this.prisma.user.findUnique({
      where: { id: athleteId },
      include: { athleteProfile: { include: { coach: true } } },
    });
    if (!athlete) throw new NotFoundException('Atleta não encontrado');

    const isAthlete = requesterId === athleteId;
    const isCoach   = athlete.athleteProfile?.coachId === requesterId;
    if (!isAthlete && !isCoach) throw new ForbiddenException('Acesso negado');

    // ── Fetch data ───────────────────────────────────────────────────────────
    const [completedWorkouts, physicalAssessments, garminSnapshots] = await Promise.all([
      this.prisma.workout.findMany({
        where: { athleteId, status: 'COMPLETED', completedAt: { gte: start, lt: end } },
        include: { result: true },
        orderBy: { completedAt: 'asc' },
      }),
      this.prisma.physicalAssessment.findMany({
        where: { athleteId, assessedAt: { gte: start, lt: end } },
        orderBy: { assessedAt: 'desc' },
      }),
      this.prisma.garminHealthSnapshot.findMany({
        where: { athleteId, date: { gte: start, lt: end } },
        orderBy: { date: 'asc' },
      }),
    ]);

    // ── Aggregate stats ──────────────────────────────────────────────────────
    const totalKm   = completedWorkouts.reduce((s, w) => s + ((w.result?.distanceMeters ?? 0) / 1000), 0);
    const totalTime = completedWorkouts.reduce((s, w) => s + (w.result?.durationSeconds ?? 0), 0);
    const avgHR     = this.avg(completedWorkouts.map(w => w.result?.avgHeartRate).filter(Boolean) as number[]);
    const avgHRV    = this.avg(garminSnapshots.map(s => s.hrv).filter(Boolean) as number[]);
    const avgSleep  = this.avg(garminSnapshots.map(s => s.sleepHours).filter(Boolean) as number[]);

    const monthLabel = start.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const coachName  = athlete.athleteProfile?.coach?.name ?? 'Seu coach';

    // ── Build PDF ────────────────────────────────────────────────────────────
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50, info: {
        Title: `Relatório Mensal — ${athlete.name} — ${monthLabel}`,
        Author: 'RR Rafinha Running',
      }});

      const buffers: Buffer[] = [];
      const sink = new Writable({
        write(chunk, _enc, cb) { buffers.push(chunk); cb(); },
      });
      doc.pipe(sink);
      sink.on('finish', () => resolve(Buffer.concat(buffers)));
      sink.on('error', reject);

      const RED    = '#DC2626';
      const DARK   = '#111827';
      const GRAY   = '#6B7280';
      const LIGHT  = '#F3F4F6';
      const WHITE  = '#FFFFFF';

      // ── Header ──────────────────────────────────────────────────────────────
      doc.rect(0, 0, doc.page.width, 90).fill(RED);
      doc.fillColor(WHITE).fontSize(22).font('Helvetica-Bold')
        .text('RR Rafinha Running', 50, 25);
      doc.fontSize(11).font('Helvetica')
        .text(`Relatório Mensal — ${monthLabel}`, 50, 52);
      doc.fillColor(WHITE).fontSize(9)
        .text(`Atleta: ${athlete.name}  |  Coach: ${coachName}`, 50, 68);

      let y = 110;

      // ── Summary cards (3 columns) ────────────────────────────────────────────
      const cards = [
        { label: 'Treinos', value: `${completedWorkouts.length}`, unit: 'sessões' },
        { label: 'Distância', value: totalKm.toFixed(1), unit: 'km' },
        { label: 'Tempo total', value: this.formatDuration(totalTime), unit: '' },
      ];

      const cardW = 155, cardH = 65, cardGap = 15;
      cards.forEach((card, i) => {
        const x = 50 + i * (cardW + cardGap);
        doc.roundedRect(x, y, cardW, cardH, 8).fill(LIGHT);
        doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(card.label, x + 12, y + 10);
        doc.fillColor(DARK).fontSize(24).font('Helvetica-Bold').text(card.value, x + 12, y + 22);
        doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(card.unit, x + 12, y + 50);
      });

      y += cardH + 25;

      // ── Health averages ──────────────────────────────────────────────────────
      if (avgHR || avgHRV || avgSleep) {
        doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Saúde & Recuperação', 50, y);
        y += 20;

        const hCards = [
          { label: 'FC Média', value: avgHR ? `${Math.round(avgHR)} bpm` : '—' },
          { label: 'HRV Médio', value: avgHRV ? `${Math.round(avgHRV)} ms` : '—' },
          { label: 'Sono Médio', value: avgSleep ? `${avgSleep.toFixed(1)}h` : '—' },
        ];

        hCards.forEach((card, i) => {
          const x = 50 + i * (cardW + cardGap);
          doc.roundedRect(x, y, cardW, cardH, 8).fill(LIGHT);
          doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(card.label, x + 12, y + 10);
          doc.fillColor(DARK).fontSize(20).font('Helvetica-Bold').text(card.value, x + 12, y + 28);
        });

        y += cardH + 25;
      }

      // ── Workout list ─────────────────────────────────────────────────────────
      doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Treinos do Mês', 50, y);
      y += 18;

      // Table header
      doc.rect(50, y, doc.page.width - 100, 20).fill(RED);
      doc.fillColor(WHITE).fontSize(9).font('Helvetica-Bold');
      doc.text('Data',    56, y + 5);
      doc.text('Treino',  130, y + 5);
      doc.text('Distância', 290, y + 5);
      doc.text('Tempo',   370, y + 5);
      doc.text('FC Média', 440, y + 5);
      y += 22;

      completedWorkouts.forEach((w, idx) => {
        if (y > doc.page.height - 80) { doc.addPage(); y = 50; }

        const rowBg = idx % 2 === 0 ? WHITE : LIGHT;
        doc.rect(50, y, doc.page.width - 100, 18).fill(rowBg);
        doc.fillColor(DARK).fontSize(8).font('Helvetica');

        const date = (w.completedAt ?? w.scheduledDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const dist = w.result?.distanceMeters ? `${(w.result.distanceMeters / 1000).toFixed(1)} km` : '—';
        const dur  = w.result?.durationSeconds ? this.formatDuration(w.result.durationSeconds) : '—';
        const hr   = w.result?.avgHeartRate ? `${Math.round(w.result.avgHeartRate)} bpm` : '—';
        const title = (w.title ?? w.type).substring(0, 28);

        doc.text(date,  56, y + 4);
        doc.text(title, 130, y + 4);
        doc.text(dist,  290, y + 4);
        doc.text(dur,   370, y + 4);
        doc.text(hr,    440, y + 4);

        y += 19;
      });

      if (completedWorkouts.length === 0) {
        doc.fillColor(GRAY).fontSize(10).font('Helvetica').text('Nenhum treino concluído neste mês.', 50, y + 5);
        y += 25;
      }

      // ── Physical assessments ─────────────────────────────────────────────────
      if (physicalAssessments.length > 0) {
        y += 15;
        if (y > doc.page.height - 120) { doc.addPage(); y = 50; }

        doc.fillColor(DARK).fontSize(13).font('Helvetica-Bold').text('Avaliações Físicas', 50, y);
        y += 18;

        for (const a of physicalAssessments) {
          if (y > doc.page.height - 80) { doc.addPage(); y = 50; }

          doc.roundedRect(50, y, doc.page.width - 100, a.aiAnalysis ? 90 : 55, 8).fill(LIGHT);
          const dateStr = a.assessedAt.toLocaleDateString('pt-BR');

          doc.fillColor(DARK).fontSize(10).font('Helvetica-Bold').text(`Avaliação — ${dateStr}`, 62, y + 10);

          const items = [
            a.weightKg  ? `Peso: ${a.weightKg} kg`         : null,
            a.vo2max    ? `VO2max: ${a.vo2max}`             : null,
            a.vdot      ? `VDOT: ${a.vdot}`                 : null,
            a.best5kTime ? `5K: ${this.formatDuration(a.best5kTime)}` : null,
            a.best10kTime ? `10K: ${this.formatDuration(a.best10kTime)}` : null,
          ].filter(Boolean).join('   |   ');

          doc.fillColor(GRAY).fontSize(9).font('Helvetica').text(items, 62, y + 28, { width: doc.page.width - 130 });

          if (a.aiAnalysis) {
            doc.fillColor(DARK).fontSize(8).font('Helvetica-Oblique')
              .text(a.aiAnalysis.substring(0, 220) + (a.aiAnalysis.length > 220 ? '...' : ''),
                62, y + 48, { width: doc.page.width - 130 });
          }

          y += a.aiAnalysis ? 100 : 65;
        }
      }

      // ── Footer ───────────────────────────────────────────────────────────────
      const footerY = doc.page.height - 40;
      doc.rect(0, footerY, doc.page.width, 40).fill(DARK);
      doc.fillColor(WHITE).fontSize(8).font('Helvetica')
        .text(
          `Gerado em ${new Date().toLocaleDateString('pt-BR')} | RR Rafinha Running | Documento confidencial`,
          50, footerY + 14,
          { align: 'center', width: doc.page.width - 100 },
        );

      doc.end();
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private avg(values: number[]): number | null {
    if (!values.length) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private formatDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h${m.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  private lastMonthString(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
}
