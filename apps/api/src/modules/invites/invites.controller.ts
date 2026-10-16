import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { InvitesService } from './invites.service';
import { CreateInviteDto, AcceptInviteDto, AcceptExistingInviteDto } from './dto/invite.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { clientIp } from '../../common/utils/client-ip';

@ApiTags('Convites')
@Controller('invites')
export class InvitesController {
  constructor(private invitesService: InvitesService) {}

  // Public — check invite info by token (for the join page)
  @Get('check')
  checkInvite(@Query('token') token: string) {
    return this.invitesService.getInviteByToken(token);
  }

  // Public — accept invite creating a NEW account (requires LGPD consent). Existing accounts → accept-existing.
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(@Body() dto: AcceptInviteDto, @Req() req: any) {
    return this.invitesService.acceptInvite(dto, { ip: clientIp(req), userAgent: req.headers?.['user-agent'] });
  }

  // Authenticated — logged-in athlete accepts an invite sent to their own e-mail
  @Post('accept-existing')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aceitar convite com a conta já existente (usuário logado)' })
  acceptExisting(@CurrentUser() user: any, @Body() dto: AcceptExistingInviteDto) {
    return this.invitesService.acceptInviteAsExistingUser(user, dto.token);
  }

  // Coach — send invite
  @Post()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Enviar convite para atleta' })
  createInvite(@CurrentUser('id') coachId: string, @Body() dto: CreateInviteDto) {
    return this.invitesService.createInvite(coachId, dto);
  }

  // Coach — list own invites
  @Get()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  @ApiOperation({ summary: 'Listar convites enviados' })
  listInvites(@CurrentUser('id') coachId: string) {
    return this.invitesService.listInvites(coachId);
  }

  // Coach — cancel invite
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.COACH)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar convite' })
  cancelInvite(@CurrentUser('id') coachId: string, @Param('id') inviteId: string) {
    return this.invitesService.cancelInvite(coachId, inviteId);
  }
}
