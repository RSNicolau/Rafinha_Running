import { Module } from '@nestjs/common';
import { UploadsService } from './uploads.service';
import { FilesController } from './files.controller';

@Module({
  controllers: [FilesController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
