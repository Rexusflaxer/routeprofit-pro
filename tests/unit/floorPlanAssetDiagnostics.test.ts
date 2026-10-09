import { randomBytes, webcrypto } from 'node:crypto';
import { TextEncoder } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuildingFloorPlanHandlers } from '../../base44/shared/floorPlans/buildingFloorPlans';

class ApiError extends Error {
  constructor(public status: number, message: string, public details: {code: string}) { super(message); }
}
const sensitiveError = new Error('private-provider-url-and-key-do-not-expose');
let env: any;
beforeEach(async () => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Uint8Array', new TextEncoder().encode('').constructor);
  const masterBytes = randomBytes(32), dataBytes = randomBytes(32), wrapIv = randomBytes(12), imageIv = randomBytes(12);
  const master = await crypto.subtle.importKey('raw', masterBytes, 'AES-GCM', false, ['encrypt']);
  const dataKey = await crypto.subtle.importKey('raw', dataBytes, 'AES-GCM', false, ['encrypt']);
  const plaintext = Buffer.from('synthetic floor plan');
  const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv: imageIv}, dataKey, plaintext);
  const wrapped = await crypto.subtle.encrypt({name: 'AES-GCM', iv: wrapIv}, master, dataBytes);
  const to64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as any).toString('base64');
  const file = {file_uri: 'private:synthetic', key_wrap_iv: to64(wrapIv), encryption_iv: to64(imageIv),
    encrypted_data_key: to64(wrapped), ciphertext_sha256: to64(await crypto.subtle.digest('SHA-256', ciphertext)),
    plaintext_sha256: to64(await crypto.subtle.digest('SHA-256', plaintext))};
  const sign = vi.fn(async () => ({signed_url: 'https://synthetic.invalid/encrypted'}));
  const fetchMock = vi.fn(async () => new Response(ciphertext));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('Deno', {env: {get: () => to64(masterBytes)}});
  const base44 = {asServiceRole: {integrations: {Core: {CreateFileSignedUrl: sign}}}};
  const handler = createBuildingFloorPlanHandlers({ApiError}).serverOnly.decryptAsset;
  env = {base44, sign, fetchMock, file, ciphertext, expected: to64(plaintext), run: () => handler(base44, file)};
});
afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

async function expectStage(code: string, status: number) {
  try {await env.run(); throw Error('Expected asset failure');}
  catch (error: any) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({status, details: {code}});
    expect(error.message).not.toContain(sensitiveError.message);
    expect(JSON.stringify(error)).not.toMatch(/private-provider|synthetic\.invalid|private:synthetic/);
  }
}
function prepareRead(create = vi.fn(async () => ({}))) {
  Object.assign(env.file, {id: 'file-1', owner_type: 'object', owner_id: 'object-1', object_id: 'object-1', customer_id: 'customer-1',
    company_id: null, tenant_container_key: 'object:object-1', owner_container_key: 'object:object-1',
    domain: 'operations', category: 'building_floor_plan', status: 'active', storage_visibility: 'private', encrypted: true,
    encryption_algorithm: 'AES-256-GCM', key_wrap_algorithm: 'AES-256-GCM', source_entity: 'ObjectBuildingFloorPlanWorkspace',
    source_entity_id: 'upload-1', size_bytes: 20, metadata: {building_key_hash: 'key-hash', asset_kind: 'background'}});
  env.base44.asServiceRole.entities = {ManagedFileAccessLog: {create}};
  const handler = createBuildingFloorPlanHandlers({ApiError,
    entity: (base44: any, name: string) => base44.asServiceRole.entities[name],
    requireScope: async () => ({customer: {id: 'customer-1'}, object: {id: 'object-1'}}),
    selectionKeys: () => ['point:building-1'], sha256: async () => 'key-hash',
    requireRecord: async () => env.file, nowIso: () => '2026-10-10T00:00:00Z'});
  env.run = () => handler.read(env.base44, {id: 'actor-1'}, {action: 'read_object_building_floor_plan_asset',
    building_selection_key: 'point:building-1', file_id: 'file-1'});
  return create;
}

describe('Private floor-plan asset failure stages', () => {
  it('preserves authenticated decryption and strict redirect handling', async () => {
    await expect(env.run()).resolves.toBe(env.expected);
    expect(env.fetchMock).toHaveBeenCalledWith('https://synthetic.invalid/encrypted', {redirect: 'manual'});
  });
  it('classifies signing failure without retaining provider data', async () => {
    env.sign.mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_signing_failed', 502);
    expect(env.fetchMock).not.toHaveBeenCalled();
  });
  it('classifies transport and redirect errors without following them', async () => {
    env.fetchMock.mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_fetch_failed', 502);
  });
  it.each([
    ['redirect', new TypeError('redirect encountered for https://private.invalid?token=secret')],
    ['redirect_unsupported', new TypeError('redirect mode error is not supported')],
    ['redirect_unsupported', new TypeError("Invalid redirect value, must be one of 'follow' or 'manual' ('error' won't be implemented)")],
    ['tls', new TypeError('fetch failed', {cause: new Error('invalid peer certificate: UnknownIssuer secret')})],
    ['dns', new TypeError('fetch failed', {cause: Object.assign(new Error('lookup private.invalid secret'), {code: 'ENOTFOUND'})})],
    ['timeout', new DOMException('private.invalid timed out', 'TimeoutError')],
    ['unknown', sensitiveError],
  ])('exposes only the fixed %s transport reason', async (reason, failure) => {
    env.fetchMock.mockRejectedValueOnce(failure);
    try {await env.run(); throw Error('Expected transport failure');}
    catch (error: any) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error.details).toEqual({code: 'floor_plan_asset_fetch_failed', reason});
      expect(JSON.stringify(error)).not.toMatch(/private\.invalid|token|secret|private-provider/);
    }
    expect(env.fetchMock).toHaveBeenCalledWith('https://synthetic.invalid/encrypted', {redirect: 'manual'});
  });
  it.each([301, 302, 303, 307, 308])('rejects HTTP %s without following, decrypting or recording a download', async status => {
    const audit = prepareRead();
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
    env.fetchMock.mockResolvedValueOnce(new Response(env.ciphertext, {status, headers: {location: 'https://another.invalid/private'}}));
    await expectStage('floor_plan_asset_unavailable', 502);
    expect(env.fetchMock).toHaveBeenCalledExactlyOnceWith('https://synthetic.invalid/encrypted', {redirect: 'manual'});
    expect(decrypt).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
  it('classifies interrupted streaming before decryption', async () => {
    env.fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({start(controller) {controller.error(sensitiveError);}})));
    await expectStage('floor_plan_asset_stream_failed', 502);
  });
  it('preserves existing explicit ciphertext integrity failure', async () => {
    env.file.ciphertext_sha256 = 'incorrect';
    await expectStage('floor_plan_asset_integrity', 409);
  });
  it('classifies crypto-provider hashing failure', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_cipher_hash_failed', 503);
  });
  it('preserves the explicit missing master-key configuration error', async () => {
    vi.stubGlobal('Deno', {env: {get: () => undefined}});
    await expectStage('managed_file_crypto_unavailable', 503);
  });
  it('classifies master-key import failure', async () => {
    vi.spyOn(crypto.subtle, 'importKey').mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_master_key_failed', 503);
  });
  it('classifies a failed data-key unwrap', async () => {
    vi.spyOn(crypto.subtle, 'decrypt').mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_key_unwrap_failed', 503);
  });
  it('classifies data-key import separately from master-key import', async () => {
    const original = crypto.subtle.importKey.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'importKey').mockImplementationOnce(original).mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_key_import_failed', 503);
  });
  it('classifies content decryption separately from key unwrap', async () => {
    const original = crypto.subtle.decrypt.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'decrypt').mockImplementationOnce(original).mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_decryption_failed', 409);
  });
  it('classifies plaintext hashing failure and preserves plaintext mismatch rejection', async () => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(original).mockRejectedValueOnce(sensitiveError);
    await expectStage('floor_plan_asset_plaintext_hash_failed', 503);
    vi.restoreAllMocks();
    env.file.plaintext_sha256 = 'incorrect';
    await expectStage('floor_plan_asset_integrity', 409);
  });
  it('does not return decrypted bytes when the guarded download audit fails', async () => {
    const create = vi.fn().mockRejectedValueOnce(sensitiveError);
    prepareRead(create);
    await expectStage('floor_plan_asset_audit_failed', 503);
    expect(create).toHaveBeenCalledOnce();
    expect(JSON.stringify(create.mock.calls)).not.toContain(env.expected);
  });
});
