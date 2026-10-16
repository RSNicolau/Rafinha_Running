import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LoginAttemptsService } from './login-attempts.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // JWT_SECRET é obrigatório (validado em main.ts → validateEnv). Sem fallback inseguro.
    JwtModule.registerAsync({
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET não configurado');
        return {
          secret,
          signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '15m') as any },
        };
      },
    }),
    UsersModule, // TwoFactorService (verificação TOTP no login)
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginAttemptsService],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
