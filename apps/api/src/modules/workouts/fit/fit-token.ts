import { JwtService } from '@nestjs/jwt';

/**
 * Token curto e assinado para baixar o .FIT de UM treino sem login (link do e-mail semanal).
 * - segredo derivado de JWT_SECRET (`:fit-download`) → nunca vale como access token (e vice-versa);
 * - `purpose` fixo; amarrado ao treino (`wid`) e ao atleta dono (`sub`); expira em 14 dias.
 */
export const FIT_DOWNLOAD_PURPOSE = 'fit-download';
export const FIT_DOWNLOAD_TTL = '14d';

export interface FitDownloadPayload {
  purpose: typeof FIT_DOWNLOAD_PURPOSE;
  wid: string;
  sub: string;
}

function fitDownloadSecret(): string {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET não configurado');
  return `${process.env.JWT_SECRET}:fit-download`;
}

export async function signFitDownloadToken(
  jwt: JwtService,
  data: { workoutId: string; athleteId: string },
): Promise<string> {
  return jwt.signAsync(
    { purpose: FIT_DOWNLOAD_PURPOSE, wid: data.workoutId, sub: data.athleteId },
    { secret: fitDownloadSecret(), expiresIn: FIT_DOWNLOAD_TTL as any },
  );
}

/** Devolve o payload se o token é válido PARA ESTE treino; senão null (nunca lança). */
export async function verifyFitDownloadToken(
  jwt: JwtService,
  token: string | null | undefined,
  workoutId: string,
): Promise<FitDownloadPayload | null> {
  if (!token || typeof token !== 'string' || token.length > 2048) return null;
  try {
    const p: any = await jwt.verifyAsync(token, { secret: fitDownloadSecret() });
    if (!p || p.purpose !== FIT_DOWNLOAD_PURPOSE) return null;
    if (typeof p.wid !== 'string' || typeof p.sub !== 'string') return null;
    if (p.wid !== workoutId) return null;
    return { purpose: FIT_DOWNLOAD_PURPOSE, wid: p.wid, sub: p.sub };
  } catch {
    return null;
  }
}
