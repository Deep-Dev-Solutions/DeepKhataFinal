import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('onboard')
@UseGuards(ThrottlerGuard, JwtAuthGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('onboarding')
  async businessOnboarding(@Req() req: any, @Body() body: any) {
    return this.onboardingService.businessOnboarding(req.user.id, body);
  }
}
