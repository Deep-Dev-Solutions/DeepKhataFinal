import { Module, Global } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserController } from './user.controller';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { assertJwtSecrets, getAccessTokenSecret } from './jwt-secrets';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        assertJwtSecrets();
        return { secret: getAccessTokenSecret() };
      },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController, UserController],
  exports: [AuthService, JwtStrategy, JwtModule, PassportModule],
})
export class AuthModule {}
