/** Public sources are proposals bound to an existing, authorized selection.
 * Preparing a source package never edits or publishes a drawing. */
import { geoJsonFeatures, safeStoredBuildingCollection, safeStoredBuildingSelectionPoints } from './buildingFloorPlanScope.ts';
import { discoverPublicBuildingReferences, preparePublicAerial, geographicToRD, containsReferencePoint } from './publicBuildingSources.ts';

type Dict = Record<string, any>;
const READS = new Set(['get_object_building_reference_candidates']);
const WRITES = new Set(['prepare_object_building_reference_import']);
const CANDIDATE_TTL_SECONDS = 15 * 60;
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const to64 = (value: Uint8Array) => { let result = ''; for (const byte of value) result += String.fromCharCode(byte); return btoa(result); };

export function publicReferenceSelection(object: Dict, selectionKey: string) {
  if (selectionKey.startsWith('point:')) {
    const point = safeStoredBuildingSelectionPoints(object).value.find((item: Dict) => `point:${item.id}` === selectionKey);
    return point ? { selectionKey, selectedPoint: [point.longitude, point.latitude] as [number, number] } : null;
  }
  const feature = geoJsonFeatures(safeStoredBuildingCollection(object).value).find((item: Dict) => {
    const p = item.properties || {};
    return `${p.source === 'pdok_bag' ? 'bag' : 'manual'}:${p.source === 'pdok_bag' ? p.source_feature_id : p.local_id || item.id}` === selectionKey;
  });
  if (!feature) return null;
  const p = feature.properties || {};
  return { selectionKey, selectedGeometry: feature.geometry, ...(p.source === 'pdok_bag' ? { bagFeatureId: p.source_feature_id, ...(/^\d{16}$/.test(p.source_identificatie) ? { bagId: p.source_identificatie } : {}) } : {}) };
}

export function createBuildingReferenceHandlers(deps: Dict) {
  const { ApiError, sha256, nowIso, versionOf, floorPlans } = deps;
  const discover = deps.discover || discoverPublicBuildingReferences;
  const prepareAerial = deps.prepareAerial || preparePublicAerial;
  const storage = floorPlans.serverOnly;
  const fail = (status: number, message: string, code: string) => { throw new ApiError(status, message, { code }); };
  const checkedScope = async (base44: any, body: Dict, mutable = false) => {
    const state = await storage.scope(base44, body, mutable);
    if (!Number.isSafeInteger(body.expected_map_version) || body.expected_map_version !== versionOf(state.object)) fail(409, 'De gebouwselectie is gewijzigd. Open het gebouw opnieuw.', 'building_configuration_conflict');
    const selection = publicReferenceSelection(state.object, state.key);
    if (!selection) fail(409, 'De opgeslagen gebouwselectie is niet beschikbaar.', 'building_selection_unavailable');
    return { ...state, selection };
  };
  const scopeData = (state: Dict) => ({ customer_id: state.customer.id, object_id: state.object.id, building_selection_key: state.key, map_version: versionOf(state.object) });
  const candidateFacts = (candidate: Dict) => ({
    id: candidate.id, source: candidate.source, sourceId: candidate.sourceId, bagId: candidate.bagId || null,
    structureType: candidate.structureType, matching: candidate.matching, geometry: candidate.geometry,
    polygons: candidate.polygons, geoReference: candidate.geoReference,
    provenance: { version: candidate.provenance?.version || null, registeredAt: candidate.provenance?.registeredAt || null, license: candidate.provenance?.license, attribution: candidate.provenance?.attribution },
  });
  const candidateId = async (state: Dict, candidate: Dict, expires: number) => `v1.${expires}.${await sha256(JSON.stringify(canonical({ ...scopeData(state), expires, candidate: candidateFacts(candidate) })))}`;
  const duplicates = (state: Dict, candidate: Dict) => {
    const keys: string[] = candidate.bagId ? geoJsonFeatures(safeStoredBuildingCollection(state.object).value)
      .filter((item: Dict) => item.properties?.source === 'pdok_bag' && item.properties?.source_identificatie === candidate.bagId)
      .map((item: Dict) => `bag:${item.properties.source_feature_id}`) : [];
    for (const point of safeStoredBuildingSelectionPoints(state.object).value) {
      const rd = geographicToRD([point.longitude, point.latitude]);
      if (containsReferencePoint({ x: rd.x - candidate.geoReference.origin.x, y: rd.y - candidate.geoReference.origin.y }, candidate.polygons)) keys.push(`point:${point.id}`);
    }
    return [...new Set(keys)].filter(key => key !== state.key);
  };
  const read = async (base44: any, _user: any, body: Dict) => {
    const state = await checkedScope(base44, body);
    const result = await discover(state.selection);
    const checkedAt = nowIso();
    const expires = Math.floor(Date.parse(checkedAt) / 1000) + CANDIDATE_TTL_SECONDS;
    const warnings = [...(result.warnings || [])];
    let aerial: Dict | null = result.aerial || null;
    if (aerial) {
      try { const preview = await prepareAerial(aerial); aerial = { ...aerial, mime_type: preview.mimeType, content_base64: to64(preview.bytes) }; }
      catch { warnings.push('De luchtfoto is tijdelijk niet beschikbaar. Je kunt de buitenvorm wel controleren.'); aerial = null; }
    }
    const candidates = await Promise.all(result.candidates.map(async (candidate: Dict) => ({ ...candidate, candidate_id: await candidateId(state, candidate, expires), duplicate_selection_keys: duplicates(state, candidate), hasModelPotential: Boolean(candidate.bagId) })));
    return {
      status: candidates.length > 1 ? 'needs_choice' : candidates.length ? warnings.length ? 'partial' : 'ready' : result.status === 'unavailable' ? 'unavailable' : 'no_match',
      checked_at: checkedAt, expires_at: new Date(expires * 1000).toISOString(), map_version: versionOf(state.object), selection_key: state.key,
      candidates, aerial, warnings,
    };
  };
  const projection = (file: Dict, manifest: Dict, replayed: boolean) => ({
    manifest_file_id: file.id, manifest_sha256: file.metadata.manifest_sha256,
    reference: { id: `reference-${file.metadata.manifest_sha256.slice(0, 24)}`, manifestFileId: file.id, manifestSha256: file.metadata.manifest_sha256, usedParts: ['footprint', ...(manifest.aerial ? ['aerial'] : []), ...(manifest.model ? ['roof'] : [])], ...(manifest.model ? { modelFileId: manifest.model.fileId } : {}), interpretation: manifest.interpretation, measurementStatus: 'unchecked', attributions: manifest.attributions },
    geoReference: manifest.geoReference, polygons: manifest.polygons, candidate: manifest.candidate,
    ...(manifest.aerial ? { aerial: manifest.aerial } : {}), ...(manifest.model ? { model: manifest.model } : {}), ...(manifest.warnings?.length ? { warnings: manifest.warnings } : {}), replayed,
  });
  const recover = async (base44: any, file: Dict) => {
    let manifest: Dict;
    try { manifest = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(await storage.decryptAsset(base44, file)), char => char.charCodeAt(0)))); }
    catch (error) { if (error instanceof ApiError) throw error; return fail(409, 'Het opgeslagen bronpakket kan niet worden gecontroleerd.', 'building_reference_manifest_invalid'); }
    return manifest;
  };
  const mutate = async (base44: any, user: any, body: Dict) => {
    const state = await checkedScope(base44, body, true);
    if (typeof body.idempotency_key !== 'string' || body.idempotency_key.length < 8 || body.idempotency_key.length > 120 || !['closed_building', 'open_structure'].includes(body.interpretation) || body.include_aerial != null && typeof body.include_aerial !== 'boolean' || body.confirmed_closed_structure != null && typeof body.confirmed_closed_structure !== 'boolean' || body.include_model != null && typeof body.include_model !== 'boolean') fail(400, 'Controleer de gekozen buitenvorm en probeer opnieuw.', 'invalid_building_reference_request');
    const payload = { ...scopeData(state), candidate_id: body.candidate_id, interpretation: body.interpretation, include_aerial: body.include_aerial === true, include_model: body.include_model === true, confirmed_closed_structure: body.confirmed_closed_structure === true };
    const fingerprint = await sha256(JSON.stringify(canonical(payload)));
    // Recover a completed immutable package before checking expiry or fetching
    // upstream sources again. This also survives a lost final HTTP response.
    const prior = await storage.findReferenceAsset(base44, user, body, 'manifest', fingerprint);
    if (prior) return projection(prior, await recover(base44, prior), true);
    // Reject a changed payload even if a previous request only stored its photo.
    const registeredAerial = await storage.findReferenceAsset(base44, user, body, 'aerial', fingerprint);
    const registeredModel = await storage.findReferenceAsset(base44, user, body, 'model', fingerprint);
    const token = typeof body.candidate_id === 'string' ? /^v1\.(\d{10})\.[a-f0-9]{64}$/.exec(body.candidate_id) : null;
    const now = Math.floor(Date.parse(nowIso()) / 1000);
    const expires = token ? Number(token[1]) : 0;
    if (!token || expires < now || expires > now + CANDIDATE_TTL_SECONDS + 5) fail(409, 'Dit voorstel is verlopen. Open de gebouwgegevens opnieuw.', 'building_reference_candidate_expired');
    const found = await discover(state.selection);
    let candidate: Dict | undefined;
    for (const current of found.candidates) if (await candidateId(state, current, expires) === body.candidate_id) { candidate = current; break; }
    if (!candidate) fail(409, 'De brongegevens zijn gewijzigd of tijdelijk niet beschikbaar. Controleer het voorstel opnieuw.', 'building_reference_candidate_changed');
    // An open structure never becomes a closed building as an accidental side
    // effect of importing its outline. The user explicitly chooses this mode.
    if (candidate!.structureType !== 'building' && body.interpretation !== 'open_structure' && body.confirmed_closed_structure !== true) fail(400, 'Bevestig eerst dat dit open of onbekende bouwwerk werkelijk gesloten muren heeft.', 'building_reference_structure_confirmation');
    let aerial: Dict | undefined;
    let aerialSource: Dict | undefined;
    let model: Dict | undefined;
    let modelSource: Dict | undefined;
    const warnings: string[] = [];
    const attributions = [candidate!.provenance.attribution].filter(Boolean);
    if (body.include_aerial) {
      let file = registeredAerial;
      if (!file) {
        if (!found.aerial) fail(409, 'Voor deze selectie is geen luchtfoto beschikbaar.', 'building_reference_aerial_unavailable');
        let photo: any;
        try { photo = await prepareAerial(found.aerial); }
        catch { return fail(502, 'De luchtfoto kon niet worden opgehaald. Probeer opnieuw of gebruik alleen de buitenvorm.', 'building_reference_aerial_unavailable'); }
        if (JSON.stringify(canonical(photo.geoReference)) !== JSON.stringify(canonical(candidate!.geoReference))) fail(409, 'De foto en buitenvorm hebben verschillende geografische oorsprongen.', 'building_reference_georeference_mismatch');
        const layout = { width: photo.width, height: photo.height, origin: photo.origin, metresPerPixel: photo.metresPerPixel, opacity: 0.5, calibrated: false };
        const source = { ...found.aerial, attribution: photo.attribution || found.aerial.attribution, retrievedAt: nowIso(), sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', photo.bytes))).map(byte => byte.toString(16).padStart(2, '0')).join('') };
        await storage.storeReferenceAsset(base44, user, body, 'aerial', { kind: 'reference_aerial', mime_type: photo.mimeType, content_base64: to64(photo.bytes) }, { reference_year: photo.year, reference_aerial: layout, reference_aerial_source: source }, fingerprint);
        file = await storage.findReferenceAsset(base44, user, body, 'aerial', fingerprint);
      }
      if (!file?.metadata?.reference_aerial || !file.metadata.reference_aerial_source) fail(409, 'De opgeslagen fotoherkomst is onvolledig.', 'building_reference_aerial_unavailable');
      aerial = { fileId: file.id, ...file.metadata.reference_aerial };
      aerialSource = file.metadata.reference_aerial_source;
      if (aerialSource?.attribution) attributions.push(aerialSource.attribution);
    }
    if (body.include_model) {
      let file = registeredModel;
      if (!file) {
        let result: any;
        try {
          if (!candidate!.bagId || typeof deps.prepareModel !== 'function') throw new Error('model unavailable');
          const points = candidate!.polygons.flat(2);
          const origin = candidate!.geoReference.origin;
          const sourceBounds = [Math.min(...points.map((p: any) => p.x)) + origin.x, Math.min(...points.map((p: any) => p.y)) + origin.y, Math.max(...points.map((p: any) => p.x)) + origin.x, Math.max(...points.map((p: any) => p.y)) + origin.y];
          result = await deps.prepareModel({ bagId: candidate!.bagId, geoReference: candidate!.geoReference, sourceBounds });
        } catch { result = { model: null, warnings: ['Het 3D-buitenmodel is tijdelijk niet beschikbaar. De buitenvorm blijft bruikbaar.'] }; }
        if (result?.warnings?.length) warnings.push(...result.warnings);
        if (result?.model) {
          const data = result.model;
          if (data.bagId !== candidate!.bagId || JSON.stringify(canonical(data.geoReference)) !== JSON.stringify(canonical(candidate!.geoReference))) fail(409, 'Het buitenmodel hoort bij een ander gebouw of coördinatenstelsel.', 'building_reference_model_mismatch');
          const modelJson = JSON.stringify(data);
          const source = { ...data.provenance, sourceYear: data.sourceYear, groundNAP: data.groundNAP, quality: data.quality, geoReference: data.geoReference, sha256: await sha256(modelJson), attributions: data.attributions };
          await storage.storeReferenceAsset(base44, user, body, 'model', { kind: 'reference_model', mime_type: 'application/json', content_base64: to64(new TextEncoder().encode(modelJson)) }, { reference_model_source: source }, fingerprint);
          file = await storage.findReferenceAsset(base44, user, body, 'model', fingerprint);
        } else if (!warnings.length) warnings.push('Voor dit gebouw is geen passend 3D-buitenmodel gevonden.');
      }
      if (file) {
        modelSource = file.metadata?.reference_model_source;
        if (!modelSource) fail(409, 'De opgeslagen modelherkomst is onvolledig.', 'building_reference_model_mismatch');
        model = { fileId: file.id, source: modelSource.source, sourceYear: modelSource.sourceYear, groundNAP: modelSource.groundNAP, quality: modelSource.quality, provenance: modelSource };
        attributions.push(...(modelSource.attributions || [modelSource.attribution]).filter(Boolean));
      }
    }
    const usedParts = ['footprint', ...(aerial ? ['aerial'] : []), ...(model ? ['roof'] : [])];
    const manifest = { schemaVersion: 1, kind: 'loq_public_building_reference', ...scopeData(state), preparedAt: nowIso(), interpretation: body.interpretation, confirmedClosedStructure: body.confirmed_closed_structure === true, candidate: candidate!, geoReference: candidate!.geoReference, polygons: candidate!.polygons, attributions: [...new Set(attributions)], warnings, ...(aerial ? { aerial, aerialSource } : {}), ...(model ? { model, modelSource } : {}) };
    const serialized = JSON.stringify(manifest);
    const manifestHash = await sha256(serialized);
    const stored = await storage.storeReferenceAsset(base44, user, body, 'manifest', { kind: 'reference_manifest', mime_type: 'application/json', content_base64: to64(new TextEncoder().encode(serialized)) }, { manifest_sha256: manifestHash, reference_interpretation: body.interpretation, reference_parts: usedParts, reference_georeference: candidate!.geoReference, reference_attributions: manifest.attributions, reference_asset_ids: [...(aerial ? [aerial.fileId] : []), ...(model ? [model.fileId] : [])], ...(model ? { reference_model_file_id: model.fileId } : {}) }, fingerprint);
    // A racing/recovered upload may have registered its own immutable metadata.
    const file = await storage.findReferenceAsset(base44, user, body, 'manifest', fingerprint);
    if (!file || file.id !== stored.file_id) fail(409, 'Het bronpakket wordt nog verwerkt. Probeer met dezelfde aanvraag opnieuw.', 'building_reference_pending');
    return projection(file, file.metadata.manifest_sha256 === manifestHash ? manifest : await recover(base44, file), Boolean(stored.replayed));
  };
  return { readActions: READS, mutationActions: WRITES, read, mutate };
}
