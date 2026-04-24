import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Health check básico (sem auth)' })
  async health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Health check detalhado (DB + memória)' })
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

    const allOk = Object.values(checks).every((c: any) => c.status === 'ok');

    return {
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
