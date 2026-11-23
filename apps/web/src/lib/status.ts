export type BackendStatus = 'loading' | 'connected' | 'disconnected';

export function getBackendStatusTone(status: BackendStatus): 'success' | 'error' | 'neutral' {
  if (status === 'connected') return 'success';
  if (status === 'disconnected') return 'error';
  return 'neutral';
}
