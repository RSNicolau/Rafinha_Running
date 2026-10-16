import { ValidationPipe } from '@nestjs/common';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { SubmitOnboardingDto } from '../../onboarding/dto/onboarding.dto';
import { AcceptInviteDto } from '../../invites/dto/invite.dto';
import { ChangePasswordDto } from '../dto/user-settings.dto';

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const run = (value: any, metatype: any) => pipe.transform(value, { type: 'body', metatype });

describe('Validação global (DTOs) — exploits bloqueados', () => {
  it('C2c: PUT /users/me rejeita athleteProfile.coachId / niche', async () => {
    await expect(run({ athleteProfile: { coachId: 'evil' } }, UpdateProfileDto)).rejects.toBeDefined();
    await expect(run({ athleteProfile: { niche: 'CYCLING' } }, UpdateProfileDto)).rejects.toBeDefined();
    await expect(run({ athleteProfile: { weight: 70 } }, UpdateProfileDto)).resolves.toBeTruthy();
    await expect(run({ avatarUrl: 'javascript:alert(1)' }, UpdateProfileDto)).rejects.toBeDefined();
  });

  it('senha nova exige 8+ caracteres com letra e número (B1)', async () => {
    await expect(run({ currentPassword: 'x', newPassword: 'abc1234' }, ChangePasswordDto)).rejects.toBeDefined();
    await expect(run({ currentPassword: 'x', newPassword: '12345678' }, ChangePasswordDto)).rejects.toBeDefined();
    await expect(run({ currentPassword: 'x', newPassword: 'abcdefgh' }, ChangePasswordDto)).rejects.toBeDefined();
    await expect(run({ currentPassword: 'x', newPassword: 'corrida2026' }, ChangePasswordDto)).resolves.toBeTruthy();
  });

  it('H6: submit público exige aceite dos termos e consentimento de dados de saúde', async () => {
    const base = {
      athleteName: 'A', athleteEmail: 'a@b.com', answers: {},
      acceptTerms: true, termsVersion: 'v', privacyVersion: 'v', healthDataConsent: true,
    };
    await expect(run(base, SubmitOnboardingDto)).resolves.toBeTruthy();
    await expect(run({ ...base, healthDataConsent: false }, SubmitOnboardingDto)).rejects.toBeDefined();
    const { acceptTerms, ...noTerms } = base;
    await expect(run(noTerms, SubmitOnboardingDto)).rejects.toBeDefined();
  });

  it('C2b: aceite público de convite exige termos', async () => {
    await expect(run({ token: 't', name: 'n', password: '12345678' }, AcceptInviteDto)).rejects.toBeDefined();
  });
});
