'use client';

import { createContext, useContext } from 'react';
import type { AuthenticatedUserResponse } from '@aicrm/shared';

type DashboardSessionValue = {
  user: AuthenticatedUserResponse;
  refreshUser: () => Promise<AuthenticatedUserResponse | null>;
  replaceUser: (user: AuthenticatedUserResponse) => void;
};

const DashboardSessionContext = createContext<DashboardSessionValue | null>(null);

export function DashboardSessionProvider({
  value,
  children,
}: {
  value: DashboardSessionValue;
  children: React.ReactNode;
}) {
  return (
    <DashboardSessionContext.Provider value={value}>{children}</DashboardSessionContext.Provider>
  );
}

export function useDashboardSession(): DashboardSessionValue {
  const session = useContext(DashboardSessionContext);
  if (!session) throw new Error('Dashboard session context is unavailable');
  return session;
}
