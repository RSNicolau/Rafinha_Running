import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private _supabase: SupabaseClient | null = null;

  // Lazy: só instancia o cliente quando um upload é realmente feito, e falha
  // com erro claro em vez de derrubar o boot da API se as envs não existirem.
  private get supabase(): SupabaseClient {
    if (!this._supabase) {
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!url || !key) {
        throw new Error(
          'Upload indisponível: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configurados',
        );
      }
      this._supabase = createClient(url, key);
    }
    return this._supabase;
  }

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
