import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserController } from './user.controller';
import { AuthSessionsService } from './auth-sessions.service';
import { SessionGuard } from './guards/session.guard';

@Global()
@Module({
  providers: [AuthService, AuthSessionsService, SessionGuard],
  controllers: [AuthController, UserController],
  exports: [AuthService, AuthSessionsService, SessionGuard],
})
export class AuthModule {}
