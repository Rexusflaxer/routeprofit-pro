// Every uncertain request has a durable, immutable retry envelope. Publication
// consumes a version too, so its outcome must be resolved before the next save.
export class DraftController {
  constructor({bridge, scope, mapVersion, workspace, document, recovery, onState = () => {}, onSaved = () => {}}) {
    Object.assign(this, {bridge, scope, mapVersion, document, onState, onSaved});
    this.version = workspace?.version || 0;
    this.currentPublishedFloorPlanId = workspace?.current_published_floor_plan_id || null;
    this.serial = Number.isSafeInteger(recovery?.serial) ? recovery.serial : Math.max(recovery?.pending?.serial || 0, recovery?.dirty ? 1 : 0);
    this.savedSerial = Number.isSafeInteger(recovery?.savedSerial) ? recovery.savedSerial : 0;
    this.pending = recovery?.pending ? structuredClone(recovery.pending) : null;
    // A server version one greater than the recovery version can be this very
    // publication's successful but lost response. Always replay its exact key.
    this.pendingPublication = recovery?.pendingPublication ? structuredClone(recovery.pendingPublication) : null;
    this.lastPublication = null;
    this.recoveryQueue = Promise.resolve(); this.running = null; this.publicationCall = null;
    this.timer = null; this.stopped = false; this.disposed = false;
  }
  state(status, error = null) { this.status = status; this.onState({status, error, version: this.version}); }
  persist() {
    const data = {
      document: structuredClone(this.document), serverVersion: this.version,
      serial: this.serial, savedSerial: this.savedSerial,
      pending: this.pending ? structuredClone(this.pending) : null,
      pendingPublication: this.pendingPublication ? structuredClone(this.pendingPublication) : null,
      dirty: this.savedSerial < this.serial || Boolean(this.pending) || Boolean(this.pendingPublication),
      savedAt: new Date().toISOString(),
    };
    this.recoveryQueue = this.recoveryQueue.catch(() => {}).then(() => this.bridge.recovery.write(this.scope, data));
    return this.recoveryQueue;
  }
  update(document) {
    this.document = structuredClone(document); this.serial += 1;
    if (!this.stopped) this.state('unsaved');
    this.persist().catch(error => this.state('error', `Herstelkopie mislukt: ${error.message}`));
    clearTimeout(this.timer);
    if (!this.stopped && !this.disposed) this.timer = setTimeout(() => this.flush().catch(() => {}), 1400);
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    if (this.stopped) throw new Error('Er is een versieconflict. Uw lokale tekening blijft bewaard.');
    if (this.disposed) throw new Error('Deze tekenwerkruimte is gesloten.');
    this.running = this.drain();
    try { return await this.running; } finally { this.running = null; }
  }
  acceptWorkspace(workspace, expectedVersion) {
    if (!workspace || !Number.isInteger(workspace.version) || workspace.version !== expectedVersion + 1) throw new Error('Opslagbevestiging kon niet worden gecontroleerd.');
    if (workspace.version < this.version) {
      const error = new Error('Er is intussen een nieuwere online versie. Uw lokale tekening blijft bewaard.');
      error.status = 409; error.details = {code: 'floor_plan_version_conflict'};
      throw error;
    }
    this.version = workspace.version;
    if (Object.hasOwn(workspace, 'current_published_floor_plan_id')) this.currentPublishedFloorPlanId = workspace.current_published_floor_plan_id || null;
    this.onSaved(workspace);
  }
  async fail(error, publication = false) {
    const definitiveConflict = error.status === 409 && error.details?.retryable !== true;
    if (definitiveConflict) {
      if (publication) this.pendingPublication = null;
      else this.pending = null;
      this.stopped = true; this.state('conflict', error.message);
      // Known rejected writes must not be auto-resumed forever when the user
      // chooses the online version. The dirty local document stays available.
      await this.persist().catch(() => {});
    } else if ([400, 403, 404, 413, 422].includes(error.status)) {
      // Rejected input has not been committed. Permit correcting the drawing;
      // keeping an invalid immutable save envelope would trap every later edit.
      if (publication) this.pendingPublication = null;
      else this.pending = null;
      this.state('error', error.message);
      await this.persist().catch(() => {});
    } else {
      this.state(error.status === 401 ? 'expired' : error.status === 409 ? 'error' : 'offline', error.message);
    }
    throw error;
  }
  async replayPublication() {
    const pending = this.pendingPublication;
    if (!pending) return null;
    await this.persist();
    this.state('saving');
    try {
      const result = await this.bridge.invoke('publish_object_building_floor_plan', structuredClone(pending.payload));
      this.acceptWorkspace(result.workspace, pending.payload.expected_version);
      this.lastPublication = result;
      this.pendingPublication = null;
      try { await this.persist(); } catch (error) {
        // The cloud accepted publication but the durable receipt could not be
        // cleared. Keep replaying its key instead of creating another revision.
        this.pendingPublication = pending;
        throw error;
      }
      return result;
    } catch (error) { return this.fail(error, true); }
  }
  async drain() {
    while (this.pendingPublication || this.savedSerial < this.serial || this.pending) {
      if (this.pendingPublication) { await this.replayPublication(); continue; }
      if (this.disposed) { await this.persist(); return this.version; }
      if (!this.pending) this.pending = {document: structuredClone(this.document), serial: this.serial, version: this.version, mapVersion: this.mapVersion, idempotencyKey: crypto.randomUUID()};
      await this.persist();
      this.state('saving');
      try {
        const result = await this.bridge.invoke('save_object_building_floor_plan_draft', {
          ...this.scope, expected_version: this.pending.version,
          expected_map_version: this.pending.mapVersion ?? this.mapVersion,
          idempotency_key: this.pending.idempotencyKey, data: {document: this.pending.document},
        });
        this.acceptWorkspace(result.workspace, this.pending.version);
        this.savedSerial = this.pending.serial; this.pending = null;
        await this.persist();
      } catch (error) { return this.fail(error); }
    }
    this.state('saved');
    return this.version;
  }
  async publish(expectedCurrentFloorPlanId, assets = {}) {
    if (this.publicationCall) return this.publicationCall;
    this.publicationCall = this.publishOnce(expectedCurrentFloorPlanId, assets);
    try { return await this.publicationCall; } finally { this.publicationCall = null; }
  }
  async publishOnce(expectedCurrentFloorPlanId, assets) {
    const resuming = Boolean(this.pendingPublication);
    await this.flush();
    if (resuming) return this.lastPublication;
    if (!this.version) { this.update(this.document); await this.flush(); }
    this.pendingPublication = {payload: {
      ...this.scope, expected_version: this.version, expected_map_version: this.mapVersion,
      expected_current_floor_plan_id: expectedCurrentFloorPlanId === undefined ? this.currentPublishedFloorPlanId : expectedCurrentFloorPlanId,
      idempotency_key: crypto.randomUUID(),
      ...(Object.keys(assets).length ? {data: Object.fromEntries(['pdf_file_id', 'preview_2d_file_id'].filter(key => assets[key]).map(key => [key, assets[key]]))} : {}),
    }};
    await this.persist();
    await this.flush();
    return this.lastPublication;
  }
  dispose() { clearTimeout(this.timer); this.disposed = true; this.onState = () => {}; this.onSaved = () => {}; }
}
