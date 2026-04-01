import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LiveTrackingService } from './live-tracking.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface LiveTrackingData {
  athleteId: string;
  latitude: number;
  longitude: number;
  pace: number; // min/km
  distance: number; // meters
  heartRate?: number;
  elapsed: number; // seconds
  altitude?: number;
  cadence?: number;
  timestamp: number;
}

@WebSocketGateway({
  namespace: '/live',
  cors: {
    origin: (process.env.ALLOWED_ORIGINS || 'http://localhost:8081,http://localhost:3001').split(','),
    credentials: true,
  },
})
export class LiveTrackingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger('LiveTrackingGateway');
  private readonly connectedUsers = new Map<string, { userId: string; role: string }>();

  constructor(
    private readonly liveTrackingService: LiveTrackingService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.headers.authorization || '').replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET! });
      this.connectedUsers.set(client.id, { userId: payload.sub, role: payload.role });
      this.logger.log(`User ${payload.sub} (${payload.role}) connected to live tracking`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (user) {
      this.logger.log(`User ${user.userId} disconnected from live tracking`);
      this.connectedUsers.delete(client.id);
    }
    this.liveTrackingService.handleDisconnect(client.id);
  }

  /**
   * Athlete starts a live tracking session.
   * Only the authenticated athlete can start their own session.
   */
  @SubscribeMessage('start-tracking')
  handleStartTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { athleteId: string; workoutId?: string },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return { error: 'Não autenticado' };

    // Athletes can only track themselves
    if (user.role === 'ATHLETE' && user.userId !== data.athleteId) {
      return { error: 'Não autorizado' };
    }

    this.logger.log(`Athlete ${data.athleteId} started tracking`);
    this.liveTrackingService.startSession(client.id, data.athleteId, data.workoutId);

    this.server.to(`coach:${data.athleteId}`).emit('athlete-started', {
      athleteId: data.athleteId,
      workoutId: data.workoutId,
      timestamp: Date.now(),
    });

    return { status: 'tracking-started' };
  }

  /**
   * Athlete sends location/metrics update.
   * Only the owner of the session can send updates.
   */
  @SubscribeMessage('location-update')
  handleLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LiveTrackingData,
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return;

    // Athletes can only update their own session
    if (user.role === 'ATHLETE' && user.userId !== data.athleteId) return;

    this.liveTrackingService.updateLocation(data);
    this.server.to(`coach:${data.athleteId}`).emit('athlete-update', data);
  }

  /**
   * Athlete stops tracking.
   */
  @SubscribeMessage('stop-tracking')
  handleStopTracking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { athleteId: string },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return { error: 'Não autenticado' };

    if (user.role === 'ATHLETE' && user.userId !== data.athleteId) {
      return { error: 'Não autorizado' };
    }

    this.logger.log(`Athlete ${data.athleteId} stopped tracking`);
    const summary = this.liveTrackingService.endSession(data.athleteId);

    this.server.to(`coach:${data.athleteId}`).emit('athlete-stopped', {
      athleteId: data.athleteId,
      summary,
      timestamp: Date.now(),
    });

    return { status: 'tracking-stopped', summary };
  }

  /**
   * Coach subscribes to an athlete's live feed.
   * Only coaches who are responsible for this athlete may watch.
   */
  @SubscribeMessage('watch-athlete')
  async handleWatchAthlete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { athleteId: string },
  ) {
    const user = this.connectedUsers.get(client.id);
    if (!user) return { error: 'Não autenticado' };

    if (user.role === 'ATHLETE') return { error: 'Acesso negado' };

    // Coaches must be responsible for this athlete (or be admin)
    if (user.role === 'COACH') {
      const profile = await this.prisma.athleteProfile.findFirst({
        where: { userId: data.athleteId, coachId: user.userId },
      });
      if (!profile) return { error: 'Atleta não pertence a este treinador' };
    }

    client.join(`coach:${data.athleteId}`);
    this.logger.log(`Coach ${user.userId} watching athlete ${data.athleteId}`);

    const current = this.liveTrackingService.getCurrentPosition(data.athleteId);
    if (current) client.emit('athlete-update', current);

    return { status: 'watching', isLive: !!current };
  }

  @SubscribeMessage('unwatch-athlete')
  handleUnwatchAthlete(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { athleteId: string },
  ) {
    client.leave(`coach:${data.athleteId}`);
    return { status: 'unwatched' };
  }

  /**
   * Get all currently live athletes (coach/admin only).
   */
  @SubscribeMessage('get-live-athletes')
  handleGetLiveAthletes(@ConnectedSocket() client: Socket) {
    const user = this.connectedUsers.get(client.id);
    if (!user || user.role === 'ATHLETE') return [];
    return this.liveTrackingService.getLiveAthletes();
  }
}
