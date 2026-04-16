import { Controller, Get, Put, Body, Param, UseGuards, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AppointmentsService } from './appointments.service';
import { UpdateAppointmentSettingsDto } from './dto/appointment.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('appointments')
@UseGuards(AuthGuard('jwt'))
export class AppointmentsController {
  constructor(private readonly appointmentsService: AppointmentsService) {}

  /** GET /appointments/settings — coach reads their appointment URL */
  @Get('settings')
  getSettings(@CurrentUser() user: { id: string; role: string }) {
    // Athletes can also read their coach's settings via /appointments/coach/:coachId
    return this.appointmentsService.getSettings(user.id);
  }

  /** PUT /appointments/settings — coach saves their appointment URL */
  @Put('settings')
  updateSettings(
    @CurrentUser() user: { id: string; role: string },
    @Body() dto: UpdateAppointmentSettingsDto,
  ) {
    if (user.role !== 'COACH' && user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Apenas coaches podem configurar agendamento');
    }
    return this.appointmentsService.updateSettings(user.id, dto);
  }

  /** GET /appointments/coach/:coachId — athlete reads coach's appointment URL */
  @Get('coach/:coachId')
  getCoachSettings(@Param('coachId') coachId: string) {
    return this.appointmentsService.getCoachSettings(coachId);
  }
}
