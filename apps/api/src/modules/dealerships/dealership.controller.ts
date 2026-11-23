import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { Permission } from '@aicrm/shared';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE_NAME, AuthGuard } from '../../auth/auth.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { CsrfGuard } from '../../auth/csrf.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermissions } from '../../auth/permissions.decorator';
import { tenantContextFromPrincipal } from '../context/tenant-context';
import { DealershipService } from './dealership.service';
import { UpdateDealershipDto } from './dealership.dto';

@ApiTags('Dealerships')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@Controller({ path: 'dealerships', version: '1' })
@UseGuards(CsrfGuard, AuthGuard, PermissionsGuard)
export class DealershipController {
  constructor(private readonly dealerships: DealershipService) {}

  @Get()
  @RequirePermissions(Permission.DEALER_READ)
  @ApiOperation({ summary: 'List dealerships for the authenticated active tenant' })
  list(@Req() request: Request & { auth: AuthPrincipal }) {
    return this.dealerships.list(tenantContextFromPrincipal(request.auth));
  }

  @Get(':dealershipId')
  @RequirePermissions(Permission.DEALER_READ)
  @ApiOperation({ summary: 'Get an authorized dealership profile' })
  get(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('dealershipId', ParseUUIDPipe) dealershipId: string,
  ) {
    return this.dealerships.get(tenantContextFromPrincipal(request.auth), dealershipId);
  }

  @Patch(':dealershipId')
  @RequirePermissions(Permission.DEALER_UPDATE)
  @ApiOperation({ summary: 'Update editable dealership profile fields' })
  update(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('dealershipId', ParseUUIDPipe) dealershipId: string,
    @Body() dto: UpdateDealershipDto,
  ) {
    return this.dealerships.update(tenantContextFromPrincipal(request.auth), dealershipId, dto);
  }
}
