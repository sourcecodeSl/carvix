import {
  Body,
  Controller,
  Get,
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
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { AUTH_COOKIE_NAME, AuthGuard } from '../../auth/auth.guard';
import type { AuthPrincipal } from '../../auth/auth.types';
import { CsrfGuard } from '../../auth/csrf.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermissions } from '../../auth/permissions.decorator';
import { tenantContextFromPrincipal } from '../context/tenant-context';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryConnectionDto,
  ListVehiclesDto,
  UpdateInventoryConnectionDto,
} from './inventory.dto';

@ApiTags('Inventory')
@ApiCookieAuth(AUTH_COOKIE_NAME)
@Controller({ path: 'inventory', version: '1' })
@UseGuards(CsrfGuard, AuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get('connections')
  @RequirePermissions(Permission.INVENTORY_INTEGRATION_MANAGE)
  listConnections(@Req() request: Request & { auth: AuthPrincipal }) {
    return this.inventory.listConnections(tenantContextFromPrincipal(request.auth));
  }

  @Post('connections')
  @RequirePermissions(Permission.INVENTORY_INTEGRATION_MANAGE)
  create(
    @Req() request: Request & { auth: AuthPrincipal },
    @Body() dto: CreateInventoryConnectionDto,
  ) {
    const context = tenantContextFromPrincipal(request.auth);
    return this.inventory.createOrUpdateConnection(context, undefined, dto);
  }

  @Patch('connections/:connectionId')
  @RequirePermissions(Permission.INVENTORY_INTEGRATION_MANAGE)
  update(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: UpdateInventoryConnectionDto,
  ) {
    const context = tenantContextFromPrincipal(request.auth);
    return this.inventory.updateConnection(context, connectionId, dto);
  }

  @Post('connections/:connectionId/test')
  @RequirePermissions(Permission.INVENTORY_INTEGRATION_MANAGE)
  test(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.inventory.testConnection(tenantContextFromPrincipal(request.auth), connectionId);
  }

  @Post('connections/:connectionId/activate')
  @RequirePermissions(Permission.INVENTORY_INTEGRATION_MANAGE)
  activate(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.inventory.setStatus(
      tenantContextFromPrincipal(request.auth),
      connectionId,
      'ACTIVE',
    );
  }

  @Post('connections/:connectionId/deactivate')
  @RequirePermissions(Permission.INVENTORY_INTEGRATION_MANAGE)
  deactivate(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.inventory.setStatus(
      tenantContextFromPrincipal(request.auth),
      connectionId,
      'INACTIVE',
    );
  }

  @Get('vehicles')
  @RequirePermissions(Permission.INVENTORY_READ)
  list(@Req() request: Request & { auth: AuthPrincipal }, @Query() filters: ListVehiclesDto) {
    return this.inventory.listVehicles(tenantContextFromPrincipal(request.auth), filters);
  }

  @Get('vehicles/:vehicleId')
  @RequirePermissions(Permission.INVENTORY_READ)
  details(
    @Req() request: Request & { auth: AuthPrincipal },
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.inventory.getVehicle(tenantContextFromPrincipal(request.auth), vehicleId);
  }
}
