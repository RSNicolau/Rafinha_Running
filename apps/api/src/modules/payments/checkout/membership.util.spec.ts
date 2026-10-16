import {
  addMonths,
  asaasCycle,
  buildTeamSplit,
  dateFromAsaas,
  intervalMonths,
  isBeyondGrace,
  isInGrace,
  monthlyEquivalentCents,
  resolveTeamOfUser,
  toAsaasDate,
} from './membership.util';

describe('membership.util', () => {
  describe('buildTeamSplit', () => {
    it('team gets (100 - platformFeePercent)% to its wallet', () => {
      expect(buildTeamSplit({ id: 't', asaasWalletId: 'wal_1', platformFeePercent: 10 })).toEqual([{ walletId: 'wal_1', percentualValue: 90 }]);
      expect(buildTeamSplit({ id: 't', asaasWalletId: 'wal_1', platformFeePercent: 0 })).toEqual([{ walletId: 'wal_1', percentualValue: 100 }]);
      expect(buildTeamSplit({ id: 't', asaasWalletId: 'wal_1', platformFeePercent: 7.5 })).toEqual([{ walletId: 'wal_1', percentualValue: 92.5 }]);
    });

    it('no wallet (null/blank) → no split, never walletId undefined', () => {
      expect(buildTeamSplit({ id: 't', asaasWalletId: null, platformFeePercent: 10 })).toBeUndefined();
      expect(buildTeamSplit({ id: 't', asaasWalletId: '   ', platformFeePercent: 10 })).toBeUndefined();
      expect(buildTeamSplit(null)).toBeUndefined();
    });

    it('clamps absurd fees; 100% fee → nothing to split', () => {
      expect(buildTeamSplit({ id: 't', asaasWalletId: 'w', platformFeePercent: 100 })).toBeUndefined();
      expect(buildTeamSplit({ id: 't', asaasWalletId: 'w', platformFeePercent: 150 })).toBeUndefined();
      expect(buildTeamSplit({ id: 't', asaasWalletId: 'w', platformFeePercent: -5 })).toEqual([{ walletId: 'w', percentualValue: 100 }]);
    });
  });

  it('interval → months / Asaas cycle', () => {
    expect([intervalMonths('MONTHLY'), intervalMonths('QUARTERLY'), intervalMonths('SEMIANNUAL'), intervalMonths('ANNUAL')]).toEqual([1, 3, 6, 12]);
    expect([asaasCycle('MONTHLY'), asaasCycle('QUARTERLY'), asaasCycle('SEMIANNUAL'), asaasCycle('ANNUAL')]).toEqual([
      'MONTHLY', 'QUARTERLY', 'SEMIANNUALLY', 'YEARLY',
    ]);
  });

  it('MRR normalization: quarterly/3, semiannual/6, annual/12', () => {
    expect(monthlyEquivalentCents(17400, 'MONTHLY')).toBe(17400);
    expect(monthlyEquivalentCents(49500, 'QUARTERLY')).toBe(16500);
    expect(monthlyEquivalentCents(96000, 'SEMIANNUAL')).toBe(16000);
    expect(monthlyEquivalentCents(180000, 'ANNUAL')).toBe(15000);
  });

  it('addMonths clamps to month end', () => {
    expect(addMonths(new Date('2026-01-31T03:00:00Z'), 1).toISOString()).toBe('2026-02-28T03:00:00.000Z');
    expect(addMonths(new Date('2026-10-15T03:00:00Z'), 3).toISOString()).toBe('2027-01-15T03:00:00.000Z');
    expect(addMonths(new Date('2026-10-15T03:00:00Z'), 12).toISOString()).toBe('2027-10-15T03:00:00.000Z');
  });

  it('Asaas dates are São Paulo midnights', () => {
    expect(dateFromAsaas('2026-10-15')!.toISOString()).toBe('2026-10-15T03:00:00.000Z');
    expect(dateFromAsaas('lixo')).toBeNull();
    expect(toAsaasDate(new Date('2026-10-16T02:59:00Z'))).toBe('2026-10-15');
  });

  it('grace: due day counts entirely; PAST_DUE starts after graceDays full days', () => {
    const due = dateFromAsaas('2026-10-10')!;
    expect(isBeyondGrace(due, 5, new Date('2026-10-10T20:00:00-03:00'))).toBe(false);
    expect(isInGrace(due, 5, new Date('2026-10-10T20:00:00-03:00'))).toBe(false); // ainda no dia do vencimento
    expect(isInGrace(due, 5, new Date('2026-10-12T10:00:00-03:00'))).toBe(true);
    expect(isBeyondGrace(due, 5, new Date('2026-10-15T23:59:00-03:00'))).toBe(false);
    expect(isBeyondGrace(due, 5, new Date('2026-10-16T00:00:00-03:00'))).toBe(true);
    expect(isBeyondGrace(due, 0, new Date('2026-10-11T00:00:00-03:00'))).toBe(true);
  });

  describe('resolveTeamOfUser', () => {
    it('prefers active TeamMember, falls back to Team.ownerId, tolerates DB errors', async () => {
      const team = { id: 't1', asaasWalletId: 'w', platformFeePercent: 5, ownerId: 'o' };
      const prisma: any = { teamMember: { findFirst: jest.fn().mockResolvedValue({ team }) }, team: { findFirst: jest.fn() } };
      expect(await resolveTeamOfUser(prisma, 'coach')).toBe(team);
      expect(prisma.team.findFirst).not.toHaveBeenCalled();

      prisma.teamMember.findFirst.mockResolvedValue(null);
      prisma.team.findFirst.mockResolvedValue(team);
      expect(await resolveTeamOfUser(prisma, 'owner')).toBe(team);

      expect(await resolveTeamOfUser({} as any, 'x')).toBeNull(); // sem tabelas (mock) → null, sem lançar
      expect(await resolveTeamOfUser(prisma, null)).toBeNull();
    });
  });
});
