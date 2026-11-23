import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const STAFF_INVITATION_DELIVERY = 'STAFF_INVITATION_DELIVERY';

export type StaffInvitationDeliveryRequest = {
  email: string;
  role: 'SALES_MANAGER' | 'SALES_AGENT';
  previewUrl: string;
};

export type StaffInvitationDeliveryResult = {
  mode: 'development-preview';
  previewUrl: string;
};

export interface StaffInvitationDelivery {
  deliver(request: StaffInvitationDeliveryRequest): Promise<StaffInvitationDeliveryResult>;
}

@Injectable()
export class DevelopmentPreviewInvitationDelivery implements StaffInvitationDelivery {
  constructor(private readonly config: ConfigService) {}

  async deliver(request: StaffInvitationDeliveryRequest): Promise<StaffInvitationDeliveryResult> {
    if (this.config.getOrThrow<string>('NODE_ENV') !== 'development') {
      throw new ServiceUnavailableException(
        'Staff invitations are unavailable until a trusted email delivery provider is configured',
      );
    }
    return { mode: 'development-preview', previewUrl: request.previewUrl };
  }
}
