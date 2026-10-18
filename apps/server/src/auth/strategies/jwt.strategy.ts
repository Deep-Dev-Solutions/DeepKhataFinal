import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { getAccessTokenSecret } from '../jwt-secrets';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getAccessTokenSecret(),
    });
  }

  async validate(payload: any) {
    return {
      id: payload.id,
      role: payload.role,
      businessId: payload.businessId,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
