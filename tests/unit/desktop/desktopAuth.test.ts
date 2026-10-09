import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { webcrypto } from 'node:crypto';
import { handleDesktopAuth, digest, CALLBACK } from '../../../base44/functions/desktopAuth/protocol';

describe('LOQ desktop one-use login', () => {
  beforeEach(() => vi.stubGlobal('crypto', webcrypto));
  afterEach(() => vi.unstubAllGlobals());
  function fixture() {
    const rows: any[] = [];
    const user = {id: 'u1', role: 'admin', email: 'admin@example.test'};
    const grants = {create: async (value: any) => { const row = {...value, id: `g${rows.length + 1}`}; rows.push(row); return row; }, filter: async (query: any) => rows.filter(row => row.code_hash === query.code_hash && row.app_id === query.app_id).map(row => ({...row})), updateMany: async (query: any, change: any) => { const row = rows.find(row => row.id === query.id && row.status === query.status && row.version === query.version); if (!row) return {success: true, updated: 0}; Object.assign(row, change.$set); row.version += 1; return {success: true, updated: 1}; }};
    let now = 1_800_000_000_000;
    const deps = {createClientFromRequest: () => ({auth: {me: async () => user}, asServiceRole: {entities: {DesktopLoginGrant: grants}}}), createClient: ({token}: any) => ({auth: {me: async () => token === 'secret-token' ? user : null}}), env: () => btoa('k'.repeat(32)), now: () => now};
    const invoke = (body: any) => handleDesktopAuth(new Request('https://example.test/desktopAuth', {method: 'POST', headers: {Authorization: 'Bearer secret-token'}, body: JSON.stringify(body)}), deps);
    return {rows, user, deps, invoke, advance: () => {now += 120_001;}};
  }
  async function approve(f: ReturnType<typeof fixture>) {
    const verifier = 'v'.repeat(43), state = 's'.repeat(43);
    const response = await f.invoke({action: 'approve', state, challenge: await digest(verifier), redirect_uri: CALLBACK});
    expect(response.status).toBe(200);
    return {...await response.json(), verifier};
  }
  it('encrypts the bearer and permits exactly one successful parallel exchange', async () => {
    const f = fixture(); const grant = await approve(f);
    expect(JSON.stringify(f.rows)).not.toContain('secret-token');
    const responses = await Promise.all([f.invoke({action: 'exchange', ...grant}), f.invoke({action: 'exchange', ...grant})]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 401]);
    const success = await responses.find(r => r.status === 200)!.json();
    expect(success.access_token).toBe('secret-token');
    expect(f.rows[0].ciphertext).toBe('');
    expect((await f.invoke({action: 'exchange', ...grant})).status).toBe(401);
  });
  it('rejects wrong verifier, wrong state, expired codes and arbitrary redirects', async () => {
    const f = fixture(); const grant = await approve(f);
    expect((await f.invoke({action: 'exchange', ...grant, verifier: 'x'.repeat(43)})).status).toBe(401);
    expect((await f.invoke({action: 'exchange', ...grant, state: 'x'.repeat(43)})).status).toBe(401);
    expect(f.rows[0].status).toBe('pending');
    f.advance(); expect((await f.invoke({action: 'exchange', ...grant})).status).toBe(401);
    expect((await f.invoke({action: 'approve', state: grant.state, challenge: await digest(grant.verifier), redirect_uri: 'https://evil.test'})).status).toBe(400);
  });
  it('requires a real administrator and a configured encryption key', async () => {
    const f = fixture(); f.user.role = 'user';
    expect((await f.invoke({action: 'approve'})).status).toBe(403);
    f.user.role = 'admin'; f.deps.env = () => '';
    expect((await f.invoke({action: 'approve', state: 's'.repeat(43), challenge: 'c'.repeat(43), redirect_uri: CALLBACK})).status).toBe(503);
    expect(f.rows).toHaveLength(0);
  });
});
