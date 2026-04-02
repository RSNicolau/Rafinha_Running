import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        phone: true,
        dateOfBirth: true,
        createdAt: true,
        updatedAt: true,
        athleteProfile: true,
        coachProfile: true,
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async findPublicById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, avatarUrl: true, role: true },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: dto.name,
        phone: dto.phone,
        avatarUrl: dto.avatarUrl,
        ...(dto.athleteProfile && {
          athleteProfile: { update: dto.athleteProfile },
        }),
      },
      select: {
        id: true, email: true, name: true, role: true,
        avatarUrl: true, phone: true, athleteProfile: true,
      },
    });
  }

  async getCoachAthletes(coachId: string) {
    return this.prisma.athleteProfile.findMany({
      where: { coachId },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
    });
  }

  async addAthleteByEmail(coachId: string, email: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { email },
      include: { athleteProfile: true },
    });
    if (!targetUser) throw new NotFoundException(`Usuário com e-mail "${email}" não encontrado`);
    if (targetUser.role !== 'ATHLETE') throw new Error('O usuário não é um atleta');
    if (targetUser.athleteProfile?.coachId === coachId) {
      throw new Error('Este atleta já está na sua equipe');
    }

    await this.prisma.athleteProfile.upsert({
      where: { userId: targetUser.id },
      create: { userId: targetUser.id, coachId },
      update: { coachId },
    });

    return { success: true, athlete: { id: targetUser.id, name: targetUser.name, email: targetUser.email } };
  }

  async getCoachAlerts(coachId: string) {
    // Athletes who missed workouts in the last 7 days
    const since = new Date();
    since.setDate(since.getDate() - 7);

    const missedWorkouts = await this.prisma.workout.findMany({
      where: {
        status: { in: ['MISSED', 'SKIPPED'] as any },
        scheduledDate: { gte: since },
        athlete: { athleteProfile: { coachId } },
      },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { scheduledDate: 'desc' },
      take: 20,
    });

    // Group by athlete and count consecutive misses
    const alertMap = new Map<string, { name: string; avatarUrl: string | null; count: number; lastDate: Date }>();
    for (const w of missedWorkouts) {
      const existing = alertMap.get(w.athleteId);
      if (existing) {
        existing.count++;
      } else {
        alertMap.set(w.athleteId, {
          name: w.athlete.name,
          avatarUrl: w.athlete.avatarUrl,
          count: 1,
          lastDate: w.scheduledDate,
        });
      }
    }

    return Array.from(alertMap.entries()).map(([athleteId, data]) => ({
      athleteId,
      name: data.name,
      avatarUrl: data.avatarUrl,
      missedCount: data.count,
      lastMissedDate: data.lastDate,
    }));
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado');

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) throw new BadRequestException('Senha atual incorreta');

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Senha alterada com sucesso' };
  }

  async getCoachStats(coachId: string) {
    const athletes = await this.prisma.athleteProfile.findMany({ where: { coachId } });
    const athleteIds = athletes.map(a => a.userId);

    if (athleteIds.length === 0) return { totalAthletes: 0, alertCount: 0, adherencePercent: 0 };

    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);

    const [scheduled, completed, missed] = await Promise.all([
      this.prisma.workout.count({
        where: { athleteId: { in: athleteIds }, scheduledDate: { gte: weekStart } },
      }),
      this.prisma.workout.count({
        where: { athleteId: { in: athleteIds }, scheduledDate: { gte: weekStart }, status: 'COMPLETED' },
      }),
      this.prisma.workout.count({
        where: { athleteId: { in: athleteIds }, scheduledDate: { gte: weekStart }, status: { in: ['MISSED', 'SKIPPED'] as any } },
      }),
    ]);

    return {
      totalAthletes: athleteIds.length,
      alertCount: missed,
      adherencePercent: scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0,
    };
  }
}
