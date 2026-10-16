import { Controller, ForbiddenException, Get, Param, Query, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Response } from 'express';
import { detectFileType, UploadsService } from './uploads.service';

function joinWildcard(p: string | string[] | undefined): string {
  return Array.isArray(p) ? p.join('/') : String(p ?? '');
}

/**
 * Servir arquivos do armazenamento LOCAL (usado quando SUPABASE_URL não está configurado).
 *  - /files/public/*  → avatares, banners, logos (público)
 *  - /files/private/* → somente com assinatura HMAC de curta duração (gerada após checagem de permissão)
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  constructor(private uploads: UploadsService) {}

  @Get('public/*path')
  async getPublic(@Param('path') path: string | string[], @Res() res: Response) {
    const buffer = await this.uploads.readLocal('public', joinWildcard(path));
    this.send(res, buffer, 'public, max-age=86400');
  }

  @Get('private/*path')
  async getPrivate(
    @Param('path') path: string | string[],
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @Res() res: Response,
  ) {
    const rel = joinWildcard(path);
    if (!this.uploads.verifyLocalSignature(rel, exp, sig)) {
      throw new ForbiddenException('Link expirado ou inválido');
    }
    const buffer = await this.uploads.readLocal('private', rel);
    this.send(res, buffer, 'private, no-store');
  }

  private send(res: Response, buffer: Buffer, cache: string) {
    const mime = detectFileType(buffer)?.mime ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', cache);
    res.end(buffer);
  }
}
