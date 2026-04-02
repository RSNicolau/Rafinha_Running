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
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { InvitesService } from './invites.service';
import { CreateInviteDto, AcceptInviteDto } from './dto/invite.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Convites')
@Controller('invites')
export class InvitesController {
  constructor(private invitesService: InvitesService) {}

  // Public — check invite info by token (for the join page)
  @Get('check')
  checkInvite(@Query('token') token: string) {
    return this.invitesService.getInviteByToken(token);
  }

  // Public — accept invite and create account
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.invitesService.acceptInvite(dto);
  }

  // Coach — send invite
  @Post()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Enviar convite para atleta' })
  createInvite(@CurrentUser('id') coachId: string, @Body() dto: CreateInviteDto) {
    return this.invitesService.createInvite(coachId, dto);
  }

  // Coach — list own invites
  @Get()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Listar convites enviados' })
  listInvites(@CurrentUser('id') coachId: string) {
    return this.invitesService.listInvites(coachId);
  }

  // Coach — cancel invite
  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar convite' })
  cancelInvite(@CurrentUser('id') coachId: string, @Param('id') inviteId: string) {
    return this.invitesService.cancelInvite(coachId, inviteId);
  }
}
