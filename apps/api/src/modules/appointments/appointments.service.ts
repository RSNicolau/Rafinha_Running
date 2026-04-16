import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateAppointmentSettingsDto } from './dto/appointment.dto';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async getSettings(userId: string) {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId },
      select: { appointmentUrl: true },
    });
    return { appointmentUrl: profile?.appointmentUrl ?? null };
  }

  async updateSettings(userId: string, dto: UpdateAppointmentSettingsDto) {
    const existing = await this.prisma.coachProfile.findUnique({ where: { userId } });

    if (existing) {
      const updated = await this.prisma.coachProfile.update({
        where: { userId },
        data: { appointmentUrl: dto.appointmentUrl ?? null },
        select: { appointmentUrl: true },
      });
      return { appointmentUrl: updated.appointmentUrl };
    }

    // Create profile if it doesn't exist yet
    const created = await this.prisma.coachProfile.create({
      data: {
        userId,
        appointmentUrl: dto.appointmentUrl ?? null,
      },
      select: { appointmentUrl: true },
    });
    return { appointmentUrl: created.appointmentUrl };
  }

  /** Public endpoint: athlete fetches their coach's appointment URL */
  async getCoachSettings(coachId: string) {
    const profile = await this.prisma.coachProfile.findUnique({
      where: { userId: coachId },
      select: { appointmentUrl: true },
    });
    return { appointmentUrl: profile?.appointmentUrl ?? null };
  }
}
