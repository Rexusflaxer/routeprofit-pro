import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PUBLIC_CAO_CONFIGURATION_OPTION_FIELDS = [
  'id',
  'cao_key',
  'name',
  'display_name',
  'sector',
  'version_label',
  'valid_from',
  'valid_until',
  'status',
  'is_active',
  'is_payroll_ready',
  'payroll_readiness_status'
];

const SENSITIVE_CAO_CONFIGURATION_FIELDS = [
  'wage_scales',
  'wage_scales_detailed',
  'holidays',
  'pay_periods',
  'surcharges',
  'allowances',
  'leave_rules',
  'sickness_rules',
  'minus_hours_rules',
  'overtime_rules',
  'shift_change_rules',
  'pension_rules',
  'fund_rules',
  'schiphol_rules',
  'cash_value_logistics_rules',
  'contract_change_rules',
  'function_classification_rules',
  'rule_engine_metadata',
  'source_documents_snapshot',
  'coverage_summary',
  'payroll_readiness_gate',
  'rule_registry_snapshot',
  'codex_approval_message',
  'notes'
];

const CAO_KEY_LABELS = {
  cao_particuliere_beveiliging: 'CAO Particuliere Beveiliging',
  cao_evenementen_horecabeveiliging: 'Evenementen- en Horecabeveiligingsbranche',
  cao_verkeersregelaars: 'CAO Verkeersregelaars',
  cao_veiligheidsdomein: 'CAO Veiligheidsdomein'
};

function uniqueStrings(values) {
  return [...new Set((values || [])
    .map(value => String(value || '').trim())
    .filter(Boolean))];
}

function isActiveCaoConfiguration(config) {
  return config?.id &&
    config.status === 'active' &&
    config.is_active === true;
}

function normalizedWageOptionRows(config) {
  const rows = [];
  const seen = new Set();

  const addTables = (tables, year = null) => {
    for (const [scale, periods] of Object.entries(tables || {})) {
      for (const [period, entry] of Object.entries(periods || {})) {
        const hourlyRate = typeof entry === 'object'
          ? (entry?.hourly_rate ?? entry?.hourlyRate ?? entry?.rate ?? entry?.amount ?? entry?.value)
          : entry;
        const numericRate = Number(hourlyRate);
        if (!Number.isFinite(numericRate) || numericRate <= 0) continue;
        const key = `${year || 'current'}:${scale}:${period}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          year: year ? Number(year) : null,
          scale: Number.isFinite(Number(scale)) ? Number(scale) : scale,
          period: Number.isFinite(Number(period)) ? Number(period) : period,
          hourly_rate: numericRate
        });
      }
    }
  };

  for (const [year, tables] of Object.entries(config?.wage_scales_detailed_by_year || {})) addTables(tables, year);
  for (const [year, tables] of Object.entries(config?.wage_scales_by_year || {})) addTables(tables, year);
  if (rows.length === 0) addTables(config?.wage_scales_detailed);
  if (rows.length === 0) addTables(config?.wage_scales);

  return rows.sort((a, b) => (
    Number(a.year || 0) - Number(b.year || 0)
    || Number(a.scale) - Number(b.scale)
    || Number(a.period) - Number(b.period)
  ));
}

function buildCaoConfigurationOption(config, includeIds = [], { includeWageOptions = false } = {}) {
  const includedInactive = includeIds.includes(config?.id) && !isActiveCaoConfiguration(config);
  const option = {};
  for (const field of PUBLIC_CAO_CONFIGURATION_OPTION_FIELDS) {
    option[field] = config?.[field] ?? null;
  }
  option.label = config?.display_name || config?.name || config?.cao_key || 'CAO';
  option.selectable = isActiveCaoConfiguration(config);
  option.included_for_existing_company = includedInactive;
  option.warning = includedInactive
    ? 'Deze CAO-configuratie is niet actief en wordt alleen getoond omdat dit bedrijf er al aan gekoppeld is.'
    : null;
  if (includeWageOptions) option.wage_options = normalizedWageOptionRows(config);
  return option;
}

function assertNoSensitiveCaoConfigurationFields(option) {
  const leaked = SENSITIVE_CAO_CONFIGURATION_FIELDS.filter(field => Object.prototype.hasOwnProperty.call(option, field));
  return {
    passed: leaked.length === 0,
    leaked_fields: leaked
  };
}

function sortCaoConfigurationOptions(a, b) {
  const keyA = `${a.cao_key || ''}:${a.valid_from || ''}:${a.label || ''}`;
  const keyB = `${b.cao_key || ''}:${b.valid_from || ''}:${b.label || ''}`;
  return keyA.localeCompare(keyB);
}

function sortByValidFrom(a, b) {
  return String(a.valid_from || '').localeCompare(String(b.valid_from || '')) ||
    String(a.valid_until || '').localeCompare(String(b.valid_until || '')) ||
    String(a.id || '').localeCompare(String(b.id || ''));
}

function minDate(values) {
  const dates = uniqueStrings(values).sort();
  return dates[0] || null;
}

function maxDate(values) {
  const dates = uniqueStrings(values).sort();
  return dates[dates.length - 1] || null;
}

function buildCaoKeyOption(configs, includeIds = []) {
  const sorted = [...configs].sort(sortByValidFrom);
  const active = sorted.filter(isActiveCaoConfiguration);
  const representative = active[active.length - 1] || sorted[sorted.length - 1] || sorted[0] || {};
  const caoKey = representative.cao_key || sorted.find(config => config.cao_key)?.cao_key || null;
  const label = CAO_KEY_LABELS[caoKey] ||
    representative.display_name ||
    representative.name ||
    caoKey ||
    'CAO';
  const validFrom = minDate(sorted.map(config => config.valid_from));
  const hasOpenEnded = sorted.some(config => !config.valid_until);
  const validUntil = hasOpenEnded ? null : maxDate(sorted.map(config => config.valid_until));
  const includedInactiveIds = sorted
    .filter(config => includeIds.includes(config.id) && !isActiveCaoConfiguration(config))
    .map(config => config.id);

  return {
    id: `cao-key:${caoKey || 'unknown'}`,
    cao_key: caoKey,
    cao_configuration_id: null,
    name: label,
    display_name: label,
    label,
    sector: representative.sector || null,
    version_label: active.length === 1
      ? '1 actieve CAO-periode automatisch'
      : `${active.length} actieve CAO-perioden automatisch`,
    valid_from: validFrom,
    valid_until: validUntil,
    status: active.length > 0 ? 'active' : 'archived',
    is_active: active.length > 0,
    is_payroll_ready: active.some(config => config.is_payroll_ready === true),
    payroll_readiness_status: active.length > 0 && active.every(config => config.payroll_readiness_status === 'ready') ? 'ready' : representative.payroll_readiness_status || null,
    selectable: active.length > 0,
    grouped_by_cao_key: true,
    configuration_ids: sorted.map(config => config.id).filter(Boolean),
    active_configuration_count: active.length,
    periods: sorted.map(config => ({
      id: config.id,
      valid_from: config.valid_from || null,
      valid_until: config.valid_until || null,
      version_label: config.version_label || null,
      selectable: isActiveCaoConfiguration(config)
    })),
    included_for_existing_company: includedInactiveIds.length > 0,
    warning: includedInactiveIds.length > 0
      ? 'Deze CAO bevat een oudere niet-actieve configuratie die alleen is meegenomen vanwege een bestaande koppeling.'
      : null
  };
}

function buildGroupedCaoKeyOptions(configs, includeIds = []) {
  const groups = {};
  for (const config of configs || []) {
    const key = config.cao_key || `config:${config.id}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(config);
  }
  return Object.values(groups)
    .map(group => buildCaoKeyOption(group, includeIds))
    .filter(option => option.cao_key)
    .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
}

Deno.serve(async (req) => {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const includeIds = uniqueStrings(body.include_ids || body.includeIds || []);
    const includeInactiveSelected = body.include_inactive_selected !== false;
    const groupByCaoKey = body.group_by_cao_key === true || body.groupByCaoKey === true;
    const includeWageOptions = body.include_wage_options === true || body.includeWageOptions === true;
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const configs = await base44.asServiceRole.entities.CAOConfiguration.list();
    const visibleConfigs = (configs || [])
      .filter(config => isActiveCaoConfiguration(config) || (includeInactiveSelected && includeIds.includes(config.id)));
    const options = groupByCaoKey
      ? buildGroupedCaoKeyOptions(visibleConfigs, includeIds)
      : visibleConfigs
        .map(config => buildCaoConfigurationOption(config, includeIds, { includeWageOptions }))
        .filter(option => assertNoSensitiveCaoConfigurationFields(option).passed)
        .sort(sortCaoConfigurationOptions);

    return Response.json({
      success: true,
      options,
      count: options.length
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
