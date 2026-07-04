import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { PartnersService, PartnerDto } from './partners.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Parceiros')
@Controller('partners')
export class PartnersController {
  constructor(private partnersService: PartnersService) {}

  @Get('my')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ATHLETE)
  @ApiOperation({ summary: 'Atleta lista parceiros ativos da sua assessoria' })
  async getForAthlete(@CurrentUser('id') athleteId: string) {
    return this.partnersService.getForAthlete(athleteId);
  }

  @Get('public/:coachSlugOrId')
  @ApiOperation({ summary: 'Parceiros ativos de um treinador (público)' })
  async getPublic(@Param('coachSlugOrId') coachSlugOrId: string) {
    return this.partnersService.getPublic(coachSlugOrId);
  }

  @Get('coach')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Treinador lista todos os seus parceiros (inclui inativos)' })
  async getForCoach(@CurrentUser('id') coachId: string) {
    return this.partnersService.getForCoach(coachId);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Treinador cadastra um parceiro' })
  async create(@CurrentUser('id') coachId: string, @Body() dto: PartnerDto) {
    return this.partnersService.create(coachId, dto);
  }

  @Put(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Treinador atualiza um parceiro' })
  async update(
    @Param('id') id: string,
    @CurrentUser('id') coachId: string,
    @Body() dto: Partial<PartnerDto>,
  ) {
    return this.partnersService.update(id, coachId, dto);
  }

  @Delete(':id')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Treinador remove um parceiro' })
  async remove(@Param('id') id: string, @CurrentUser('id') coachId: string) {
    return this.partnersService.remove(id, coachId);
  }
}
