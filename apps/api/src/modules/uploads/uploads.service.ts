import { Injectable, Logger } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  async uploadFile(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
    path: string, // e.g. 'athlete-docs/athleteId/filename'
  ): Promise<string> {
    const { error } = await this.supabase.storage
      .from('athlete-uploads')
      .upload(path, buffer, { contentType: mimeType, upsert: true });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data } = this.supabase.storage.from('athlete-uploads').getPublicUrl(path);
    return data.publicUrl;
  }

  // Detect file type category
  categorizeFile(mimeType: string): 'image' | 'pdf' | 'excel' | 'audio' | 'video' | 'other' {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') return 'excel';
    if (mimeType.startsWith('audio/')) return 'audio';
    if (mimeType.startsWith('video/')) return 'video';
    return 'other';
  }
}
