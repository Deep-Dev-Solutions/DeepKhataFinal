import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { OnboardingService } from './onboarding.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AllowWithoutBusiness } from '../tenant/allow-without-business.decorator';
import { OnboardingDto } from './dto/onboarding.dto';

@Controller('onboard')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @AllowWithoutBusiness()
  @Post('onboarding')
  async businessOnboarding(@Req() req: any, @Body() body: OnboardingDto) {
    return this.onboardingService.businessOnboarding(req.user.id, body);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Post('sample-data/wipe')
  async wipeSampleData(@Req() req: any) {
    return this.onboardingService.wipeSampleData(req.user.businessId);
  }

  @Get('checklist')
  async checklist(@Req() req: any) {
    return this.onboardingService.getChecklist(req.user.businessId);
  }

  @UseGuards(RolesGuard)
  @Roles(Role.OWNER)
  @Post('checklist/dismiss')
  async dismissChecklist(@Req() req: any) {
    return this.onboardingService.dismissChecklist(req.user.businessId);
  }
}
