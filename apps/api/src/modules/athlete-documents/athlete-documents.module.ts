import { Module } from '@nestjs/common';
import { AthleteDocumentsController } from './athlete-documents.controller';
import { AthleteDocumentsService } from './athlete-documents.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [AthleteDocumentsController],
  providers: [AthleteDocumentsService],
  exports: [AthleteDocumentsService],
})
export class AthleteDocumentsModule {}
