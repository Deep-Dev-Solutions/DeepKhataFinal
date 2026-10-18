import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { SessionGuard } from '../auth/guards/session.guard';

@UseGuards(SessionGuard)
@Controller('businessinfo')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get()
  getBusinessInfo(@Req() req: any) {
    return this.businessService.getBusinessInfo(req.user.id);
  }
}
