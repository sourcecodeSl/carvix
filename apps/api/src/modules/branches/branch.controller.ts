import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
import { BranchService } from './branch.service';
import { CreateBranchDto, UpdateBranchDto, UpdateBranchStatusDto } from './branch.dto';

@ApiTags('Branches')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@Controller({ path: 'dealerships/:dealershipId/branches', version: '1' })
@UseGuards(CsrfGuard, AuthGuard, PermissionsGuard)
export class BranchController {
  constructor(private readonly branches: BranchService) {}

  @Get()
  @RequirePermissions(Permission.BRANCH_READ)
  @ApiOperation({ summary: 'List branches for an authorized dealership' })
  list(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('dealershipId', ParseUUIDPipe) dealershipId: string,
  ) {
    return this.branches.list(tenantContextFromPrincipal(request.auth), dealershipId);
  }

  @Post()
  @RequirePermissions(Permission.BRANCH_CREATE)
  @ApiOperation({ summary: 'Create a branch for an authorized dealership' })
  create(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('dealershipId', ParseUUIDPipe) dealershipId: string,
    @Body() dto: CreateBranchDto,
  ) {
    return this.branches.create(tenantContextFromPrincipal(request.auth), dealershipId, dto);
  }

  @Get(':branchId')
  @RequirePermissions(Permission.BRANCH_READ)
  @ApiOperation({ summary: 'Get a branch belonging to an authorized dealership' })
  get(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('dealershipId', ParseUUIDPipe) dealershipId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
  ) {
    return this.branches.get(tenantContextFromPrincipal(request.auth), dealershipId, branchId);
  }

  @Patch(':branchId')
  @RequirePermissions(Permission.BRANCH_UPDATE)
  @ApiOperation({ summary: 'Update editable branch fields' })
  update(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('dealershipId', ParseUUIDPipe) dealershipId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(
      tenantContextFromPrincipal(request.auth),
      dealershipId,
      branchId,
      dto,
    );
  }

  @Patch(':branchId/status')
  @RequirePermissions(Permission.BRANCH_UPDATE)
  @ApiOperation({ summary: 'Activate or deactivate a branch without deleting history' })
  updateStatus(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('dealershipId', ParseUUIDPipe) dealershipId: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: UpdateBranchStatusDto,
  ) {
    return this.branches.updateStatus(
      tenantContextFromPrincipal(request.auth),
      dealershipId,
      branchId,
      dto.status,
    );
  }
}
