import {
  Controller, Get, Post, Put, Delete, Param, Body, UseGuards, Query, Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { OnboardingService } from './onboarding.service';
import {
  SubmitOnboardingDto, CreateCheckoutDto, MyCheckoutDto,
  UpdateOnboardingFormDto, AddQuestionDto, UpdateQuestionDto, ReorderQuestionsDto,
} from './dto/onboarding.dto';
import { clientIp } from '../../common/utils/client-ip';

@ApiTags('Onboarding')
@Controller('onboarding')
export class OnboardingController {
  constructor(private onboardingService: OnboardingService) {}

  // ── Public endpoints ──

  @Get('public/:slug')
  @ApiOperation({ summary: 'Obter formulário público de onboarding pelo slug do coach' })
  async getPublicForm(@Param('slug') slug: string) {
    return this.onboardingService.getPublicForm(slug);
  }

  @Post('public/:slug/submit')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Submeter respostas do formulário de onboarding' })
  async submitForm(
    @Param('slug') slug: string,
    @Body() body: SubmitOnboardingDto,
    @Req() req: any,
  ) {
    // coachId resolved from slug on server side — never trusted from body
    return this.onboardingService.submitFormBySlug(slug, {
      athleteName: body.athleteName,
      athleteEmail: body.athleteEmail,
      athletePhone: body.athletePhone,
      answers: body.answers,
      referralCode: body.referralCode,
      acceptTerms: body.acceptTerms,
      termsVersion: body.termsVersion,
      privacyVersion: body.privacyVersion,
      healthDataConsent: body.healthDataConsent,
      marketingOptIn: body.marketingOptIn,
    }, { ip: clientIp(req), userAgent: req.headers?.['user-agent'] });
  }

  @Post('public/:slug/checkout')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Criar mensalidade + 1ª cobrança após o onboarding (Asaas/FAKE) — devolve payPath /pedido/<id>' })
  async createCheckout(
    @Param('slug') slug: string,
    @Body() body: CreateCheckoutDto,
  ) {
    return this.onboardingService.createCheckoutWithToken(slug, body.onboardingToken, body.planType, {
      planId: body.planId,
      billingType: body.billingType,
      buyer: body.buyer,
    });
  }

  @Post('me/checkout')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ATHLETE)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @ApiOperation({ summary: 'Criar checkout de assinatura para o atleta logado' })
  async createMyCheckout(@CurrentUser('id') athleteId: string, @Body() body: MyCheckoutDto) {
    return this.onboardingService.createAthleteCheckout(athleteId, body.planType, { planId: body.planId, billingType: body.billingType, buyer: body.buyer });
  }

  // ── Coach endpoints ──

  @Get('form')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Obter ou criar formulário de onboarding do coach' })
  async getForm(@CurrentUser('id') coachId: string) {
    return this.onboardingService.getOrCreateForm(coachId);
  }

  @Put('form')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar metadados do formulário' })
  async updateForm(
    @CurrentUser('id') coachId: string,
    @Body() body: UpdateOnboardingFormDto,
  ) {
    return this.onboardingService.updateForm(coachId, {
      title: body.title, description: body.description, isActive: body.isActive,
    });
  }

  @Post('form/questions')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Adicionar pergunta ao formulário' })
  async addQuestion(
    @CurrentUser('id') coachId: string,
    @Body() body: AddQuestionDto,
  ) {
    return this.onboardingService.addQuestion(coachId, body);
  }

  @Put('form/questions/reorder')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Reordenar perguntas do formulário' })
  async reorderQuestions(
    @CurrentUser('id') coachId: string,
    @Body() body: ReorderQuestionsDto,
  ) {
    return this.onboardingService.reorderQuestions(coachId, body.orders);
  }

  @Put('form/questions/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Atualizar pergunta do formulário' })
  async updateQuestion(
    @CurrentUser('id') coachId: string,
    @Param('id') questionId: string,
    @Body() body: UpdateQuestionDto,
  ) {
    return this.onboardingService.updateQuestion(coachId, questionId, body);
  }

  @Delete('form/questions/:id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Remover pergunta do formulário' })
  async deleteQuestion(
    @CurrentUser('id') coachId: string,
    @Param('id') questionId: string,
  ) {
    return this.onboardingService.deleteQuestion(coachId, questionId);
  }

  @Get('pending')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Listar questionários pendentes de revisão' })
  async getPending(@CurrentUser('id') coachId: string) {
    return this.onboardingService.getPendingOnboardings(coachId);
  }

  @Get(':profileId')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Detalhe de um questionário de onboarding' })
  async getDetail(
    @CurrentUser('id') coachId: string,
    @Param('profileId') profileId: string,
  ) {
    return this.onboardingService.getOnboardingDetail(coachId, profileId);
  }

  @Put(':profileId/approve')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Aprovar questionário de onboarding' })
  async approve(
    @CurrentUser('id') coachId: string,
    @Param('profileId') profileId: string,
  ) {
    return this.onboardingService.approveOnboarding(coachId, profileId);
  }

  // ── Athlete endpoint ──

  @Get('me/status')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Meu status de onboarding (atleta)' })
  async getMyStatus(@CurrentUser('id') athleteId: string) {
    return this.onboardingService.getMyOnboarding(athleteId);
  }
}
