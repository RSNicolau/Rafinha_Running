import { Module } from '@nestjs/common';
import { GarminService } from './garmin.service';
import { GarminAutoSyncService } from './garmin-auto-sync.service';

/**
 * Módulo enxuto (sem controllers) com o GarminService + envio automático de treinos.
 * Importado por IntegrationsModule, WorkoutsModule e TrainingPlansModule sem dependência circular
 * (depende apenas do PrismaModule, que é global).
 */
@Module({
  providers: [GarminService, GarminAutoSyncService],
  exports: [GarminService, GarminAutoSyncService],
})
export class GarminSyncModule {}
