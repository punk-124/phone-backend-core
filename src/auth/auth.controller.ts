import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser } from '../common/auth-user.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthGuard } from './auth.guard';
import { AuthService, TokenPair } from './auth.service';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('guest')
  @ApiOperation({ summary: 'Anonymous sign in for mobile/web app' })
  guestSignIn(): Promise<TokenPair> {
    return this.authService.guestLogin();
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotate access token by refresh token' })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPair> {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current guest identity' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
