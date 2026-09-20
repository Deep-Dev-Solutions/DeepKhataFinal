import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('businessinfo')
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get()
  getBusinessInfo(@Req() req: any) {
    return this.businessService.getBusinessInfo(req.user.id);
  }
}
