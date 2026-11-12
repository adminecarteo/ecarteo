import type { ReactNode } from 'react';
import { ProtectedSessionBoundary } from '@/components/protected-session-boundary';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <ProtectedSessionBoundary>{children}</ProtectedSessionBoundary>;
}
