import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Permission } from '@aicrm/shared';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { AuthPrincipal } from './auth.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const request = context.switchToHttp().getRequest<Request & { auth?: AuthPrincipal }>();
    const permissions = request.auth?.tenantPermissions ?? [];
    if (!required.every((permission) => permissions.includes(permission))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
