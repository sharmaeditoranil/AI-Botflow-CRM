import { describe, expect, it } from 'vitest';
import {
  extractValueByPath,
  extractTemplateVariables,
  generateIncomingWebhookSecret,
  safeCompareSecrets,
  INCOMING_WEBHOOK_SECRET_PREFIX,
  findSmartService,
  findSmartCity,
  findSmartMessage,
  findSmartEmail,
  extractLeadSummary,
  flattenPayload,
  detectWebhookFields,
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

  it('substitutes fallback when mapping path is not found in payload', () => {
    const mappings = {
      '1': 'customer.unknown_field',
      '2': 'total',
    };
    const { params } = extractTemplateVariables(payload, mappings);
    expect(params).toEqual(['Customer', '₹2,500']);
  });
});

describe('Smart Lead Field Extraction', () => {
  it('extracts service, city, message, and email from common payload shapes', () => {

    const formPayload = {
      name: 'Rohan Verma',
      mobile: '9876543210',
      service_name: 'Digital Marketing',
      city: 'Delhi',
      extra_message: 'Please send pricing plans and case studies',
      email: 'rohan@example.com',
      budget: '25,000',
    };

    expect(findSmartService(formPayload)).toBe('Digital Marketing');
    expect(findSmartCity(formPayload)).toBe('Delhi');
    expect(findSmartMessage(formPayload)).toBe('Please send pricing plans and case studies');
    expect(findSmartEmail(formPayload)).toBe('rohan@example.com');

    const summary = extractLeadSummary(formPayload);
    expect(summary.service).toBe('Digital Marketing');
    expect(summary.city).toBe('Delhi');
    expect(summary.message).toBe('Please send pricing plans and case studies');
    expect(summary.email).toBe('rohan@example.com');
    expect(summary.formattedNote).toContain('• Service: Digital Marketing');
    expect(summary.formattedNote).toContain('• City: Delhi');
    expect(summary.formattedNote).toContain('• Extra Message: Please send pricing plans and case studies');
    expect(summary.formattedNote).toContain('• Budget: 25,000');
  });

  it('handles nested objects for service and city (e.g. lead.service, fields.city)', () => {

    const nestedPayload = {
      lead: {
        service: 'Hair Transplant',
        city: 'Jaipur',
      },
      notes: {
        comments: 'Weekend consultation required',
      },
    };

    expect(findSmartService(nestedPayload)).toBe('Hair Transplant');
    expect(findSmartCity(nestedPayload)).toBe('Jaipur');
    expect(findSmartMessage(nestedPayload)).toBe('Weekend consultation required');
  });
});

describe('Universal Webhook Payload Flattening & Field Detection', () => {
  const universalPayload = {
    name: 'Anil Sharma',
    phone: '+919876543210',
    email: 'anil@example.com',
    amount: '4999.00',
    secret: 'whsec_secret123',
    token: 'jwt_token_abc',
    payment: {
      id: 'pay_987654321',
      status: 'captured',
      method: 'upi',
    },
    customer: {
      name: 'Anil Sharma',
      address: {
        city: 'Mumbai',
        pincode: '400001',
      },
    },
    order: {
      id: 'ord_123456',
      items: [
        { name: 'CRM Pro Plan', price: 4999 },
      ],
    },
  };

  it('flattens complex nested payloads into dot-notation paths', () => {
    const flat = flattenPayload(universalPayload);

    expect(flat['name']).toBe('Anil Sharma');
    expect(flat['phone']).toBe('+919876543210');
    expect(flat['email']).toBe('anil@example.com');
    expect(flat['amount']).toBe('4999.00');
    expect(flat['payment.id']).toBe('pay_987654321');
    expect(flat['payment.status']).toBe('captured');
    expect(flat['customer.name']).toBe('Anil Sharma');
    expect(flat['customer.address.city']).toBe('Mumbai');
    expect(flat['order.id']).toBe('ord_123456');
    expect(flat['order.items.0.name']).toBe('CRM Pro Plan');
    expect(flat['order.items.0.price']).toBe(4999);
  });

  it('detects available webhook fields excluding sensitive tokens', () => {
    const fields = detectWebhookFields(universalPayload);

    expect(fields).toContain('name');
    expect(fields).toContain('phone');
    expect(fields).toContain('email');
    expect(fields).toContain('amount');
    expect(fields).toContain('payment.id');
    expect(fields).toContain('customer.name');
    expect(fields).toContain('order.id');

    // Sensitive keys must be excluded
    expect(fields).not.toContain('secret');
    expect(fields).not.toContain('token');
  });

  it('extracts values using webhook. prefix and {{webhook.}} placeholders', () => {
    expect(extractValueByPath(universalPayload, 'webhook.name')).toBe('Anil Sharma');
    expect(extractValueByPath(universalPayload, 'webhook.amount')).toBe('4999.00');
    expect(extractValueByPath(universalPayload, 'webhook.payment.id')).toBe('pay_987654321');
    expect(extractValueByPath(universalPayload, '{{webhook.order.id}}')).toBe('ord_123456');
    expect(extractValueByPath(universalPayload, 'webhook.customer.address.city')).toBe('Mumbai');

    // Non-existent field returns null safely without throwing
    expect(extractValueByPath(universalPayload, 'webhook.non_existent_field')).toBeNull();
  });

  it('extracts template variables mapped to webhook.* fields accurately', () => {
    const mappings = {
      '1': 'webhook.name',
      '2': 'webhook.amount',
      '3': 'webhook.payment.id',
      '4': 'webhook.missing_field',
    };

    const { params, mappedValues } = extractTemplateVariables(universalPayload, mappings, 'Anil Sharma');

    expect(params[0]).toBe('Anil Sharma');
    expect(params[1]).toBe('4999.00');
    expect(params[2]).toBe('pay_987654321');
    // Missing field falls back safely without crash
    expect(params[3]).toBe('Anil Sharma');

    expect(mappedValues['1']).toBe('Anil Sharma');
    expect(mappedValues['2']).toBe('4999.00');
    expect(mappedValues['3']).toBe('pay_987654321');
  });
});


