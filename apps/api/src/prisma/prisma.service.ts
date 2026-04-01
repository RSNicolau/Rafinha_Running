import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Conectado ao banco de dados');
    } catch (error) {
      this.logger.warn(
        'Não foi possível conectar ao banco de dados. O servidor vai iniciar sem conexão ao DB.',
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
