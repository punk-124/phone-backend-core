import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthUser } from './auth-user.interface';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
  return req.user;
});
