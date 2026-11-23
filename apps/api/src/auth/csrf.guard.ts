import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method.toUpperCase())) {
      return true;
    }

    const origin = request.get('origin');
    const referer = request.get('referer');
    if (!origin && !referer) return true;

    const allowedOrigins = this.config.getOrThrow<string[]>('CORS_ORIGINS');
    let candidate = origin ?? '';
    if (!candidate && referer) {
      try {
        candidate = new URL(referer).origin;
      } catch {
        throw new ForbiddenException('Cross-origin mutation rejected');
      }
    }
    if (!allowedOrigins.includes(candidate)) {
      throw new ForbiddenException('Cross-origin mutation rejected');
    }
    return true;
  }
}
