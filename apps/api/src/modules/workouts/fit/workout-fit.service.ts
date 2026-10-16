import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { assertCoachOwnsAthlete, AuthUserLike } from '../../../common/utils/ownership';
import { verifyFitDownloadToken } from './fit-token';
import { encodeWorkoutFit, fitFileName } from './workout-fit';

const WORKOUT_FIT_SELECT = {
  id: true,
  athleteId: true,
  title: true,
  type: true,
  description: true,
  scheduledDate: true,
  targetDistanceMeters: true,
  targetDurationSeconds: true,
  targetPace: true,
  heartRateZone: true,
  athlete: { select: { isActive: true, deletedAt: true } },
} as const;

/**
 * Download do treino em .FIT. Autorização:
 *  - token `?t=` (link do e-mail): assinado, do treino `:id`, do atleta dono — atleta ativo;
 *  - ou usuário autenticado: o próprio atleta, ou treinador/gestão da equipe com acesso ao atleta
 *    (assertCoachOwnsAthlete) / ADMIN da plataforma.
 * Qualquer falha de acesso responde 404 (não revela a existência do treino).
 */
@Injectable()
export class WorkoutFitService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async authorize(workoutId: string, user: AuthUserLike | null | undefined, token?: string | null) {
    if (!workoutId || typeof workoutId !== 'string' || workoutId.length > 64) {
      throw new NotFoundException('Treino não encontrado');
    }

    if (token) {
      const payload = await verifyFitDownloadToken(this.jwt, token, workoutId);
      if (payload) {
        const workout = await this.prisma.workout.findUnique({ where: { id: workoutId }, select: WORKOUT_FIT_SELECT });
        if (
          workout &&
          workout.athleteId === payload.sub &&
          workout.athlete?.isActive !== false &&
          !workout.athlete?.deletedAt
        ) {
          return workout;
        }
        throw new NotFoundException('Treino não encontrado');
      }
      if (!user?.id) throw new NotFoundException('Link inválido ou expirado');
    }

    if (!user?.id) throw new UnauthorizedException('Faça login para baixar o treino');

    const workout = await this.prisma.workout.findUnique({ where: { id: workoutId }, select: WORKOUT_FIT_SELECT });
    if (!workout) throw new NotFoundException('Treino não encontrado');
    if (workout.athleteId === user.id) return workout;
    try {
      await assertCoachOwnsAthlete(this.prisma, user, workout.athleteId, { allowSelf: false });
    } catch {
      throw new NotFoundException('Treino não encontrado');
    }
    return workout;
  }

  async buildFile(workoutId: string, user: AuthUserLike | null | undefined, token?: string | null) {
    const workout = await this.authorize(workoutId, user, token);
    const { athlete: _athlete, ...data } = workout as any;
    const buffer = await encodeWorkoutFit(data);
    return { buffer, fileName: fitFileName(data) };
  }
}
