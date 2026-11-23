import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  AcceptNewStaffInvitationDto,
  CreateStaffInvitationDto,
  InvitationTokenDto,
  ListStaffInvitationsDto,
} from './staff.dto';
import { StaffInvitationService } from './staff-invitation.service';

@ApiTags('Staff invitations')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@Controller({ path: 'staff/invitations', version: '1' })
@UseGuards(CsrfGuard, AuthGuard, PermissionsGuard)
export class StaffInvitationController {
  constructor(private readonly invitations: StaffInvitationService) {}

  @Get()
  @RequirePermissions(Permission.USER_INVITE)
  @ApiOperation({ summary: 'List invitations for the active tenant without secret tokens' })
  list(
    @Req() request: Request & { auth: AuthPrincipal },
    @Query() filters: ListStaffInvitationsDto,
  ) {
    return this.invitations.list(tenantContextFromPrincipal(request.auth), filters);
  }

  @Post()
  @RequirePermissions(Permission.USER_INVITE)
  @ApiOperation({ summary: 'Create a development-only staff invitation preview' })
  create(@Req() request: Request & { auth: AuthPrincipal }, @Body() dto: CreateStaffInvitationDto) {
    return this.invitations.create(tenantContextFromPrincipal(request.auth), dto);
  }

  @Patch(':invitationId/cancel')
  @RequirePermissions(Permission.USER_INVITE)
  @ApiOperation({ summary: 'Cancel a pending invitation' })
  cancel(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
  ) {
    return this.invitations.cancel(tenantContextFromPrincipal(request.auth), invitationId);
  }
}

@ApiTags('Staff invitations')
@Controller({ path: 'invitations', version: '1' })
@UseGuards(CsrfGuard)
export class PublicInvitationController {
  constructor(private readonly invitations: StaffInvitationService) {}

  @Post('validate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validate a development invitation token' })
  validate(@Body() dto: InvitationTokenDto, @Req() request: Request) {
    return this.invitations.validatePublic(dto.token, request.ip || 'unknown');
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiCookieAuth(AUTH_COOKIE_NAME)
  @ApiOperation({ summary: 'Accept an invitation using the authenticated matching account' })
  accept(@Req() request: Request & { auth: AuthPrincipal }, @Body() dto: InvitationTokenDto) {
    return this.invitations.acceptForExistingUser(
      request.auth.userId,
      dto.token,
      request.ip || 'unknown',
    );
  }

  @Post('accept-new')
  @HttpCode(200)
  @ApiOperation({ summary: 'Accept a development invitation and create a new account' })
  acceptNew(@Body() dto: AcceptNewStaffInvitationDto, @Req() request: Request) {
    return this.invitations.acceptForNewUser(dto, request.ip || 'unknown');
  }
}
