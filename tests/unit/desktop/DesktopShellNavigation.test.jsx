import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '../../../src/features/floorplans/model';

const bridge = vi.hoisted(() => {
  const value = {
    invoke: vi.fn(),
    session: { get: vi.fn(), onChanged: vi.fn(), login: vi.fn(), logout: vi.fn() },
    recovery: { read: vi.fn(), write: vi.fn(), archive: vi.fn() },
  };
  window.loqDesktop = value;
  return value;
});

vi.mock('../../../src/features/floorplans/FloorPlanEditor', () => ({ default: ({ document, onChange, readOnly }) => <section aria-label="Testeditor"><h2>{document.title}</h2><button disabled={readOnly} onClick={() => onChange({ ...document, title: 'Aangepaste tekening' })}>Tekening wijzigen</button></section> }));
vi.mock('../../../src/features/floorplans/FloorPlanImportDialog', () => ({ default: () => null }));
vi.mock('../../../src/features/floorplans/importSource', () => ({ openRaster: vi.fn(), canvasToBlob: vi.fn(), encodeBase64: vi.fn() }));
vi.mock('../../../src/features/floorplans/FloorPlanPrint', () => ({ generatePrintHtml: vi.fn(), generateDocumentPrintHtml: vi.fn() }));
import App from '../../../desktop/renderer/App';

const object = { id: 'object-1', customer_id: 'customer-1', name: 'Kantoor Noord', address: 'Voorbeeldstraat 1', object_code: 'OBJ-1' };
const scope = { customer_id: object.customer_id, object_id: object.id, building_selection_key: 'bag:building-1' };
const configuration = { version: 5, building_floor_plan_selection_keys: [scope.building_selection_key], building_labels: { [scope.building_selection_key]: 'Hoofdgebouw' } };
let onlineDocument;
let localRecovery;
let archived;
let failSave;

beforeEach(() => {
  onlineDocument = createDocument('Online tekening');
  localRecovery = null;
  archived = [];
  failSave = false;
  Object.values(bridge.session).forEach(mock => mock.mockReset());
  Object.values(bridge.recovery).forEach(mock => mock.mockReset());
  bridge.session.get.mockResolvedValue({ user: { id: 'user-1', full_name: 'Voorbeeldgebruiker', email: 'test@example.test' } });
  bridge.session.onChanged.mockReturnValue(() => {});
  bridge.recovery.read.mockImplementation(async () => localRecovery);
  bridge.recovery.write.mockImplementation(async (_scope, value) => { localRecovery = structuredClone(value); });
  bridge.recovery.archive.mockImplementation(async () => { if (localRecovery) archived.push(structuredClone(localRecovery)); localRecovery = null; });
  bridge.invoke.mockReset().mockImplementation(async (action, payload) => {
    if (action === 'search_customer_objects') return { items: [object], has_more: false };
    if (action === 'get_object_map_configuration') return { configuration };
    if (action === 'get_object_building_floor_plan_workspace') return { workspace: { id: 'workspace-1', version: 1, document: onlineDocument }, configuration_version: 5 };
    if (action === 'list_object_installations') return { items: [] };
    if (action === 'save_object_building_floor_plan_draft') {
      if (failSave) throw new Error('Geen verbinding');
      return { workspace: { id: 'workspace-1', version: payload.expected_version + 1, document: payload.data.document } };
    }
    throw new Error(`Unexpected test API action: ${action}`);
  });
});
afterEach(cleanup);

async function openBuilding() {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: /Kantoor Noord.*OBJ-1/ }));
  fireEvent.click(await screen.findByRole('button', { name: /Hoofdgebouw.*Plattegronden/ }));
  await screen.findByRole('region', { name: 'Testeditor' });
  await waitFor(() => expect(within(screen.getByRole('complementary', { name: 'Hoofdnavigatie' })).getByRole('button', { name: 'Objecten' })).toBeEnabled());
}
function returnToObjects() {
  fireEvent.click(within(screen.getByRole('complementary', { name: 'Hoofdnavigatie' })).getByRole('button', { name: 'Objecten' }));
}

describe('LOQ Desktop navigation preserves work', () => {
  it('distinguishes a failed object query from an empty list and retries the same search', async () => {
    bridge.invoke.mockRejectedValueOnce(new Error('LOQ is tijdelijk niet bereikbaar'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Objecten niet beschikbaar');
    expect(screen.getByRole('alert')).toHaveTextContent('LOQ is tijdelijk niet bereikbaar');
    expect(screen.queryByText('Nog geen objecten beschikbaar')).not.toBeInTheDocument();
    expect(screen.queryByText('Geen objecten gevonden')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Volgende' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(await screen.findByRole('button', { name: /Kantoor Noord.*OBJ-1/ })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(bridge.invoke.mock.calls.filter(([action]) => action === 'search_customer_objects')).toEqual([
      ['search_customer_objects', { search: '', page: 1, page_size: 50 }],
      ['search_customer_objects', { search: '', page: 1, page_size: 50 }],
    ]);
  });

  it('loads saved building identities and flushes edits before returning to the object list', async () => {
    await openBuilding();
    expect(bridge.invoke).toHaveBeenCalledWith('get_object_building_floor_plan_workspace', scope);
    fireEvent.click(screen.getByRole('button', { name: 'Tekening wijzigen' }));
    returnToObjects();
    await screen.findByRole('heading', { name: 'Objecten' });
    expect(bridge.invoke).toHaveBeenCalledWith('save_object_building_floor_plan_draft', expect.objectContaining({ ...scope, expected_map_version: 5, expected_version: 1, data: { document: expect.objectContaining({ title: 'Aangepaste tekening' }) } }));
    expect(localRecovery.document.title).toBe('Aangepaste tekening');
    expect(localRecovery.dirty).toBe(false);
  });

  it('retains the active editor and a recovery copy if saving during navigation fails', async () => {
    await openBuilding();
    failSave = true;
    fireEvent.click(screen.getByRole('button', { name: 'Tekening wijzigen' }));
    returnToObjects();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Geen verbinding'));
    expect(screen.getByRole('region', { name: 'Testeditor' })).toBeVisible();
    expect(localRecovery.document.title).toBe('Aangepaste tekening');
    expect(localRecovery.dirty).toBe(true);
    expect(localRecovery.pending).toBeTruthy();
  });

  it('preserves an unresolved local recovery copy when leaving for the object list', async () => {
    localRecovery = { document: { ...structuredClone(onlineDocument), title: 'Niet opgeslagen lokaal werk' }, serverVersion: 1, dirty: true, serial: 1, savedSerial: 0 };
    await openBuilding();
    expect(screen.getByText('Er staat een lokale herstelkopie op deze Mac.')).toBeVisible();
    returnToObjects();
    await screen.findByRole('heading', { name: 'Objecten' });
    const preserved = [localRecovery, ...archived].filter(Boolean);
    expect(preserved.some(copy => copy.document.title === 'Niet opgeslagen lokaal werk')).toBe(true);
  });
});
