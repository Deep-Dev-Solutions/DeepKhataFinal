import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AllowWithoutBusiness } from '../tenant/allow-without-business.decorator';

@Controller('onboard')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @AllowWithoutBusiness()
  @Post('onboarding')
  async businessOnboarding(@Req() req: any, @Body() body: any) {
    return this.onboardingService.businessOnboarding(req.user.id, body);
  }
}
