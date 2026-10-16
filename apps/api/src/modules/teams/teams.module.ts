import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { UploadsModule } from '../uploads/uploads.module';
import { TeamActorInterceptor } from './team-actor.interceptor';
import { TeamsService } from './teams.service';
import { AdminTeamsController, TeamsController } from './teams.controller';
import { TeamContextService } from './team-context.service';
import { TeamRolesGuard } from './team-roles.guard';

/**
 * Equipes (assessorias). Global para que qualquer módulo use @TeamRoles()/TeamContextService.
 * JwtModule sem config: os convites usam segredo derivado próprio (ver team-scope.ts).
 */
@Global()
@Module({
  imports: [JwtModule.register({}), UploadsModule],
  controllers: [TeamsController, AdminTeamsController],
  providers: [TeamsService, TeamContextService, TeamRolesGuard, TeamActorInterceptor],
  exports: [TeamsService, TeamContextService, TeamRolesGuard, TeamActorInterceptor],
})
export class TeamsModule {}
