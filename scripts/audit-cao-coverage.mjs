import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultCoveragePath = '/Users/David/Downloads/cao_pb_2024_2026_codex_rule_coverage_package/cao_pb_2024_2026_atomic_rule_coverage.csv';
const coverageCsvPath = process.argv[2] || process.env.CAO_COVERAGE_CSV || defaultCoveragePath;

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function readCoverageRules(csvPath) {
  if (!fs.existsSync(csvPath)) {
    throw new Error(`Coverage CSV niet gevonden: ${csvPath}. Geef het pad mee als argument of zet CAO_COVERAGE_CSV.`);
  }
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''));
  const header = rows.shift();
  const indexByHeader = Object.fromEntries(header.map((headerName, index) => [headerName, index]));
  return rows
    .filter(row => row.length >= header.length)
    .map(row => ({
      rule_id: row[indexByHeader.rule_id],
      domain: row[indexByHeader.domain],
      impact: row[indexByHeader.impact],
      automation_level: row[indexByHeader.automation_level],
      text: row[indexByHeader.text]
    }))
    .filter(rule => rule.rule_id);
}

function listRepoTextFiles(dir, files = []) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'dist', 'build'].includes(item.name)) continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      listRepoTextFiles(fullPath, files);
    } else if (/\.(ts|tsx|js|jsx|mjs|json|jsonc|md)$/.test(item.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function buildRepoText() {
  return listRepoTextFiles(repoRoot)
    .map(file => fs.readFileSync(file, 'utf8'))
    .join('\n');
}

function ruleId(number) {
  return `CAO-PB-2024-R${String(number).padStart(4, '0')}`;
}

function runtimeBindingRuleIds() {
  const auditPath = path.join(repoRoot, 'base44/functions/auditCaoRuleCoverage/entry.ts');
  const auditCode = fs.readFileSync(auditPath, 'utf8');
  const ids = new Set();
  const matcher = /ruleIds\(([^)]*)\)|ruleRange\((\d+)\s*,\s*(\d+)\)/g;
  for (const match of auditCode.matchAll(matcher)) {
    if (match[1]) {
      for (const rawNumber of match[1].split(',').map(item => item.trim()).filter(Boolean)) {
        ids.add(ruleId(Number(rawNumber)));
      }
      continue;
    }
    for (let number = Number(match[2]); number <= Number(match[3]); number += 1) {
      ids.add(ruleId(number));
    }
  }
  return ids;
}

function countBy(rules, key) {
  return rules.reduce((counts, rule) => {
    const value = rule[key] || 'unknown';
    counts[value] = (counts[value] || 0) + 1;
    return counts;
  }, {});
}

function isHighImpactReferencePolicy(rule) {
  if (rule.automation_level !== 'reference_or_policy') return false;
  return /payroll|loon|wage|salary|contract|planning|schedule|rooster|vacation|vakantie|leave|holiday|feest|sickness|ziekte|allowance|toeslag|premium|reimbursement|vergoeding|overtime|overwerk|pension|fund|function|functie|contract_change|wissel|base_hourly|hourly|scale|schaal/i
    .test(`${rule.domain} ${rule.impact} ${rule.text}`);
}

function hasExplicitSourceReference(rule, repoText, runtimeIds) {
  return repoText.includes(rule.rule_id) || runtimeIds.has(rule.rule_id);
}

function summarizeLevel(rules, repoText, runtimeIds, level) {
  const subset = rules.filter(rule => rule.automation_level === level);
  const explicit = subset.filter(rule => hasExplicitSourceReference(rule, repoText, runtimeIds));
  const runtime = subset.filter(rule => runtimeIds.has(rule.rule_id));
  return {
    level,
    total: subset.length,
    explicit_references: explicit.length,
    missing_explicit_references: subset.length - explicit.length,
    runtime_index_bindings: runtime.length,
    missing_runtime_index_bindings: subset.length - runtime.length
  };
}

const rules = readCoverageRules(coverageCsvPath);
const repoText = buildRepoText();
const runtimeIds = runtimeBindingRuleIds();
const requiredExplicitLevels = [
  'automatic_or_calculation',
  'validation_or_policy',
  'workflow_or_documentation',
  'reference_or_policy',
  'reference'
];
const summaries = requiredExplicitLevels.map(level => summarizeLevel(rules, repoText, runtimeIds, level));

const requiredExplicitMissing = rules.filter(rule =>
  requiredExplicitLevels.includes(rule.automation_level) &&
  !hasExplicitSourceReference(rule, repoText, runtimeIds)
);
const automaticRuntimeMissing = rules.filter(rule =>
  rule.automation_level === 'automatic_or_calculation' &&
  !runtimeIds.has(rule.rule_id)
);
const allRuntimeMissing = rules.filter(rule => !runtimeIds.has(rule.rule_id));
const highImpactReferencePolicyRules = rules.filter(isHighImpactReferencePolicy);
const highImpactReferencePolicyRuntimeMissing = highImpactReferencePolicyRules.filter(rule => !runtimeIds.has(rule.rule_id));

console.log(`CAO coverage CSV: ${coverageCsvPath}`);
console.log(`Total source rules: ${rules.length}`);
console.log(`By automation level: ${JSON.stringify(countBy(rules, 'automation_level'))}`);
for (const summary of summaries) {
  console.log(`${summary.level}: total=${summary.total}, explicit=${summary.explicit_references}, missing_explicit=${summary.missing_explicit_references}, runtime_index=${summary.runtime_index_bindings}, missing_runtime_index=${summary.missing_runtime_index_bindings}`);
}
console.log(`high_impact_reference_or_policy: total=${highImpactReferencePolicyRules.length}, runtime_index=${highImpactReferencePolicyRules.length - highImpactReferencePolicyRuntimeMissing.length}, missing_runtime_index=${highImpactReferencePolicyRuntimeMissing.length}`);
console.log(`all_source_rules_runtime_or_context: total=${rules.length}, runtime_index=${rules.length - allRuntimeMissing.length}, missing_runtime_index=${allRuntimeMissing.length}`);

if (requiredExplicitMissing.length > 0 || automaticRuntimeMissing.length > 0 || highImpactReferencePolicyRuntimeMissing.length > 0 || allRuntimeMissing.length > 0) {
  console.error('\nCAO coverage audit failed.');
  for (const rule of requiredExplicitMissing.slice(0, 50)) {
    console.error(`missing explicit reference: ${rule.rule_id} ${rule.automation_level} ${rule.domain} | ${rule.text.slice(0, 140)}`);
  }
  for (const rule of automaticRuntimeMissing.slice(0, 50)) {
    console.error(`missing runtime binding: ${rule.rule_id} ${rule.domain} | ${rule.text.slice(0, 140)}`);
  }
  for (const rule of highImpactReferencePolicyRuntimeMissing.slice(0, 50)) {
    console.error(`missing policy runtime binding: ${rule.rule_id} ${rule.domain} | ${rule.text.slice(0, 140)}`);
  }
  for (const rule of allRuntimeMissing.slice(0, 50)) {
    console.error(`missing runtime/context binding: ${rule.rule_id} ${rule.automation_level} ${rule.domain} | ${rule.text.slice(0, 140)}`);
  }
  process.exit(1);
}

console.log('ok - CAO PB source coverage is explicitly referenced, automatic rules are in the local runtime index, and every source rule has either runtime implementation or reference/policy context.');
