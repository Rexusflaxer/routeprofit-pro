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

function buildCaoConfigurationOption(config, includeIds = []) {
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

Deno.serve(async (req) => {
  try {
    if (!['GET', 'POST'].includes(req.method)) {
      return Response.json({ success: false, error: 'Method not allowed' }, { status: 405 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const includeIds = uniqueStrings(body.include_ids || body.includeIds || []);
    const includeInactiveSelected = body.include_inactive_selected !== false;
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const configs = await base44.asServiceRole.entities.CAOConfiguration.list();
    const options = (configs || [])
      .filter(config => isActiveCaoConfiguration(config) || (includeInactiveSelected && includeIds.includes(config.id)))
      .map(config => buildCaoConfigurationOption(config, includeIds))
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
