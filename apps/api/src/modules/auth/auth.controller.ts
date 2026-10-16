import { Controller, Post, Body, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  GoogleAuthDto,
  AppleAuthDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  MfaLoginDto,
  LogoutDto,
} from './dto/auth.dto';
import { clientIp } from '../../common/utils/client-ip';

@ApiTags('Autenticação')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @Throttle({ short: { ttl: 60000, limit: 5 } }) // 5 tentativas/min
  @ApiOperation({ summary: 'Criar nova conta (exige aceite dos Termos e da Política de Privacidade)' })
  async register(@Body() dto: RegisterDto, @Req() req: any) {
    const ua = req?.headers?.['user-agent'];
    return this.authService.register(dto, {
      ip: clientIp(req),
      userAgent: typeof ua === 'string' ? ua : undefined,
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 20 } })
  @ApiOperation({ summary: 'Fazer login (retorna mfaRequired + mfaToken se o 2FA estiver ativo)' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('2fa/login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Concluir login com código TOTP (2FA)' })
  async loginWithMfa(@Body() dto: MfaLoginDto) {
    return this.authService.loginWithMfa(dto.mfaToken, dto.code);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar token de acesso' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 20 } })
  @ApiOperation({
    summary: 'Encerrar a sessão: revoga o refresh token enviado (allDevices=true encerra todas as sessões)',
  })
  async logout(@Body() dto: LogoutDto) {
    return this.authService.logout(dto.refreshToken, { allDevices: dto.allDevices === true });
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Encerrar todas as sessões (revoga todos os tokens emitidos)' })
  async logoutAll(@Req() req: any) {
    return this.authService.revokeSessions(req.user.id);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 10 } })
  @ApiOperation({ summary: 'Login com Google' })
  async googleLogin(@Body() dto: GoogleAuthDto) {
    return this.authService.googleLogin(dto.idToken);
  }

  @Post('apple')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } }) // 5 tentativas/min
  @ApiOperation({ summary: 'Login com Apple (Sign in with Apple)' })
  async appleLogin(@Body() dto: AppleAuthDto) {
    return this.authService.appleLogin(dto.identityToken, dto.fullName);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 3 } }) // 3 tentativas/min
  @ApiOperation({ summary: 'Solicitar redefinição de senha' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 5 } }) // 5 tentativas/min
  @ApiOperation({ summary: 'Redefinir senha com token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
