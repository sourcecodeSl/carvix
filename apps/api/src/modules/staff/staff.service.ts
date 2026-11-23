import { Injectable, NotFoundException } from '@nestjs/common';
import { Permission, type StaffDirectoryResponse, type StaffMemberResponse } from '@aicrm/shared';
import type { TenantContext } from '@aicrm/shared';
import { StaffRepository, type StaffRecord } from './staff.repository';
import type {
  ListStaffDto,
  UpdateStaffBranchesDto,
  UpdateStaffRoleDto,
  UpdateStaffStatusDto,
} from './staff.dto';

@Injectable()
export class StaffService {
  constructor(private readonly staff: StaffRepository) {}

  async list(context: TenantContext, filters: ListStaffDto): Promise<StaffDirectoryResponse> {
    const result = await this.staff.list(context, {
      page: filters.page,
      pageSize: filters.pageSize,
      ...(filters.q ? { query: filters.q } : {}),
      ...(filters.role ? { role: filters.role } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    const includeEmail = context.permissions.includes(Permission.USER_INVITE);
    return {
      items: result.items.map((member) => toResponse(member, includeEmail)),
      total: result.total,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }

  async getSelf(context: TenantContext): Promise<StaffMemberResponse> {
    const member = await this.staff.findSelf(context);
    if (!member) throw new NotFoundException('Staff membership not found');
    return toResponse(member, true);
  }

  async get(context: TenantContext, membershipId: string): Promise<StaffMemberResponse> {
    const member = await this.staff.findById(context, membershipId);
    if (!member) throw new NotFoundException('Staff membership not found');
    return toResponse(member, context.permissions.includes(Permission.USER_INVITE));
  }

  async getBranches(
    context: TenantContext,
    membershipId: string,
  ): Promise<StaffMemberResponse['branches']> {
    const member = await this.staff.findById(context, membershipId);
    if (!member) throw new NotFoundException('Staff membership not found');
    return toResponse(member, false).branches;
  }

  async updateRole(
    context: TenantContext,
    membershipId: string,
    dto: UpdateStaffRoleDto,
  ): Promise<StaffMemberResponse> {
    const member = await this.staff.updateRole(context, membershipId, dto.role);
    if (!member) throw new NotFoundException('Staff membership not found');
    return toResponse(member, true);
  }

  async updateStatus(
    context: TenantContext,
    membershipId: string,
    dto: UpdateStaffStatusDto,
  ): Promise<StaffMemberResponse> {
    const member = await this.staff.updateStatus(context, membershipId, dto.status);
    if (!member) throw new NotFoundException('Staff membership not found');
    return toResponse(member, true);
  }

  async updateBranches(
    context: TenantContext,
    membershipId: string,
    dto: UpdateStaffBranchesDto,
  ): Promise<StaffMemberResponse> {
    const member = await this.staff.replaceBranches(context, membershipId, dto.branchIds);
    if (!member) throw new NotFoundException('Staff membership not found');
    return toResponse(member, true);
  }
}

function toResponse(member: StaffRecord, includeEmail: boolean): StaffMemberResponse {
  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    ...(includeEmail ? { email: member.user.email } : {}),
    userStatus: member.user.status,
    role: member.role,
    status: member.status,
    branches: member.branchAssignments.map(({ branch }) => ({
      id: branch.id,
      name: branch.name,
      code: branch.code,
      status: branch.status,
    })),
    createdAt: member.createdAt.toISOString(),
  };
}
