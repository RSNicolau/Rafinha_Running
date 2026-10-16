import request from 'supertest';

export const BASE = process.env.TEST_API_URL || 'http://localhost:3000';

/** Aceite LGPD exigido no cadastro (versões vigentes — ver src/modules/legal/legal.constants.ts). */
export const CONSENT = { acceptTerms: true, termsVersion: '2026-10-14', privacyVersion: '2026-10-14' };

/**
 * Vincula atleta ao treinador pelo fluxo seguro (convite + aceite autenticado do próprio atleta).
 * Requer a API rodando com NODE_ENV=test (único modo em que o token do convite volta na resposta).
 */
export async function linkAthleteToCoach(coachToken: string, athleteToken: string, athleteEmail: string) {
  const inv = await request(BASE)
    .post('/api/v1/invites')
    .set('Authorization', `Bearer ${coachToken}`)
    .send({ email: athleteEmail });
  const token = inv.body?.token ?? inv.body?.invite?.token;
  if (!token) throw new Error(`Convite sem token (API em NODE_ENV=test?): ${inv.status} ${JSON.stringify(inv.body)}`);
  const acc = await request(BASE)
    .post('/api/v1/invites/accept-existing')
    .set('Authorization', `Bearer ${athleteToken}`)
    .send({ token });
  if (acc.status >= 300) throw new Error(`accept-existing falhou: ${acc.status} ${JSON.stringify(acc.body)}`);
}
