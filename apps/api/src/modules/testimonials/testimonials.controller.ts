import { Controller, Post, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { TestimonialsService } from './testimonials.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Depoimentos')
@Controller('testimonials')
export class TestimonialsController {
  constructor(private testimonialsService: TestimonialsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Atleta envia ou atualiza depoimento para o treinador' })
  async upsert(
    @CurrentUser('id') athleteId: string,
    @Body() body: { coachId: string; rating: number; text: string },
  ) {
    return this.testimonialsService.upsert(athleteId, body);
  }

  @Get('my-coach')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Atleta vê o próprio depoimento enviado ao treinador' })
  async getMyTestimonial(@CurrentUser('id') athleteId: string) {
    return this.testimonialsService.getMyTestimonial(athleteId);
  }

  @Get('featured/:coachSlugOrId')
  @ApiOperation({ summary: 'Depoimentos em destaque de um treinador (público)' })
  async getFeatured(@Param('coachSlugOrId') coachSlugOrId: string) {
    return this.testimonialsService.getFeatured(coachSlugOrId);
  }

  @Get('coach')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Treinador vê todos os depoimentos recebidos' })
  async getCoachTestimonials(@CurrentUser('id') coachId: string) {
    return this.testimonialsService.getCoachTestimonials(coachId);
  }

  @Put(':id/feature')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Treinador alterna destaque de um depoimento' })
  async toggleFeatured(
    @Param('id') id: string,
    @CurrentUser('id') coachId: string,
  ) {
    return this.testimonialsService.toggleFeatured(id, coachId);
  }
}
