import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BranchStatus as BranchStatusValues,
  type BranchResponse,
  type BranchStatus,
  type TenantContext,
} from '@aicrm/shared';
import { Prisma } from '@aicrm/database';
import { BranchRepository, type BranchRecord } from './branch.repository';
import type { CreateBranchDto, UpdateBranchDto } from './branch.dto';

@Injectable()
export class BranchService {
  constructor(private readonly branches: BranchRepository) {}

  async list(context: TenantContext, dealershipId: string): Promise<BranchResponse[]> {
    const branches = await this.branches.findForDealership(context, dealershipId);
    if (!branches) throw new NotFoundException('Dealership not found');
    return branches.map(toResponse);
  }

  async get(
    context: TenantContext,
    dealershipId: string,
    branchId: string,
  ): Promise<BranchResponse> {
    const branch = await this.branches.findById(context, dealershipId, branchId);
    if (!branch) throw new NotFoundException('Branch not found');
    return toResponse(branch);
  }

  async create(
    context: TenantContext,
    dealershipId: string,
    dto: CreateBranchDto,
  ): Promise<BranchResponse> {
    try {
      const branch = await this.branches.create(context, dealershipId, {
        name: dto.name.trim(),
        code: normalizeCode(dto.code),
        address: normalizeNullable(dto.address),
        city: normalizeNullable(dto.city),
        phone: normalizeNullable(dto.phone),
        status: BranchStatusValues.ACTIVE,
      });
      if (!branch) throw new NotFoundException('Dealership not found');
      return toResponse(branch);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Branch code is already in use for this dealership');
      }
      throw error;
    }
  }

  async update(
    context: TenantContext,
    dealershipId: string,
    branchId: string,
    dto: UpdateBranchDto,
  ): Promise<BranchResponse> {
    const data: Prisma.BranchUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) data.code = normalizeCode(dto.code);
    if (dto.address !== undefined) data.address = normalizeNullable(dto.address);
    if (dto.city !== undefined) data.city = normalizeNullable(dto.city);
    if (dto.phone !== undefined) data.phone = normalizeNullable(dto.phone);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('At least one editable field is required');
    }

    try {
      const branch = await this.branches.update(context, dealershipId, branchId, data);
      if (!branch) throw new NotFoundException('Branch not found');
      return toResponse(branch);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Branch code is already in use for this dealership');
      }
      throw error;
    }
  }

  async updateStatus(
    context: TenantContext,
    dealershipId: string,
    branchId: string,
    status: BranchStatus,
  ): Promise<BranchResponse> {
    const branch = await this.branches.updateStatus(context, dealershipId, branchId, status);
    if (!branch) throw new NotFoundException('Branch not found');
    return toResponse(branch);
  }
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function normalizeNullable(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function toResponse(branch: BranchRecord): BranchResponse {
  return {
    id: branch.id,
    dealershipId: branch.dealershipId,
    name: branch.name,
    code: branch.code,
    address: branch.address,
    city: branch.city,
    phone: branch.phone,
    status: branch.status,
    createdAt: branch.createdAt.toISOString(),
    updatedAt: branch.updatedAt.toISOString(),
  };
}
