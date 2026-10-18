import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserController } from './user.controller';
import { AuthSessionsService } from './auth-sessions.service';
import { SessionGuard } from './guards/session.guard';
import { UserAccountController } from '../user/user-account.controller';
import { UserAccountService } from '../user/user-account.service';

@Global()
@Module({
  providers: [AuthService, AuthSessionsService, SessionGuard, UserAccountService],
  controllers: [AuthController, UserController, UserAccountController],
  exports: [AuthService, AuthSessionsService, SessionGuard],
})
export class AuthModule {}
