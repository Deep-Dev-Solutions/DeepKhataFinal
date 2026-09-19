import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { storage } from '../utils/cloudinary.storage';

@Controller('settings')
@UseGuards(ThrottlerGuard, JwtAuthGuard, RolesGuard)
@Roles(Role.OWNER, Role.SUPER_ADMIN)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('profileinfo')
  async profileInfo(@Req() req: any) {
    return this.settingsService.profileInfo(req.user.id);
  }

  @Get('profile')
  async profileInfoAlias(@Req() req: any) {
    return this.settingsService.profileInfo(req.user.id);
  }

  @Get('businessinfo')
  async businessInfo(@Req() req: any) {
    return this.settingsService.businessInfo(req.user.id);
  }

  @Get('business')
  async businessInfoAlias(@Req() req: any) {
    return this.settingsService.businessInfo(req.user.id);
  }

  @Put('profile')
  @UseInterceptors(FileInterceptor('avatar', { storage }))
  async updateProfile(
    @Req() req: any,
    @Body() body: any,
    @UploadedFile() file: any,
  ) {
    return this.settingsService.updateProfileInfo(req.user.id, body, file);
  }

  @Put('updateprofileinfo')
  @UseInterceptors(FileInterceptor('avatar', { storage }))
  async updateProfileInfo(
    @Req() req: any,
    @Body() body: any,
    @UploadedFile() file: any,
  ) {
    return this.settingsService.updateProfileInfo(req.user.id, body, file);
  }

  @Put('business')
  @UseInterceptors(FileInterceptor('logo', { storage }))
  async updateBusiness(
    @Req() req: any,
    @Body() body: any,
    @UploadedFile() file: any,
  ) {
    return this.settingsService.updateBusinessInfo(req.user.id, body, file);
  }

  @Put('updatebusinessinfo')
  @UseInterceptors(FileInterceptor('logo', { storage }))
  async updateBusinessInfo(
    @Req() req: any,
    @Body() body: any,
    @UploadedFile() file: any,
  ) {
    return this.settingsService.updateBusinessInfo(req.user.id, body, file);
  }

  @Post('branch')
  async createBranch(@Req() req: any, @Body() body: any) {
    return this.settingsService.createBranch(req.user.id, body);
  }

  @Post('staff')
  async inviteStaffAlias(@Req() req: any, @Body() body: any) {
    return this.settingsService.inviteStaff(req.user.id, body);
  }

  @Patch('branch/:id')
  async updateBranch(
    @Param('id') branchId: string,
    @Req() req: any,
    @Body() body: any,
  ) {
    return this.settingsService.updateBranch(branchId, req.user.id, body);
  }
}
