import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import * as process from 'process';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.ACCESS_TOKEN_SECRET || 'hellosecretaccesstoken1122',
    });
  }

  async validate(payload: any) {
    return {
      id: payload.id,
      role: payload.role,
      businessId: payload.businessId,
    };
  }
}
