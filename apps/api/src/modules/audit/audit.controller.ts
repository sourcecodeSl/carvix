import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@aicrm/shared';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE_NAME, AuthGuard } from '../../auth/auth.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { CsrfGuard } from '../../auth/csrf.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermissions } from '../../auth/permissions.decorator';
import { tenantContextFromPrincipal } from '../context/tenant-context';
import { AuditService } from './audit.service';
import { AuditSummaryDto, ListAuditEventsDto } from './audit.dto';

@ApiTags('Audit')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@Controller({ path: 'audit', version: '1' })
@UseGuards(CsrfGuard, AuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('events')
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'List tenant audit events' })
  list(@Req() request: Request & { auth: AuthPrincipal }, @Query() filters: ListAuditEventsDto) {
    return this.audit.list(tenantContextFromPrincipal(request.auth), filters);
  }

  @Get('events/:eventId')
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'Get a tenant audit event' })
  async get(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    const event = await this.audit.get(tenantContextFromPrincipal(request.auth), eventId);
    if (!event) throw new NotFoundException('Audit event not found');
    return event;
  }

  @Get('summary')
  @RequirePermissions(Permission.AUDIT_READ)
  @ApiOperation({ summary: 'Summarize tenant audit events' })
  summary(@Req() request: Request & { auth: AuthPrincipal }, @Query() filters: AuditSummaryDto) {
    return this.audit.summary(tenantContextFromPrincipal(request.auth), filters);
  }
}
