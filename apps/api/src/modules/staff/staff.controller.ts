import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
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
import {
  ListStaffDto,
  UpdateStaffBranchesDto,
  UpdateStaffRoleDto,
  UpdateStaffStatusDto,
} from './staff.dto';
import { StaffService } from './staff.service';

@ApiTags('Staff')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@Controller({ path: 'staff', version: '1' })
@UseGuards(CsrfGuard, AuthGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermissions(Permission.USER_READ)
  @ApiOperation({ summary: 'List staff in the active tenant' })
  list(@Req() request: Request & { auth: AuthPrincipal }, @Query() filters: ListStaffDto) {
    return this.staff.list(tenantContextFromPrincipal(request.auth), filters);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current tenant membership and branch assignments' })
  getSelf(@Req() request: Request & { auth: AuthPrincipal }) {
    return this.staff.getSelf(tenantContextFromPrincipal(request.auth));
  }

  @Get('members/:membershipId')
  @RequirePermissions(Permission.USER_READ)
  @ApiOperation({ summary: 'Get a staff membership in the active tenant' })
  get(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.staff.get(tenantContextFromPrincipal(request.auth), membershipId);
  }

  @Get('members/:membershipId/branches')
  @RequirePermissions(Permission.USER_READ)
  @ApiOperation({ summary: 'List branch assignments for a staff membership' })
  getBranches(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
  ) {
    return this.staff.getBranches(tenantContextFromPrincipal(request.auth), membershipId);
  }

  @Put('members/:membershipId/branches')
  @RequirePermissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: 'Replace a staff member’s branch assignments' })
  updateBranches(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateStaffBranchesDto,
  ) {
    return this.staff.updateBranches(tenantContextFromPrincipal(request.auth), membershipId, dto);
  }

  @Patch('members/:membershipId/role')
  @RequirePermissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: 'Update a staff member’s role' })
  updateRole(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateStaffRoleDto,
  ) {
    return this.staff.updateRole(tenantContextFromPrincipal(request.auth), membershipId, dto);
  }

  @Patch('members/:membershipId/status')
  @RequirePermissions(Permission.USER_UPDATE)
  @ApiOperation({ summary: 'Activate or suspend a staff membership' })
  updateStatus(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('membershipId', ParseUUIDPipe) membershipId: string,
    @Body() dto: UpdateStaffStatusDto,
  ) {
    return this.staff.updateStatus(tenantContextFromPrincipal(request.auth), membershipId, dto);
  }
}
