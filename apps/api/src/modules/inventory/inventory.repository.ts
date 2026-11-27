import { Injectable } from '@nestjs/common';
import { Permission, type TenantContext } from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { PrismaService } from '../../database/prisma.service';
import { assertTenantContext, scopeTenantTransaction } from '../context/tenant-context';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class InventoryRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findByDealership(context: TenantContext, dealershipId: string) {
    const trusted = this.require(context, Permission.INVENTORY_INTEGRATION_MANAGE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.inventoryConnection.findFirst({
        where: { tenantId: trusted.tenantId, dealershipId },
      });
    });
  }

  async list(context: TenantContext) {
    const trusted = this.require(context, Permission.INVENTORY_INTEGRATION_MANAGE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.inventoryConnection.findMany({
        where: { tenantId: trusted.tenantId },
        orderBy: [{ createdAt: 'desc' }],
      });
    });
  }

  async findActive(context: TenantContext) {
    const trusted = this.require(context, Permission.INVENTORY_READ);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.inventoryConnection.findFirst({
        where: { tenantId: trusted.tenantId, status: 'ACTIVE' },
        orderBy: [{ updatedAt: 'desc' }],
      });
    });
  }

  async findById(context: TenantContext, connectionId: string) {
    const trusted = this.require(context, Permission.INVENTORY_INTEGRATION_MANAGE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      return transaction.inventoryConnection.findFirst({
        where: { id: connectionId, tenantId: trusted.tenantId },
      });
    });
  }

  async upsert(
    context: TenantContext,
    dealershipId: string,
    data: Omit<Prisma.InventoryConnectionUncheckedCreateInput, 'tenantId' | 'dealershipId'>,
  ) {
    const trusted = this.require(context, Permission.INVENTORY_INTEGRATION_MANAGE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const dealership = await transaction.dealership.findFirst({
        where: { id: dealershipId, tenantId: trusted.tenantId },
        select: { id: true },
      });
      if (!dealership) return null;
      // Serialize create/update decisions so the audit event matches the row
      // operation even when two admins configure inventory concurrently.
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM dealerships WHERE id = ${dealership.id}::uuid FOR UPDATE
      `;
      const prior = await transaction.inventoryConnection.findFirst({
        where: { dealershipId: dealership.id, tenantId: trusted.tenantId },
      });
      const connection = await transaction.inventoryConnection.upsert({
        where: { dealershipId: dealership.id },
        create: { ...data, tenantId: trusted.tenantId, dealershipId: dealership.id },
        update: {
          name: data.name,
          host: data.host,
          ...(data.port !== undefined ? { port: data.port } : {}),
          databaseName: data.databaseName,
          username: data.username,
          credentialCiphertext: data.credentialCiphertext,
          credentialIv: data.credentialIv,
          credentialTag: data.credentialTag,
          credentialReference: data.credentialReference,
          ...(data.tlsEnabled !== undefined ? { tlsEnabled: data.tlsEnabled } : {}),
          ...(data.tlsServername !== undefined ? { tlsServername: data.tlsServername } : {}),
          ...(data.mapping !== undefined ? { mapping: data.mapping } : {}),
          status: 'DRAFT',
          lastTestedAt: null,
          lastSuccessfulConnectionAt: null,
          configurationRevision: { increment: 1 },
          lastTestedRevision: null,
        },
      });
      await this.audit.record(transaction, trusted, {
        eventType: prior ? 'inventory.connection.updated' : 'inventory.connection.created',
        category: 'SYSTEM',
        action: prior ? 'update' : 'create',
        resourceType: 'inventory_connection',
        resourceId: connection.id,
        outcome: 'SUCCESS',
        metadata: {
          status: 'DRAFT',
          changedFields: prior
            ? [
                ...(prior.name !== data.name ? ['name'] : []),
                ...(prior.host !== data.host ? ['host'] : []),
                ...(prior.port !== data.port ? ['port'] : []),
                ...(prior.databaseName !== data.databaseName ? ['databaseName'] : []),
                ...(prior.username !== data.username ? ['username'] : []),
                ...(prior.credentialCiphertext !== data.credentialCiphertext
                  ? ['credentials']
                  : []),
                ...(prior.tlsEnabled !== data.tlsEnabled ? ['tlsEnabled'] : []),
                ...(prior.tlsServername !== data.tlsServername ? ['tlsServername'] : []),
                ...(JSON.stringify(prior.mapping) !== JSON.stringify(data.mapping)
                  ? ['mapping']
                  : []),
              ]
            : undefined,
        },
      });
      if (prior && JSON.stringify(prior.mapping) !== JSON.stringify(data.mapping)) {
        await this.audit.record(transaction, trusted, {
          eventType: 'inventory.mapping.updated',
          category: 'SYSTEM',
          action: 'update-mapping',
          resourceType: 'inventory_connection',
          resourceId: connection.id,
          outcome: 'SUCCESS',
          metadata: { changedFields: ['mapping'] },
        });
      }
      return connection;
    });
  }

  async recordTestResult(
    context: TenantContext,
    connectionId: string,
    expectedRevision: number,
    succeeded: boolean,
  ) {
    const trusted = this.require(context, Permission.INVENTORY_INTEGRATION_MANAGE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      const now = new Date();
      const updated = await transaction.inventoryConnection.updateMany({
        where: {
          id: connectionId,
          tenantId: trusted.tenantId,
          configurationRevision: expectedRevision,
        },
        data: {
          status: succeeded ? 'INACTIVE' : 'ERROR',
          lastTestedAt: now,
          lastTestedRevision: expectedRevision,
          lastSuccessfulConnectionAt: succeeded ? now : null,
        },
      });
      if (updated.count === 0) return false;
      await this.audit.record(transaction, trusted, {
        eventType: 'inventory.connection.tested',
        category: 'SYSTEM',
        action: 'test',
        resourceType: 'inventory_connection',
        resourceId: connectionId,
        outcome: succeeded ? 'SUCCESS' : 'FAILURE',
        metadata: {
          status: succeeded ? 'INACTIVE' : 'ERROR',
          configurationRevision: expectedRevision,
        },
      });
      return true;
    });
  }

  async setStatus(context: TenantContext, connectionId: string, status: 'ACTIVE' | 'INACTIVE') {
    const trusted = this.require(context, Permission.INVENTORY_INTEGRATION_MANAGE);
    return this.prisma.$transaction(async (transaction) => {
      await scopeTenantTransaction(transaction, trusted);
      await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM inventory_connections
        WHERE id = ${connectionId}::uuid AND tenant_id = ${trusted.tenantId}::uuid
        FOR UPDATE
      `;
      const connection = await transaction.inventoryConnection.findFirst({
        where: { id: connectionId, tenantId: trusted.tenantId },
      });
      if (!connection) return null;
      if (
        status === 'ACTIVE' &&
        (connection.status === 'ERROR' ||
          connection.lastSuccessfulConnectionAt === null ||
          connection.lastTestedRevision !== connection.configurationRevision)
      )
        return null;
      const updated = await transaction.inventoryConnection.updateMany({
        where: {
          id: connection.id,
          tenantId: trusted.tenantId,
          configurationRevision: connection.configurationRevision,
          ...(status === 'ACTIVE'
            ? {
                lastTestedRevision: connection.configurationRevision,
                lastSuccessfulConnectionAt: { not: null },
              }
            : {}),
        },
        data: { status },
      });
      if (updated.count !== 1) return null;
      await this.audit.record(transaction, trusted, {
        eventType:
          status === 'ACTIVE'
            ? 'inventory.connection.activated'
            : 'inventory.connection.deactivated',
        category: 'SYSTEM',
        action: status === 'ACTIVE' ? 'activate' : 'deactivate',
        resourceType: 'inventory_connection',
        resourceId: connection.id,
        outcome: 'SUCCESS',
        metadata: { status },
      });
      return transaction.inventoryConnection.findFirst({
        where: { id: connection.id, tenantId: trusted.tenantId },
      });
    });
  }

  private require(context: TenantContext, permission: Permission): TenantContext {
    const trusted = assertTenantContext(context);
    if (!trusted.permissions.includes(permission)) {
      throw new Error('Insufficient inventory permissions');
    }
    return trusted;
  }
}
