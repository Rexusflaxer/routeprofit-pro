import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * syncCaoFromCloudflare
 * Haalt de owner-approved CAO op uit Cloudflare en synchroniseert naar Base44.
 * Revisie-gebaseerd: slaat volledige fetch over ALLEEN als cloudflare_revision gelijk is
 * aan de actieve CAOConfiguration.cloudflare_revision. Geen tijdgebaseerde skip.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth: vereis altijd BASE44_CAO_SYNC_TRIGGER_SECRET ──
    // Lazy-sync vanuit andere functies stuurt sync_trigger_secret mee in de body.
    // Directe calls (extern/owner) sturen Authorization: Bearer <secret>.
    // Anonieme en klant-calls zonder secret krijgen altijd 403.
    const body = await req.json().catch(() => ({}));
    const syncSecret = Deno.env.get('BASE44_CAO_SYNC_TRIGGER_SECRET');

    if (!syncSecret) {
      return Response.json({ error: 'BASE44_CAO_SYNC_TRIGGER_SECRET niet geconfigureerd op server.' }, { status: 500 });
    }

    const authHeader = req.headers.get('Authorization') || '';
    const bodySecret = body.sync_trigger_secret || '';
    // Verwijder secret uit body zodat het niet doorgestuurd of gelogd wordt
    delete body.sync_trigger_secret;

    if (authHeader !== `Bearer ${syncSecret}` && bodySecret !== syncSecret) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { force = false, trigger_source = 'manual' } = body;

    console.log(`[syncCaoFromCloudflare] trigger_source=${trigger_source} force=${force}`);

    const apiKey = Deno.env.get('BASE44_CAO_API_KEY');
    const statusUrl = Deno.env.get('CAO_CLOUDFLARE_STATUS_URL');
    const currentUrl = Deno.env.get('CAO_CLOUDFLARE_CURRENT_URL');

    if (!apiKey || !statusUrl || !currentUrl) {
      return Response.json({ error: 'CAO Cloudflare secrets niet geconfigureerd' }, { status: 500 });
    }

    // ── Stap 1: Haal status op uit Cloudflare (lichtgewicht) ──
    let statusData;
    try {
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (statusRes.status === 404) {
        return Response.json({ success: true, changed: false, reason: 'no_cloudflare_current' });
      }

      if (!statusRes.ok) {
        return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable', http_status: statusRes.status });
      }

      statusData = await statusRes.json();
    } catch {
      return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable' });
    }

    if (!statusData?.current_revision) {
      return Response.json({ success: true, changed: false, reason: 'no_cloudflare_current' });
    }

    const cloudflareRevision = statusData.current_revision;

    // ── Stap 2: Vergelijk revision met actieve Base44 CAO ──
    // Skip volledige fetch ALLEEN als revision al overeenkomt — geen tijdgebaseerde skip
    const activeConfigs = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: 'cao_particuliere_beveiliging',
      is_active: true
    });

    const activeConfig = activeConfigs[0] || null;

    if (!force && activeConfig?.cloudflare_revision === cloudflareRevision) {
      return Response.json({
        success: true,
        changed: false,
        reason: 'already_current',
        revision: cloudflareRevision,
        cao_configuration_id: activeConfig.id
      });
    }

    // ── Stap 3: Haal volledige approved payload op ──
    let payload;
    try {
      const currentRes = await fetch(currentUrl, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });

      if (!currentRes.ok) {
        return Response.json({ success: true, changed: false, reason: 'cloudflare_current_unavailable', http_status: currentRes.status });
      }

      payload = await currentRes.json();
    } catch {
      return Response.json({ success: true, changed: false, reason: 'cloudflare_unavailable' });
    }

    // ── Stap 4: Valideer payload ──
    if (payload.applied !== true) {
      return Response.json({ success: false, error: 'Payload applied !== true; niet geactiveerd.' }, { status: 422 });
    }
    if (payload.approval?.status !== 'approved_by_owner') {
      return Response.json({ success: false, error: 'Payload is niet goedgekeurd door eigenaar.' }, { status: 422 });
    }
    if (payload.cao_key !== 'cao_particuliere_beveiliging') {
      return Response.json({ success: false, error: `Onverwachte cao_key: ${payload.cao_key}` }, { status: 422 });
    }
    if (!payload.revision || !payload.idempotency_key) {
      return Response.json({ success: false, error: 'Payload mist revision of idempotency_key.' }, { status: 422 });
    }

    // ── Stap 5: Idempotency check ──
    const existingRuns = await base44.asServiceRole.entities.CAOImportRun.filter({
      idempotency_key: payload.idempotency_key
    });
    if (existingRuns.length > 0) {
      return Response.json({
        success: true,
        changed: false,
        reason: 'duplicate_idempotency_key',
        idempotency_key: payload.idempotency_key,
        cao_configuration_id: activeConfig?.id || null
      });
    }

    // ── Stap 6: Start import run ──
    const importRun = await base44.asServiceRole.entities.CAOImportRun.create({
      started_at: new Date().toISOString(),
      trigger_type: 'cloudflare_pull',
      status: 'running',
      approval_status: 'owner_approved',
      idempotency_key: payload.idempotency_key,
      codex_thread_id: payload.approval?.codex_thread_id || null,
      source_document_ids: [],
      detected_changes: [],
      created_review_ids: [],
      summary: `Cloudflare sync - revision ${payload.revision}`
    });

    // ── Stap 7: Upsert CAOSourceDocuments ──
    const sourceDocIds = [];
    const sourceDocs = payload.source_documents || [];
    for (const doc of sourceDocs) {
      const existing = await base44.asServiceRole.entities.CAOSourceDocument.filter({ url: doc.url });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAOSourceDocument.update(existing[0].id, {
          title: doc.title || existing[0].title,
          status: 'active',
          last_checked_at: new Date().toISOString(),
          content_hash: doc.content_hash || existing[0].content_hash || null
        });
        sourceDocIds.push(existing[0].id);
      } else {
        const created = await base44.asServiceRole.entities.CAOSourceDocument.create({
          title: doc.title || doc.url,
          url: doc.url,
          source_type: doc.source_type || 'cao_pdf',
          status: 'active',
          first_seen_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
          content_hash: doc.content_hash || null,
          extraction_status: 'ok'
        });
        sourceDocIds.push(created.id);
      }
    }

    // ── Stap 8: Upsert CAORules ──
    const candidateRules = payload.candidate_rules || [];
    let rulesUpserted = 0;
    for (const rule of candidateRules) {
      if (!rule.rule_id) continue;
      const existing = await base44.asServiceRole.entities.CAORule.filter({ rule_id: rule.rule_id });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.CAORule.update(existing[0].id, {
          ...rule,
          status: 'active',
          last_verified_at: new Date().toISOString()
        });
      } else {
        await base44.asServiceRole.entities.CAORule.create({
          ...rule,
          status: 'active',
          last_verified_at: new Date().toISOString()
        });
      }
      rulesUpserted++;
    }

    // ── Stap 9: Archiveer huidige actieve configs ──
    const allActive = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: 'cao_particuliere_beveiliging',
      is_active: true
    });
    for (const cfg of allActive) {
      await base44.asServiceRole.entities.CAOConfiguration.update(cfg.id, {
        is_active: false,
        status: 'archived'
      });
    }

    // ── Stap 9b: Normaliseer pay_periods naar { year: [...] } object-formaat ──
    // Accepteert zowel array als object; converteert altijd naar { "2025": [...], "2026": [...] }
    function normalizePayPeriods(raw) {
      if (!raw) return null;
      if (Array.isArray(raw)) {
        // Array van { year, period_number, start_date, end_date, is_extra_period }
        const byYear = {};
        for (const p of raw) {
          const y = String(p.year || '');
          if (!y) continue;
          if (!byYear[y]) byYear[y] = [];
          byYear[y].push(p);
        }
        return Object.keys(byYear).length > 0 ? byYear : null;
      }
      if (typeof raw === 'object') {
        // Al in { year: [...] } formaat — bewaar as-is
        return raw;
      }
      return null;
    }

    // ── Stap 10: Maak nieuwe CAOConfiguration met VOLLEDIGE payload velden ──
    const candidateCfg = payload.candidate_configuration || {};
    const newConfig = await base44.asServiceRole.entities.CAOConfiguration.create({
      name: candidateCfg.name || `CAO PB - ${payload.revision}`,
      cao_key: 'cao_particuliere_beveiliging',
      display_name: candidateCfg.display_name || null,
      sector: candidateCfg.sector || 'Particuliere beveiliging',
      version_label: candidateCfg.version_label || payload.revision,
      valid_from: candidateCfg.valid_from || null,
      valid_until: candidateCfg.valid_until || null,
      is_active: true,
      is_payroll_ready: candidateCfg.is_payroll_ready !== undefined ? candidateCfg.is_payroll_ready : false,
      status: 'active',

      // Loontabellen
      wage_scales: candidateCfg.wage_scales || {},
      wage_scales_detailed: candidateCfg.wage_scales_detailed || null,
      holidays: candidateCfg.holidays || [],

      // Gestructureerde domein-configuraties — geen whitelist, alles uit payload bewaren
      pay_periods: normalizePayPeriods(candidateCfg.pay_periods),
      surcharges: candidateCfg.surcharges || null,
      allowances: candidateCfg.allowances || null,
      leave_rules: candidateCfg.leave_rules || null,
      sickness_rules: candidateCfg.sickness_rules || null,
      minus_hours_rules: candidateCfg.minus_hours_rules || null,
      overtime_rules: candidateCfg.overtime_rules || null,
      shift_change_rules: candidateCfg.shift_change_rules || null,
      pension_rules: candidateCfg.pension_rules || null,
      fund_rules: candidateCfg.fund_rules || null,
      schiphol_rules: candidateCfg.schiphol_rules || null,
      cash_value_logistics_rules: candidateCfg.cash_value_logistics_rules || null,
      contract_change_rules: candidateCfg.contract_change_rules || null,
      function_classification_rules: candidateCfg.function_classification_rules || null,
      rule_engine_metadata: candidateCfg.rule_engine_metadata || payload.rule_engine_metadata || null,
      source_documents_snapshot: sourceDocs.length > 0 ? sourceDocs : null,
      coverage_summary: candidateCfg.coverage_summary || payload.coverage_summary || null,

      // Losse toeslag-velden (backwards compat + eenvoudig gebruik)
      surcharge_weekend: candidateCfg.surcharge_weekend ?? 35,
      surcharge_night: candidateCfg.surcharge_night ?? 20,
      surcharge_evening: candidateCfg.surcharge_evening ?? 10,
      surcharge_holiday: candidateCfg.surcharge_holiday ?? 50,
      surcharge_new_years_eve_after_16: candidateCfg.surcharge_new_years_eve_after_16 ?? 100,

      // Reserveringen en premies
      vacation_allowance: candidateCfg.vacation_allowance ?? 8,
      year_end_bonus: candidateCfg.year_end_bonus ?? 2.01,
      pension_base_salary_threshold: candidateCfg.pension_base_salary_threshold ?? 16164,
      pension_premium_rate_total: candidateCfg.pension_premium_rate_total ?? 24.1,
      pension_premium_employer: candidateCfg.pension_premium_employer ?? 60,
      pension_premium_employee: candidateCfg.pension_premium_employee ?? 40,
      premium_sfpb: candidateCfg.premium_sfpb ?? 0.061,
      premium_paww_employee: candidateCfg.premium_paww_employee ?? 0.1,
      premium_wga_employee: candidateCfg.premium_wga_employee ?? 0.81,
      premium_awf_employer: candidateCfg.premium_awf_employer ?? 2.64,
      premium_ww_employer_fixed: candidateCfg.premium_ww_employer_fixed ?? 0,
      premium_ww_employer_variable: candidateCfg.premium_ww_employer_variable ?? 1.5,
      premium_wia_employer: candidateCfg.premium_wia_employer ?? 0.72,
      premium_wga_employer: candidateCfg.premium_wga_employer ?? 1.5,
      premium_zw_employer: candidateCfg.premium_zw_employer ?? 0,

      // Loonheffing staffels
      tax_rate_bracket_1: candidateCfg.tax_rate_bracket_1 ?? 36.97,
      tax_rate_bracket_2: candidateCfg.tax_rate_bracket_2 ?? 36.97,
      tax_rate_bracket_3: candidateCfg.tax_rate_bracket_3 ?? 49.5,
      tax_bracket_1_limit: candidateCfg.tax_bracket_1_limit ?? 38098,
      tax_bracket_2_limit: candidateCfg.tax_bracket_2_limit ?? 75518,
      labor_tax_credit_max: candidateCfg.labor_tax_credit_max ?? 5672,

      // Audit velden
      approval_source: payload.approval?.approval_source || 'cloudflare_relay',
      approved_by_owner_name: payload.approval?.approved_by_owner_name || null,
      approved_at: payload.approval?.approved_at || null,
      codex_thread_id: payload.approval?.codex_thread_id || null,
      codex_approval_message: payload.approval?.approval_message || null,
      cloudflare_revision: payload.revision,
      idempotency_key: payload.idempotency_key,
      automation_version: payload.automation_version || null,
      notes: `Automatisch gesynchroniseerd via Cloudflare (${trigger_source}) op ${new Date().toISOString()}`
    });

    // ── Stap 11: Maak CAOChangeReview records ──
    const reviewIds = [];
    const detectedChanges = payload.detected_changes || [];
    for (const change of detectedChanges) {
      const review = await base44.asServiceRole.entities.CAOChangeReview.create({
        import_run_id: importRun.id,
        cao_configuration_id: newConfig.id,
        rule_key: change.rule_key || change.field_path || 'unknown',
        field_path: change.field_path || '',
        old_value: change.old_value ?? null,
        new_value: change.new_value ?? null,
        change_type: change.change_type || 'changed',
        risk_level: change.risk_level || 'medium',
        status: 'applied',
        approval_source: payload.approval?.approval_source || 'cloudflare_relay',
        approved_by_owner_name: payload.approval?.approved_by_owner_name || null,
        approved_at: payload.approval?.approved_at || null,
        codex_thread_id: payload.approval?.codex_thread_id || null,
        idempotency_key: payload.idempotency_key
      });
      reviewIds.push(review.id);
    }

    // ── Stap 12: Finaliseer import run ──
    await base44.asServiceRole.entities.CAOImportRun.update(importRun.id, {
      finished_at: new Date().toISOString(),
      status: 'completed',
      created_configuration_id: newConfig.id,
      created_review_ids: reviewIds,
      source_document_ids: sourceDocIds,
      detected_changes: detectedChanges,
      summary: `Cloudflare sync voltooid: ${rulesUpserted} regels, ${sourceDocs.length} brondocumenten, ${reviewIds.length} wijzigingen. Revision: ${payload.revision}`
    });

    return Response.json({
      success: true,
      changed: true,
      revision: payload.revision,
      idempotency_key: payload.idempotency_key,
      cao_configuration_id: newConfig.id,
      rules_upserted: rulesUpserted,
      source_docs_upserted: sourceDocIds.length,
      change_reviews_created: reviewIds.length,
      import_run_id: importRun.id,
      is_payroll_ready: newConfig.is_payroll_ready,
      coverage_summary: newConfig.coverage_summary || null
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});