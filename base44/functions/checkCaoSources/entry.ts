import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// CAO PB bronnen die bewaakt worden
const CAO_SOURCES = [
  {
    title: 'CAO Particuliere Beveiliging - Hoofdpagina',
    url: 'https://www.beveiligingsbranche.nl/cao/',
    source_type: 'cao_page',
    cao_key: 'cao_particuliere_beveiliging'
  },
  {
    title: 'CAO Particuliere Beveiliging 2024-2026 (PDF)',
    url: 'https://www.beveiligingsbranche.nl/wp-content/uploads/2024/12/CAO-PB-18-dec-2024-27-dec-2026_met-omslag.pdf',
    source_type: 'cao_pdf',
    cao_key: 'cao_particuliere_beveiliging'
  },
  {
    title: 'Loontabel 2026 (PDF)',
    url: 'https://www.beveiligingsbranche.nl/wp-content/uploads/2025/12/loontabel-2026.pdf',
    source_type: 'wage_table_pdf',
    cao_key: 'cao_particuliere_beveiliging'
  },
  {
    title: 'Loonperiodetabel 2026 (PDF)',
    url: 'https://www.beveiligingsbranche.nl/wp-content/uploads/2025/12/loonperiodes-2026.pdf',
    source_type: 'pay_periods_pdf',
    cao_key: 'cao_particuliere_beveiliging'
  },
  {
    title: 'Fonds-CAO Particuliere Beveiliging (PDF)',
    url: 'https://www.beveiligingsbranche.nl/wp-content/uploads/fonds-cao-beveiliging.pdf',
    source_type: 'fonds_cao_pdf',
    cao_key: 'cao_particuliere_beveiliging'
  }
];

async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content.substring(0, 10000));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
}

async function checkUrl(url) {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'RouteProfit-CAO-Monitor/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    return {
      reachable: response.ok,
      status_code: response.status,
      etag: response.headers.get('etag'),
      last_modified: response.headers.get('last-modified'),
      content_length: response.headers.get('content-length')
    };
  } catch (err) {
    return { reachable: false, error: err.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allowedRoles = ['admin', 'director', 'hr', 'payroll'];
    if (!allowedRoles.includes(user.role)) {
      return Response.json({ error: 'Onvoldoende rechten' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const now = new Date().toISOString();

    // Maak een CAOImportRun aan
    const importRun = await base44.asServiceRole.entities.CAOImportRun.create({
      started_at: now,
      finished_at: null,
      trigger_type: body.trigger_type || 'manual',
      status: 'running',
      source_document_ids: [],
      detected_changes: [],
      summary: null,
      error_message: null
    });

    const sourcesChecked = [];
    const sourcesChanged = [];
    const errors = [];
    const sourceDocIds = [];

    // Haal bestaande brondocumenten op
    const existingDocs = await base44.asServiceRole.entities.CAOSourceDocument.filter({
      cao_key: 'cao_particuliere_beveiliging'
    });

    for (const source of CAO_SOURCES) {
      try {
        const checkResult = await checkUrl(source.url);
        const existing = existingDocs.find(d => d.url === source.url);

        let newEtag = checkResult.etag || null;
        let newLastModified = checkResult.last_modified || null;
        let changed = false;
        let docStatus = checkResult.reachable ? 'active' : 'unreachable';

        // Detecteer wijziging op basis van etag of last-modified
        if (existing && checkResult.reachable) {
          const prevEtag = existing.etag;
          const prevModified = existing.last_modified;
          if (newEtag && prevEtag && newEtag !== prevEtag) {
            changed = true;
            docStatus = 'changed';
          } else if (newLastModified && prevModified && newLastModified !== prevModified) {
            changed = true;
            docStatus = 'changed';
          }
        }

        const docData = {
          title: source.title,
          url: source.url,
          source_type: source.source_type,
          status: docStatus,
          etag: newEtag,
          last_modified: newLastModified,
          last_checked_at: now,
          first_seen_at: existing?.first_seen_at || now,
          last_changed_at: changed ? now : (existing?.last_changed_at || null),
          extraction_status: existing?.extraction_status || 'pending'
        };

        let doc;
        if (existing) {
          await base44.asServiceRole.entities.CAOSourceDocument.update(existing.id, docData);
          doc = { id: existing.id, ...docData };
        } else {
          doc = await base44.asServiceRole.entities.CAOSourceDocument.create(docData);
        }

        sourceDocIds.push(doc.id);
        sourcesChecked.push({ url: source.url, status: docStatus, changed });

        if (changed) {
          sourcesChanged.push({
            url: source.url,
            title: source.title,
            prev_etag: existing?.etag,
            new_etag: newEtag
          });
        }
      } catch (err) {
        errors.push({ url: source.url, error: err.message });
      }
    }

    // Verwerk externe Codex relay input indien aanwezig
    if (body.codex_relay && Array.isArray(body.codex_relay.changes)) {
      for (const change of body.codex_relay.changes) {
        sourcesChanged.push({ ...change, source: 'codex_relay' });
      }
    }

    const summary = `${sourcesChecked.length} bronnen gecontroleerd, ${sourcesChanged.length} gewijzigd, ${errors.length} fouten.`;

    // Update import run
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: errors.length > 0 ? 'completed_with_review' : 'completed',
      source_document_ids: sourceDocIds,
      detected_changes: sourcesChanged,
      summary,
      error_message: errors.length > 0 ? errors.map(e => e.error).join('; ') : null
    });

    return Response.json({
      success: true,
      import_run_id: importRun.id,
      sources_checked: sourcesChecked.length,
      sources_changed: sourcesChanged.length,
      errors: errors.length,
      changed_sources: sourcesChanged,
      summary
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});