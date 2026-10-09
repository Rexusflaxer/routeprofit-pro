import { describe, it, expect } from 'vitest';
import { newAttempt, validateCallback, scopeKey, validateAction, validatePrint } from '../../../desktop/security.mjs';

describe('desktop trust boundaries', () => {
  it('accepts only the callback bound to the pending attempt and rejects replay-window expiry', () => {
    const pending = newAttempt(); const code = 'c'.repeat(43);
    expect(validateCallback(`loq-desktop://auth-callback?state=${pending.state}&code=${code}`, pending).verifier).toBe(pending.verifier);
    expect(() => validateCallback(`loq-desktop://auth-callback?state=${'x'.repeat(43)}&code=${code}`, pending)).toThrow();
    expect(() => validateCallback(`loq-desktop://attacker?state=${pending.state}&code=${code}`, pending)).toThrow();
    expect(() => validateCallback(`loq-desktop://auth-callback?state=${pending.state}&code=${code}`, pending, pending.createdAt + 600_001)).toThrow();
    expect(() => validateCallback(`loq-desktop://auth-callback?state=${pending.state}&code=${code}&token=secret`, pending)).toThrow();
  });
  it('partitions recovery by user, customer, object and saved building identity', () => {
    const scope = {customer_id: 'c1', object_id: 'o1', building_selection_key: 'manual:b1'};
    const key = scopeKey('u1', scope);
    expect(scopeKey('u2', scope)).not.toBe(key);
    expect(scopeKey('u1', {...scope, building_selection_key: 'manual:b2'})).not.toBe(key);
    expect(scopeKey('u1', {...scope, customer_id: 'c2'})).not.toBe(key);
    expect(() => scopeKey('u1', {...scope, building_selection_key: ''})).toThrow();
  });
  it('allows a bounded API capability and forbids caller-controlled action or token fields', () => {
    expect(() => validateAction('get_object_map_configuration', {object_id: 'o'})).not.toThrow();
    expect(() => validateAction('delete_customer', {})).toThrow();
    expect(() => validateAction('get_object_map_configuration', {action: 'delete_customer'})).toThrow();
    expect(() => validateAction('get_object_map_configuration', {token: 'secret'})).toThrow();
  });
  it('prints static geometry and data images while rejecting execution or external requests', () => {
    const args = {paper: 'A4', landscape: false};
    expect(validatePrint({...args, html: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L10 0"/></svg>'}).paper).toBe('A4');
    for (const html of ['<script>alert(1)</script>', '<img onerror="alert(1)">', '<img src="file:///private/secret">', '<img src="https://attacker.test">', '<meta http-equiv="refresh" content="0;url=https://attacker.test">']) expect(() => validatePrint({...args, html})).toThrow();
  });
});
