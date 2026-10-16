import { ForbiddenException } from '@nestjs/common';
import { TestimonialsService } from '../testimonials.service';

describe('H2 — testimonials', () => {
  it('atleta não publica depoimento para coach que não é o seu', async () => {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'my-coach' }) },
      testimonial: { upsert: jest.fn() },
    };
    const svc = new TestimonialsService(prisma);
    await expect(svc.upsert('ath', { coachId: 'other-coach', rating: 5, text: 'fake' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.testimonial.upsert).not.toHaveBeenCalled();
  });

  it('usa o coach vinculado ao atleta', async () => {
    const prisma: any = {
      athleteProfile: { findUnique: jest.fn().mockResolvedValue({ coachId: 'my-coach' }) },
      testimonial: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const svc = new TestimonialsService(prisma);
    await svc.upsert('ath', { rating: 4, text: 'ok' });
    expect(prisma.testimonial.upsert.mock.calls[0][0].create.coachId).toBe('my-coach');
  });
});
