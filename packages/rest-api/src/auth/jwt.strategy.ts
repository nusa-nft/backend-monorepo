import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    //configuration for strategy
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.API_JWT_SECRET_KEY,
    });
  }
  //return decoded token. can add user data here too
  async validate(payload: any) {
    return {
      id: payload.sub,
      wallet_address: payload.wallet_address,
    };
  }
}
