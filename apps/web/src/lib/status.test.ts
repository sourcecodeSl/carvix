import { describe, expect, it } from 'vitest';
import { getBackendStatusTone } from './status';

describe('backend status rendering', () => {
  it('maps connected and disconnected states', () => {
    expect(getBackendStatusTone('connected')).toBe('success');
    expect(getBackendStatusTone('disconnected')).toBe('error');
    expect(getBackendStatusTone('loading')).toBe('neutral');
  });
});
