import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePlanDto, UpdatePlanDto } from './dto/plan.dto';
import { UserRole, PlanStatus, NotificationType } from '@prisma/client';

@Injectable()
export class TrainingPlansService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(coachId: string, dto: CreatePlanDto) {
    const plan = await this.prisma.trainingPlan.create({
      data: {
        coachId,
        athleteId: dto.athleteId,
        name: dto.name,
        description: dto.description,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        weeklyFrequency: dto.weeklyFrequency,
        status: PlanStatus.DRAFT,
      },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
        coach: { select: { name: true } },
      },
    });

    // Notify athlete about the new training plan
    this.notifications.createNotification(
      dto.athleteId,
      NotificationType.PLAN_ASSIGNED,
      'Nova planilha de treino',
      `${plan.coach?.name || 'Seu treinador'} criou a planilha "${dto.name}" para você.`,
      { planId: plan.id },
    ).catch(() => {});

    return plan;
  }

  async findAll(userId: string, role: UserRole) {
    const where = role === UserRole.COACH ? { coachId: userId } : { athleteId: userId };

    return this.prisma.trainingPlan.findMany({
      where,
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true } },
        coach: { select: { id: true, name: true } },
        _count: { select: { workouts: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string, userId: string, role: UserRole) {
    const plan = await this.prisma.trainingPlan.findUnique({
      where: { id },
      include: {
        athlete: { select: { id: true, name: true, avatarUrl: true, email: true } },
        coach: { select: { id: true, name: true } },
        workouts: { orderBy: { scheduledDate: 'asc' }, include: { result: true } },
      },
    });

    if (!plan) throw new NotFoundException('Plano de treino não encontrado');
    if (role === UserRole.ATHLETE && plan.athleteId !== userId) throw new ForbiddenException('Acesso negado');
    if (role === UserRole.COACH && plan.coachId !== userId) throw new ForbiddenException('Acesso negado');

    const completed = plan.workouts.filter(w => w.status === 'COMPLETED').length;
    return {
      ...plan,
      completionPercentage: plan.workouts.length > 0 ? Math.round((completed / plan.workouts.length) * 100) : 0,
    };
  }

  async update(id: string, coachId: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.trainingPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plano de treino não encontrado');
    if (plan.coachId !== coachId) throw new ForbiddenException('Apenas o treinador pode editar o plano');

    return this.prisma.trainingPlan.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        status: dto.status,
        weeklyFrequency: dto.weeklyFrequency,
        ...(dto.startDate && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate && { endDate: new Date(dto.endDate) }),
      },
    });
  }
}
