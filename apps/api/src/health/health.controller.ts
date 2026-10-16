import { Controller, Get, UseGuards } from '@nestjs/common';
import { MetricsAccessGuard } from '../common/guards/metrics-access.guard';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check público e mínimo (sem auth)' })
  async health() {
    let database: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'error';
    }
    const status = database === 'ok' ? 'ok' : 'degraded';
    return { status, checks: { database }, timestamp: new Date().toISOString() };
  }

  @Get('detailed')
  @UseGuards(MetricsAccessGuard) // x-metrics-token (METRICS_TOKEN) ou JWT de SUPER_ADMIN
  @ApiOperation({ summary: 'Health check detalhado (DB + memória + dependências)' })
  async detailed() {
    const start = Date.now();
    const checks: Record<string, any> = {};

    // DB check
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latencyMs: Date.now() - start };
    } catch (err: any) {
      checks.database = { status: 'error', error: err.message };
    }

    // External service config checks
    checks.anthropic = { status: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing' };
    checks.email = { status: process.env.RESEND_API_KEY ? 'configured' : 'missing' };
    checks.push = { status: process.env.EXPO_ACCESS_TOKEN ? 'configured' : 'missing' };

    const hasPayment = !!(
      process.env.MERCADO_PAGO_ACCESS_TOKEN ||
      process.env.STRIPE_SECRET_KEY ||
      process.env.PAGARME_API_KEY
    );
    checks.payments = { status: hasPayment ? 'configured' : 'missing' };

    // Memory check
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);
    checks.memory = {
      status: heapUsedMb < 512 ? 'ok' : 'warning',
      heapUsedMb,
      heapTotalMb,
      rssMb: Math.round(mem.rss / 1024 / 1024),
    };

    // Process info
    checks.process = {
      uptime: Math.round(process.uptime()),
      pid: process.pid,
      nodeVersion: process.version,
      env: process.env.NODE_ENV ?? 'development',
    };

    const status = checks.database.status === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
