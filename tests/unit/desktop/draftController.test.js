import { describe, it, expect, vi, afterEach } from 'vitest';
import { DraftController } from '../../../desktop/renderer/draftController';
const document = label => ({schemaVersion: 1, id: 'd1', label});
const scope = {customer_id: 'c', object_id: 'o', building_selection_key: 'manual:b'};
function setup(invoke) {
  const bridge = {invoke: vi.fn(invoke), recovery: {write: vi.fn(async () => true)}};
  const states = [];
  const controller = new DraftController({bridge, scope, mapVersion: 3, workspace: {version: 1}, document: document('initial'), onState: value => states.push(value)});
  return {bridge, controller, states};
}
afterEach(() => vi.useRealTimers());
describe('desktop serial autosave', () => {
  it('saves edits made during an in-flight save using the returned next version', async () => {
    vi.useFakeTimers();
    let finish;
    const f = setup(() => new Promise(resolve => {finish = resolve;}));
    f.controller.update(document('first'));
    const save = f.controller.flush();
    await vi.waitFor(() => expect(f.bridge.invoke).toHaveBeenCalledTimes(1));
    f.controller.update(document('second'));
    f.bridge.invoke.mockImplementationOnce(async () => ({workspace: {version: 3}}));
    finish({workspace: {version: 2}});
    await save;
    expect(f.bridge.invoke).toHaveBeenCalledTimes(2);
    expect(f.bridge.invoke.mock.calls[1][1]).toMatchObject({expected_version: 2, data: {document: document('second')}});
    expect(f.controller.version).toBe(3);
    expect(f.states.at(-1).status).toBe('saved'); f.controller.dispose();
  });
  it('retries an uncertain response with the same mutation ID and preserves encrypted recovery first', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {throw new Error('timeout');});
    f.controller.update(document('change'));
    await expect(f.controller.flush()).rejects.toThrow('timeout');
    const first = f.bridge.invoke.mock.calls[0][1];
    expect(f.bridge.recovery.write).toHaveBeenCalled();
    f.bridge.invoke.mockResolvedValueOnce({workspace: {version: 2}});
    await f.controller.flush();
    expect(f.bridge.invoke.mock.calls[1][1]).toEqual(first); f.controller.dispose();
  });
  it('halts on conflicts without clearing or replacing either document', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {const e = new Error('conflict'); e.status = 409; throw e;});
    f.controller.update(document('local'));
    await expect(f.controller.flush()).rejects.toThrow('conflict');
    expect(f.controller.document).toEqual(document('local'));
    expect(f.controller.stopped).toBe(true);
    expect(f.controller.pending).toBeNull();
    expect(f.bridge.recovery.write.mock.calls.at(-1)[1]).toMatchObject({document: document('local'), pending: null, dirty: true});
    await expect(f.controller.flush()).rejects.toThrow('versieconflict');
    expect(f.bridge.invoke).toHaveBeenCalledTimes(1); f.controller.dispose();
  });
});

describe('durable publication sequencing', () => {
  it('saves the current draft before publishing and updates the next draft version', async () => {
    vi.useFakeTimers();
    const f = setup(async (action, payload) => ({workspace: {version: payload.expected_version + 1, current_published_floor_plan_id: action.startsWith('publish') ? 'pub-1' : null}}));
    f.controller.update(document('new drawing'));
    await f.controller.publish();
    expect(f.bridge.invoke.mock.calls.map(call => call[0])).toEqual(['save_object_building_floor_plan_draft', 'publish_object_building_floor_plan']);
    expect(f.bridge.invoke.mock.calls[1][1]).toMatchObject({expected_version: 2, expected_current_floor_plan_id: null});
    expect(f.controller.version).toBe(3); expect(f.controller.currentPublishedFloorPlanId).toBe('pub-1');
    f.controller.update(document('next edit')); await f.controller.flush();
    expect(f.bridge.invoke.mock.calls[2][1].expected_version).toBe(3);
    f.controller.dispose();
  });
  it('persists the immutable publication envelope before sending and retries it before later edits', async () => {
    vi.useFakeTimers();
    const f = setup(async () => { throw new Error('publication response timed out'); });
    await expect(f.controller.publish()).rejects.toThrow('timed out');
    const request = f.bridge.invoke.mock.calls[0][1];
    const savedRecovery = f.bridge.recovery.write.mock.calls.find(call => call[1].pendingPublication)?.[1];
    expect(savedRecovery.pendingPublication.payload).toEqual(request);
    expect(f.bridge.recovery.write.mock.invocationCallOrder[0]).toBeLessThan(f.bridge.invoke.mock.invocationCallOrder[0]);
    f.controller.update(document('edit after uncertain publication'));
    f.bridge.invoke.mockImplementation(async (action, payload) => ({workspace: {version: payload.expected_version + 1, current_published_floor_plan_id: 'pub-1'}}));
    await f.controller.flush();
    expect(f.bridge.invoke.mock.calls[1]).toEqual(['publish_object_building_floor_plan', request]);
    expect(f.bridge.invoke.mock.calls[2][0]).toBe('save_object_building_floor_plan_draft');
    expect(f.bridge.invoke.mock.calls[2][1]).toMatchObject({expected_version: 2, data: {document: document('edit after uncertain publication')}});
    expect(f.controller.version).toBe(3); expect(f.controller.pendingPublication).toBeNull();
    f.controller.dispose();
  });
  it('clicking publish again after unknown output replays once without making a second publication', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {throw new Error('lost output');});
    await expect(f.controller.publish()).rejects.toThrow(); const request = f.bridge.invoke.mock.calls[0][1];
    f.bridge.invoke.mockResolvedValueOnce({workspace: {version: 2, current_published_floor_plan_id: 'pub-1'}, replayed: true});
    const result = await f.controller.publish();
    expect(result.replayed).toBe(true); expect(f.bridge.invoke).toHaveBeenCalledTimes(2);
    expect(f.bridge.invoke.mock.calls[1][1]).toEqual(request); f.controller.dispose();
  });
  it('recovers an uncertain publication on restart when its server version already advanced', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {throw new Error('lost output');});
    await expect(f.controller.publish()).rejects.toThrow();
    const recovery = f.bridge.recovery.write.mock.calls.at(-1)[1]; f.controller.dispose();
    const bridge = {invoke: vi.fn(async () => ({workspace: {version: 2, current_published_floor_plan_id: 'pub-1'}, replayed: true})), recovery: {write: vi.fn(async () => true)}};
    const restored = new DraftController({bridge, scope, mapVersion: 8, workspace: {version: 2, current_published_floor_plan_id: 'pub-1'}, document: document('initial'), recovery});
    await restored.flush();
    expect(bridge.invoke).toHaveBeenCalledTimes(1);
    expect(bridge.invoke.mock.calls[0][1]).toMatchObject({expected_version: 1, expected_map_version: 3, idempotency_key: recovery.pendingPublication.payload.idempotency_key});
    expect(restored.version).toBe(2); expect(restored.pendingPublication).toBeNull();
    expect(bridge.recovery.write.mock.calls.at(-1)[1].dirty).toBe(false); restored.dispose();
  });
  it('keeps edits made after an uncertain publication across restart and saves them only after replay', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {throw new Error('lost output');});
    await expect(f.controller.publish()).rejects.toThrow();
    f.controller.update(document('additional local changes')); await f.controller.persist();
    const recovery = f.bridge.recovery.write.mock.calls.at(-1)[1]; f.controller.dispose();
    const bridge = {invoke: vi.fn(async (action, payload) => ({workspace: {version: payload.expected_version + 1, current_published_floor_plan_id: 'pub-1'}})), recovery: {write: vi.fn(async () => true)}};
    const restored = new DraftController({bridge, scope, mapVersion: 3, workspace: {version: 2}, document: recovery.document, recovery});
    await restored.flush();
    expect(bridge.invoke.mock.calls.map(call => call[0])).toEqual(['publish_object_building_floor_plan', 'save_object_building_floor_plan_draft']);
    expect(bridge.invoke.mock.calls[1][1]).toMatchObject({expected_version: 2, data: {document: recovery.document}});
    expect(restored.version).toBe(3); restored.dispose();
  });
  it('does not overwrite newer remote changes when replay proves an older completed publication', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {throw new Error('lost output');});
    await expect(f.controller.publish()).rejects.toThrow();
    f.controller.update(document('local edit')); await f.controller.persist();
    const recovery = f.bridge.recovery.write.mock.calls.at(-1)[1]; f.controller.dispose();
    const bridge = {invoke: vi.fn(async () => ({workspace: {version: 2, current_published_floor_plan_id: 'old-publication'}, replayed: true})), recovery: {write: vi.fn(async () => true)}};
    const restored = new DraftController({bridge, scope, mapVersion: 3, workspace: {version: 4, current_published_floor_plan_id: 'newer-publication'}, document: recovery.document, recovery});
    await expect(restored.flush()).rejects.toMatchObject({status: 409});
    expect(bridge.invoke).toHaveBeenCalledTimes(1); expect(restored.version).toBe(4); expect(restored.stopped).toBe(true);
    expect(restored.document).toEqual(document('local edit')); expect(restored.pendingPublication).toBeNull(); restored.dispose();
  });
  it('discards definitive rejected publication envelopes and retains local document for comparison', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {const error = new Error('The map changed'); error.status = 409; error.details = {code: 'building_configuration_conflict'}; throw error;});
    await expect(f.controller.publish()).rejects.toMatchObject({status: 409});
    expect(f.controller.pendingPublication).toBeNull(); expect(f.controller.stopped).toBe(true);
    expect(f.bridge.recovery.write.mock.calls.at(-1)[1]).toMatchObject({document: document('initial'), pendingPublication: null});
    f.controller.dispose();
  });
  it('retains a retryable conflict envelope without freezing the drawing forever', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {const error = new Error('busy'); error.status = 409; error.details = {retryable: true}; throw error;});
    await expect(f.controller.publish()).rejects.toThrow('busy');
    expect(f.controller.pendingPublication).toBeTruthy(); expect(f.controller.stopped).toBe(false);
    const first = f.bridge.invoke.mock.calls[0][1]; f.bridge.invoke.mockResolvedValueOnce({workspace: {version: 2, current_published_floor_plan_id: 'pub-1'}});
    await f.controller.publish(); expect(f.bridge.invoke.mock.calls[1][1]).toEqual(first); f.controller.dispose();
  });
  it('does not create a second revision when clearing the durable publication receipt fails', async () => {
    vi.useFakeTimers();
    const f = setup(async (_action, payload) => ({workspace: {version: payload.expected_version + 1, current_published_floor_plan_id: 'pub-1'}}));
    let failed = false;
    f.bridge.recovery.write.mockImplementation(async (_scope, data) => {if (!data.pendingPublication && data.serverVersion === 2 && !failed) {failed = true; throw new Error('disk temporarily unavailable');} return true;});
    await expect(f.controller.publish()).rejects.toThrow('disk temporarily unavailable');
    expect(f.controller.pendingPublication).toBeTruthy();
    await f.controller.publish();
    expect(f.bridge.invoke.mock.calls[1][1]).toEqual(f.bridge.invoke.mock.calls[0][1]);
    expect(f.controller.version).toBe(2); f.controller.dispose();
  });
  it('keeps publication asset IDs immutable on retries even when callers offer newer files', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {throw new Error('lost output');});
    await expect(f.controller.publish(undefined, {pdf_file_id: 'pdf-first', preview_2d_file_id: 'preview-first'})).rejects.toThrow();
    const original = f.bridge.invoke.mock.calls[0][1]; expect(original.data).toEqual({pdf_file_id: 'pdf-first', preview_2d_file_id: 'preview-first'});
    f.bridge.invoke.mockResolvedValueOnce({workspace: {version: 2, current_published_floor_plan_id: 'pub-1'}});
    await f.controller.publish(undefined, {pdf_file_id: 'pdf-other'});
    expect(f.bridge.invoke.mock.calls[1][1]).toEqual(original); f.controller.dispose();
  });
  it('coalesces two simultaneous publish calls into one revision request', async () => {
    vi.useFakeTimers();
    const f = setup(async (_action, payload) => ({workspace: {version: payload.expected_version + 1, current_published_floor_plan_id: 'pub-1'}}));
    const [one, two] = await Promise.all([f.controller.publish(), f.controller.publish()]);
    expect(one).toEqual(two); expect(f.bridge.invoke).toHaveBeenCalledTimes(1); f.controller.dispose();
  });
  it('allows correcting an invalid draft instead of retrying its rejected payload forever', async () => {
    vi.useFakeTimers();
    const f = setup(async () => {const error = new Error('invalid document'); error.status = 400; throw error;});
    f.controller.update(document('invalid')); await expect(f.controller.flush()).rejects.toMatchObject({status: 400});
    expect(f.controller.pending).toBeNull(); expect(f.controller.stopped).toBe(false);
    f.controller.update(document('corrected')); f.bridge.invoke.mockResolvedValueOnce({workspace: {version: 2}}); await f.controller.flush();
    expect(f.bridge.invoke.mock.calls[1][1].data.document).toEqual(document('corrected')); f.controller.dispose();
  });
});
