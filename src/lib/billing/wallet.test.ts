import { describe, it, expect } from 'vitest';
import {
  calculateMessageCost,
  DEFAULT_WALLET_RATES,
  type WalletRates,
} from './wallet';

describe('Wallet Billing — calculateMessageCost', () => {
  it('correctly maps marketing template category to marketing rate', () => {
    const cost = calculateMessageCost('marketing');
    expect(cost).toBe(DEFAULT_WALLET_RATES.marketing);
  });

  it('correctly maps utility template category to utility rate', () => {
    const cost = calculateMessageCost('utility');
    expect(cost).toBe(DEFAULT_WALLET_RATES.utility);
  });

  it('correctly maps auth template category to auth rate', () => {
    const cost = calculateMessageCost('authentication');
    expect(cost).toBe(DEFAULT_WALLET_RATES.auth);
  });

  it('falls back to service chat rate when category is missing or service', () => {
    expect(calculateMessageCost(null)).toBe(DEFAULT_WALLET_RATES.service);
    expect(calculateMessageCost(undefined)).toBe(DEFAULT_WALLET_RATES.service);
    expect(calculateMessageCost('service')).toBe(DEFAULT_WALLET_RATES.service);
  });

  it('respects custom rates passed from platform settings', () => {
    const customRates: WalletRates = {
      marketing: 1.25,
      utility: 0.30,
      service: 0.50,
      auth: 0.20,
      enabled: true,
    };
    expect(calculateMessageCost('marketing', customRates)).toBe(1.25);
    expect(calculateMessageCost('utility', customRates)).toBe(0.30);
    expect(calculateMessageCost('auth', customRates)).toBe(0.20);
    expect(calculateMessageCost('service', customRates)).toBe(0.50);
  });
});
