import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidV4 } from 'uuid';
import { AuthUser } from '../common/auth-user.interface';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly refreshStore = new Map<string, string>();
  private readonly jwtSecret: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {
    this.jwtSecret = this.configService.get<string>('JWT_SECRET') ?? 'replace-me-in-prod';
  }

  async guestLogin(): Promise<TokenPair> {
    const guestId = `guest_${uuidV4()}`;
    return this.buildTokenPair(guestId);
  }

  async refreshToken(refreshToken: string): Promise<TokenPair> {
    const guestId = this.refreshStore.get(refreshToken);
    if (!guestId) {
      throw new UnauthorizedException('Refresh token invalid or expired');
    }
    this.refreshStore.delete(refreshToken);
    return this.buildTokenPair(guestId);
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    try {
      const payload = await this.jwtService.verifyAsync<AuthUser>(token, {
        secret: this.jwtSecret
      });
      return payload;
    } catch {
      throw new UnauthorizedException('Access token invalid or expired');
    }
  }

  private async buildTokenPair(guestId: string): Promise<TokenPair> {
    const payload: AuthUser = {
      sub: guestId,
      role: 'guest'
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.jwtSecret,
        expiresIn: '2h'
      }),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        {
          secret: this.jwtSecret,
          expiresIn: '30d'
        }
      )
    ]);
    this.refreshStore.set(refreshToken, guestId);
    return {
      accessToken,
      refreshToken,
      expiresIn: 7200
    };
  }
}
