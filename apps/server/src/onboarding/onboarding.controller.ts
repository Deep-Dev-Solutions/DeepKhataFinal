import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { ThrottlerGuard } from '@nestjs/throttler';

@Controller('onboard')
@UseGuards(ThrottlerGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('onboarding')
  async businessOnboarding(@Body() body: any) {
    return this.onboardingService.businessOnboarding(body);
  }
}
