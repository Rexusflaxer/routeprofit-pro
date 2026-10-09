import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createDocument, createFloor } from '../../src/features/floorplans/model';
import FloorPlanEditor from '../../src/features/floorplans/FloorPlanEditor';
import FloorPlanImportDialog from '../../src/features/floorplans/FloorPlanImportDialog';

vi.mock('../../src/features/floorplans/importSource', () => ({ openRaster: vi.fn(), canvasImage: vi.fn(), canvasToBlob: vi.fn(), encodeBase64: vi.fn(), openPDF: vi.fn(), renderPDFPage: vi.fn(), rotateImage: vi.fn(), validateCorners: vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('floor plan keyboard navigation', () => {
  it('closes the layer chooser with Escape and outside pointer interaction without changing the active drawing tool', () => {
    render(<FloorPlanEditor document={createDocument()} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Muur (W)' }));
    const layers = screen.getByRole('button', { name: 'Lagen' });
    fireEvent.click(layers);
    expect(screen.getByRole('group', { name: 'Zichtbare lagen' })).toBeVisible();
    fireEvent.keyDown(screen.getByLabelText('Onderlegger'), { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'Zichtbare lagen' })).not.toBeInTheDocument();
    expect(layers).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Muur (W)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(layers);
    fireEvent.pointerDown(screen.getByRole('application'));
    expect(layers).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps focus in publication review, ignores drawing shortcuts there, and restores focus on Escape', async () => {
    const onPublish = vi.fn();
    render(<FloorPlanEditor document={createDocument()} onChange={() => {}} onPublish={onPublish} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ruimte (R)' }));
    const publish = screen.getByRole('button', { name: 'Publiceren', exact: true });
    publish.focus();
    fireEvent.click(publish);
    const dialog = screen.getByRole('dialog', { name: 'Plattegrond publiceren' });
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    const close = within(dialog).getByRole('button', { name: 'Sluiten' });
    const confirm = within(dialog).getByRole('button', { name: 'Publiceren in LOQ' });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'w' });
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(publish).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Ruimte (R)' })).toHaveAttribute('aria-pressed', 'true');
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('keeps import focus inside its dialog and supports Escape without applying a drawing', async () => {
    const onClose = vi.fn(), onApply = vi.fn();
    render(<FloorPlanImportDialog open onClose={onClose} onApply={onApply} pickFile={async () => null} uploadAsset={async () => ({ file_id: 'asset' })} />);
    const dialog = screen.getByRole('dialog', { name: 'Van bestaande plattegrond naar bewerkbare muren' });
    const choose = within(dialog).getByRole('button', { name: 'Bestand kiezen' });
    const close = within(dialog).getByRole('button', { name: 'Import sluiten' });
    choose.focus();
    fireEvent.keyDown(choose, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onApply).not.toHaveBeenCalled();
  });
});


describe('floor plan initial viewport', () => {
  it('fits after the first real measurement, preserves user zoom through edits, and fits a newly opened floor', () => {
    let reportSize: ResizeObserverCallback;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { reportSize = callback; }
      observe() {}
      disconnect() {}
    });
    const doc = createDocument('Gebouw buiten de standaardweergave');
    doc.floors[0].walls = [{ id: 'ground-wall', start: { x: 120, y: 230 }, end: { x: 150, y: 250 }, thickness: .2 }];
    const upper = createFloor('Verdieping 1');
    upper.walls = [{ id: 'upper-wall', start: { x: 500, y: 600 }, end: { x: 520, y: 610 }, thickness: .2 }];
    doc.floors.push(upper);
    const onChange = vi.fn();
    const { rerender } = render(<FloorPlanEditor document={doc} onChange={onChange} />);
    const canvas = screen.getByRole('application');
    const viewport = () => canvas.getAttribute('viewBox')!.split(' ').map(Number);
    const contains = (x: number, y: number) => {
      const [left, top, width, height] = viewport();
      return x >= left && x <= left + width && -y >= top && -y <= top + height;
    };
    expect(contains(120, 230)).toBe(false);
    act(() => reportSize!([{ contentRect: { width: 600, height: 480 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(contains(120, 230)).toBe(true);
    expect(contains(150, 250)).toBe(true);
    const fittedWidth = viewport()[2];
    fireEvent.click(screen.getByRole('button', { name: 'Inzoomen' }));
    const zoomed = viewport();
    expect(zoomed[2]).toBeLessThan(fittedWidth);
    const edited = structuredClone(doc);
    edited.floors[0].walls[0].end.x += 4;
    rerender(<FloorPlanEditor document={edited} onChange={onChange} />);
    expect(viewport()).toEqual(zoomed);
    act(() => reportSize!([{ contentRect: { width: 600, height: 480 } } as ResizeObserverEntry], {} as ResizeObserver));
    expect(viewport()).toEqual(zoomed);
    fireEvent.click(screen.getByRole('button', { name: /Verdieping 1/ }));
    expect(contains(500, 600)).toBe(true);
    expect(contains(520, 610)).toBe(true);
    expect(contains(120, 230)).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });
});
