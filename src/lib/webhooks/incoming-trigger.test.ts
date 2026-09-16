import { describe, expect, it } from 'vitest';
import {
  extractValueByPath,
  extractTemplateVariables,
  generateIncomingWebhookSecret,
  safeCompareSecrets,
  INCOMING_WEBHOOK_SECRET_PREFIX,
} from './incoming-trigger';

describe('generateIncomingWebhookSecret', () => {
  it('generates a secret prefixed with whsec_', () => {
    const secret = generateIncomingWebhookSecret();
    expect(secret.startsWith(INCOMING_WEBHOOK_SECRET_PREFIX)).toBe(true);
    expect(secret.length).toBeGreaterThan(20);
  });

  it('generates unique secrets on each call', () => {
    const s1 = generateIncomingWebhookSecret();
    const s2 = generateIncomingWebhookSecret();
    expect(s1).not.toBe(s2);
  });
});

describe('safeCompareSecrets', () => {
  it('returns true for matching secrets', () => {
    const secret = 'whsec_test1234567890';
    expect(safeCompareSecrets(secret, secret)).toBe(true);
  });

  it('returns false for mismatched secrets or lengths', () => {
    expect(safeCompareSecrets('whsec_abc', 'whsec_xyz')).toBe(false);
    expect(safeCompareSecrets('whsec_abc', 'whsec_abcd')).toBe(false);
    expect(safeCompareSecrets('', 'whsec_abc')).toBe(false);
  });
});

describe('extractValueByPath', () => {
  const payload = {
    event: 'order.created',
    customer: {
      name: 'John Doe',
      mobile: '+919876543210',
      address: {
        city: 'Mumbai',
        zip: 400001,
      },
    },
    items: [
      { name: 'T-Shirt', price: 499 },
      { name: 'Jeans', price: 999 },
    ],
    order: {
      id: 'ORD-9871',
      is_paid: true,
      amount: 1498,
    },
  };

  it('extracts top-level properties', () => {
    expect(extractValueByPath(payload, 'event')).toBe('order.created');
  });

  it('extracts nested dot-notation paths', () => {
    expect(extractValueByPath(payload, 'customer.name')).toBe('John Doe');
    expect(extractValueByPath(payload, 'customer.mobile')).toBe('+919876543210');
    expect(extractValueByPath(payload, 'customer.address.city')).toBe('Mumbai');
  });

  it('converts numbers and booleans to strings', () => {
    expect(extractValueByPath(payload, 'customer.address.zip')).toBe('400001');
    expect(extractValueByPath(payload, 'order.is_paid')).toBe('true');
    expect(extractValueByPath(payload, 'order.amount')).toBe('1498');
  });

  it('extracts array items with bracket notation and dot notation', () => {
    expect(extractValueByPath(payload, 'items[0].name')).toBe('T-Shirt');
    expect(extractValueByPath(payload, 'items.1.name')).toBe('Jeans');
  });

  it('handles case-insensitive matching on the final token', () => {
    expect(extractValueByPath(payload, 'customer.Mobile')).toBe('+919876543210');
    expect(extractValueByPath(payload, 'customer.NAME')).toBe('John Doe');
  });

  it('returns null for missing paths or invalid input', () => {
    expect(extractValueByPath(payload, 'customer.phone_missing')).toBeNull();
    expect(extractValueByPath(payload, 'unknown.deep.path')).toBeNull();
    expect(extractValueByPath(null, 'phone')).toBeNull();
    expect(extractValueByPath(payload, '')).toBeNull();
  });
});

describe('extractTemplateVariables', () => {
  const payload = {
    customer: {
      first_name: 'Anil',
      order_id: 'WB-500',
    },
    total: '₹2,500',
  };

  it('extracts mapped values in ascending positional index order', () => {
    const mappings = {
      '1': 'customer.first_name',
      '2': 'customer.order_id',
      '3': 'total',
    };
    const { params, mappedValues } = extractTemplateVariables(payload, mappings);

    expect(params).toEqual(['Anil', 'WB-500', '₹2,500']);
    expect(mappedValues).toEqual({
      '1': 'Anil',
      '2': 'WB-500',
      '3': '₹2,500',
    });
  });

  it('handles static values prefixed with static:', () => {
    const mappings = {
      '1': 'customer.first_name',
      '2': 'static:Flash Sale 50% Off',
    };
    const { params, mappedValues } = extractTemplateVariables(payload, mappings);

    expect(params).toEqual(['Anil', 'Flash Sale 50% Off']);
    expect(mappedValues).toEqual({
      '1': 'Anil',
      '2': 'Flash Sale 50% Off',
    });
  });

  it('substitutes empty string when mapping path is not found in payload', () => {
    const mappings = {
      '1': 'customer.unknown_field',
      '2': 'total',
    };
    const { params } = extractTemplateVariables(payload, mappings);
    expect(params).toEqual(['', '₹2,500']);
  });
});
