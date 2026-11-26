export type ApiHealthResponse = {
  status: 'ok';
  service: 'ai-car-sales-crm-api';
  timestamp: string;
};

export type ApiReadinessResponse = {
  status: 'ready' | 'not_ready';
  dependencies: {
    postgres: 'available' | 'unavailable';
    redis: 'available' | 'unavailable';
  };
  timestamp: string;
};

export const Permission = {
  PLATFORM_DEALERS_CREATE: 'platform:dealers:create',
  PLATFORM_DEALERS_READ: 'platform:dealers:read',
  PLATFORM_DEALERS_UPDATE: 'platform:dealers:update',
  DEALER_READ: 'dealer:read',
  DEALER_UPDATE: 'dealer:update',
  BRANCH_CREATE: 'branch:create',
  BRANCH_READ: 'branch:read',
  BRANCH_UPDATE: 'branch:update',
  USER_INVITE: 'user:invite',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  AUDIT_READ: 'audit:read',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_INTEGRATION_MANAGE: 'inventory:integration:manage',
  LEAD_READ: 'lead:read',
  LEAD_CREATE: 'lead:create',
  LEAD_UPDATE: 'lead:update',
  LEAD_ASSIGN: 'lead:assign',
  CONVERSATION_READ: 'conversation:read',
  CONVERSATION_HANDOVER: 'conversation:handover',
  APPOINTMENT_READ: 'appointment:read',
  APPOINTMENT_CREATE: 'appointment:create',
  APPOINTMENT_UPDATE: 'appointment:update',
  REPORT_READ: 'report:read',
  SUBSCRIPTION_READ: 'subscription:read',
  SUBSCRIPTION_MANAGE: 'subscription:manage',
} as const;

export type Permission = (typeof Permission)[keyof typeof Permission];

export const MembershipRole = {
  DEALER_ADMIN: 'DEALER_ADMIN',
  SALES_MANAGER: 'SALES_MANAGER',
  SALES_AGENT: 'SALES_AGENT',
} as const;

export type MembershipRole = (typeof MembershipRole)[keyof typeof MembershipRole];

export const BranchStatus = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
} as const;

export type BranchStatus = (typeof BranchStatus)[keyof typeof BranchStatus];

export const PlatformRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

export type PlatformRole = (typeof PlatformRole)[keyof typeof PlatformRole];

export type TenantContext = {
  kind: 'tenant';
  tenantId: string;
  userId: string;
  membershipId: string;
  permissions: readonly Permission[];
};

export type PlatformContext = {
  kind: 'platform';
  userId: string;
  administratorId: string;
  permissions: readonly Permission[];
};

export type AuthenticatedUserResponse = {
  id: string;
  name: string;
  email: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED' | 'DELETED';
  memberships: readonly {
    id: string;
    tenantId: string;
    tenantName: string;
    role: MembershipRole;
    status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  }[];
  activeTenant: null | {
    tenantId: string;
    tenantName: string;
    role: MembershipRole;
  };
  platformRole: PlatformRole | null;
  permissions: readonly Permission[];
};

export type DealershipResponse = {
  id: string;
  businessName: string;
  contactEmail: string;
  contactPhone: string | null;
  country: string;
  timezone: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
};

export type BranchResponse = {
  id: string;
  dealershipId: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
};

export type StaffMemberResponse = {
  id: string;
  userId: string;
  name: string;
  email?: string;
  userStatus: 'INVITED' | 'ACTIVE' | 'DISABLED' | 'DELETED';
  role: MembershipRole;
  status: 'INVITED' | 'ACTIVE' | 'SUSPENDED';
  branches: readonly {
    id: string;
    name: string;
    code: string;
    status: BranchStatus;
  }[];
  createdAt: string;
};

export type StaffDirectoryResponse = {
  items: readonly StaffMemberResponse[];
  total: number;
  page: number;
  pageSize: number;
};

export type StaffInvitationResponse = {
  id: string;
  email: string;
  role: MembershipRole;
  status: 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
  branches: readonly {
    id: string;
    name: string;
    code: string;
  }[];
  expiresAt: string;
  createdAt: string;
};

export type CreateStaffInvitationResponse = {
  invitation: StaffInvitationResponse;
  previewUrl: string;
};

export type AuditEventCategory =
  | 'AUTHENTICATION'
  | 'AUTHORIZATION'
  | 'DEALERSHIP'
  | 'BRANCH'
  | 'STAFF'
  | 'INVITATION'
  | 'SECURITY'
  | 'SYSTEM';

export type AuditEventOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export type AuditEventResponse = {
  id: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorMembershipId: string | null;
  eventType: string;
  category: AuditEventCategory;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: AuditEventOutcome;
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  schemaVersion: number;
  occurredAt: string;
};

export type AuditEventPageResponse = {
  items: readonly AuditEventResponse[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditSummaryResponse = {
  period: { start: string | null; end: string | null };
  total: number;
  successfulLogins: number;
  failedLogins: number;
  accessDenied: number;
  staffRoleChanges: number;
  invitationAcceptances: number;
  branchModifications: number;
};

export type StaffInvitationPreviewResponse = {
  email: string;
  role: MembershipRole;
  tenantName: string;
  branches: readonly {
    id: string;
    name: string;
    code: string;
  }[];
  expiresAt: string;
};

export type BackgroundJobContext = {
  kind: 'background_job';
  tenantId: string;
  jobName: string;
  permissions: readonly Permission[];
};

export const RolePermissions: Readonly<Record<MembershipRole, readonly Permission[]>> = {
  DEALER_ADMIN: [
    Permission.DEALER_READ,
    Permission.DEALER_UPDATE,
    Permission.BRANCH_CREATE,
    Permission.BRANCH_READ,
    Permission.BRANCH_UPDATE,
    Permission.USER_INVITE,
    Permission.USER_READ,
    Permission.USER_UPDATE,
    Permission.AUDIT_READ,
    Permission.INVENTORY_READ,
    Permission.INVENTORY_INTEGRATION_MANAGE,
    Permission.LEAD_READ,
    Permission.LEAD_CREATE,
    Permission.LEAD_UPDATE,
    Permission.LEAD_ASSIGN,
    Permission.CONVERSATION_READ,
    Permission.CONVERSATION_HANDOVER,
    Permission.APPOINTMENT_READ,
    Permission.APPOINTMENT_CREATE,
    Permission.APPOINTMENT_UPDATE,
    Permission.REPORT_READ,
    Permission.SUBSCRIPTION_READ,
  ],
  SALES_MANAGER: [
    Permission.DEALER_READ,
    Permission.BRANCH_READ,
    Permission.USER_READ,
    Permission.INVENTORY_READ,
    Permission.LEAD_READ,
    Permission.LEAD_CREATE,
    Permission.LEAD_UPDATE,
    Permission.LEAD_ASSIGN,
    Permission.CONVERSATION_READ,
    Permission.CONVERSATION_HANDOVER,
    Permission.APPOINTMENT_READ,
    Permission.APPOINTMENT_CREATE,
    Permission.APPOINTMENT_UPDATE,
    Permission.REPORT_READ,
  ],
  SALES_AGENT: [
    Permission.DEALER_READ,
    Permission.BRANCH_READ,
    Permission.INVENTORY_READ,
    Permission.LEAD_READ,
    Permission.LEAD_CREATE,
    Permission.LEAD_UPDATE,
    Permission.CONVERSATION_READ,
    Permission.APPOINTMENT_READ,
    Permission.APPOINTMENT_CREATE,
    Permission.APPOINTMENT_UPDATE,
  ],
};

export type InventoryConnectionStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ERROR';

export type InventoryMappingConfiguration = {
  tableName: string;
  primaryKeyField: string;
  idField: string;
  makeField: string;
  modelField: string;
  variantField: string | null;
  yearField: string | null;
  registrationYearField: string | null;
  priceField: string | null;
  currencyField: string | null;
  mileageField: string | null;
  fuelTypeField: string | null;
  transmissionField: string | null;
  conditionField: string | null;
  bodyTypeField: string | null;
  colorField: string | null;
  availabilityField: string | null;
  descriptionField: string | null;
  imageUrlField: string | null;
  engineCapacityField: string | null;
  locationField: string | null;
  branchField: string | null;
  featuresField: string | null;
  serviceHistoryField: string | null;
  warrantyField: string | null;
  financeAvailabilityField: string | null;
  sourceUpdatedAtField: string | null;
};

export type InventoryConnectionSummary = {
  id: string;
  dealershipId: string;
  name: string;
  connectorType: 'MYSQL';
  host: string;
  port: number;
  databaseName: string;
  username: string;
  status: InventoryConnectionStatus;
  tlsEnabled: boolean;
  lastTestedAt: string | null;
  lastSuccessfulConnectionAt: string | null;
  mapping: InventoryMappingConfiguration | null;
  createdAt: string;
  updatedAt: string;
};

export type VehicleSummary = {
  id: string;
  externalVehicleId: string;
  dealershipId: string;
  make: string | null;
  model: string | null;
  variant: string | null;
  year: number | null;
  registrationYear: number | null;
  price: string | null;
  currency: string | null;
  mileage: number | null;
  engineCapacity: number | null;
  fuelType: string | null;
  transmission: string | null;
  condition: string | null;
  bodyType: string | null;
  color: string | null;
  location: string | null;
  branch: string | null;
  features: readonly string[] | null;
  serviceHistory: string | null;
  warranty: string | null;
  financeAvailability: boolean | null;
  sourceUpdatedAt: string | null;
  availabilityStatus: string | null;
  imageUrls: readonly string[];
  retrievedAt: string;
};

export type VehicleDetails = VehicleSummary & {
  description: string | null;
  source: 'EXTERNAL_MYSQL';
};

export type VehicleSearchFilters = {
  q?: string;
  make?: string;
  model?: string;
  minPrice?: string;
  maxPrice?: string;
  minYear?: number;
  maxYear?: number;
  fuelType?: string;
  transmission?: string;
  availability?: string;
  sort?: 'newest' | 'priceAsc' | 'priceDesc' | 'yearDesc';
  page?: number;
  pageSize?: number;
};

export type VehicleSearchResult = {
  items: readonly VehicleSummary[];
  total: number;
  page: number;
  pageSize: number;
};

export const PlatformRolePermissions: Readonly<Record<PlatformRole, readonly Permission[]>> = {
  SUPER_ADMIN: [
    Permission.PLATFORM_DEALERS_CREATE,
    Permission.PLATFORM_DEALERS_READ,
    Permission.PLATFORM_DEALERS_UPDATE,
  ],
};
