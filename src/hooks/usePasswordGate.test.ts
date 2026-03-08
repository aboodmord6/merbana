import { describe, it, expect } from 'vitest';
import { shouldRequirePasswordPrompt } from '../utils/passwordGate';
import { DEFAULT_PASSWORD_REQUIREMENTS } from '../utils/passwordPolicy';
import type { SensitiveActionKey, StoreSettings, StoreUser } from '../types/types';

function makeSettings(overrides?: Partial<StoreSettings>): StoreSettings {
  return {
    companyName: 'Test',
    security: {
      passwordRequiredFor: {
        ...DEFAULT_PASSWORD_REQUIREMENTS,
      },
    },
    ...(overrides || {}),
  };
}

function makeUser(withPassword = true): StoreUser {
  return {
    id: 'u1',
    name: 'Ali',
    ...(withPassword ? { password: '1234' } : {}),
    createdAt: new Date().toISOString(),
  };
}

describe('shouldRequirePasswordPrompt', () => {
  it('returns true when action requires password and user has password', () => {
    const settings = makeSettings();
    const user = makeUser(true);

    expect(shouldRequirePasswordPrompt(settings, user, 'withdraw_cash')).toBe(true);
  });

  it('returns false when action policy is disabled', () => {
    const settings = makeSettings({
      security: {
        passwordRequiredFor: {
          ...DEFAULT_PASSWORD_REQUIREMENTS,
          withdraw_cash: false,
        },
      },
    });
    const user = makeUser(true);

    expect(shouldRequirePasswordPrompt(settings, user, 'withdraw_cash')).toBe(false);
  });

  it('returns false when user has no password even if policy is enabled', () => {
    const settings = makeSettings();
    const user = makeUser(false);

    expect(shouldRequirePasswordPrompt(settings, user, 'deposit_cash')).toBe(false);
  });

  it('returns false when there is no active user', () => {
    const settings = makeSettings();

    expect(shouldRequirePasswordPrompt(settings, null, 'close_shift')).toBe(false);
  });

  it('works across all sensitive action keys', () => {
    const settings = makeSettings();
    const user = makeUser(true);
    const keys: SensitiveActionKey[] = [
      'create_order',
      'delete_order',
      'deposit_cash',
      'withdraw_cash',
      'close_shift',
      'add_debtor',
      'mark_debtor_paid',
      'delete_debtor',
      'import_database',
    ];

    for (const key of keys) {
      expect(shouldRequirePasswordPrompt(settings, user, key)).toBe(true);
    }
  });
});
