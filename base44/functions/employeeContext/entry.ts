/**
 * employeeContext — returns the employee context for the currently logged-in user.
 *
 * Future planning hooks:
 *   - Personnel         → linked via linked_user_id
 *   - Company           → via PersonnelCompanyAssignment
 *   - PersonnelCompanyAssignment → active assignments
 *   - future EmployeeContract   → attach to personnel_id + company_id
 *   - future PlanningShift / RouteExecution → filter by employee_id
 *
 * NEVER return: BSN, document uploads, bank proof, ID document URLs.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() { return new Date().toISOString(); }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

async function writeAuditLog(base44, { user_id, personnel_id, company_id, action, payload }) {
  await base44.asServiceRole.entities.EmployeeAccessAuditLog.create({
    user_id: user_id || null,
    personnel_id: personnel_id || null,
    company_id: company_id || null,
    action,
    payload: payload || null,
    created_at: nowIso(),
  });
}

async function buildEmployeeContext(base44, user) {
  const normalizedUserEmail = normalizeEmail(user.email);

  // 1. Check if user is already linked to a Personnel record
  const linkedPersonnel = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
  const employee = linkedPersonnel[0] || null;

  if (employee) {
    // Fetch company assignments (no sensitive fields returned)
    const assignments = await base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id: employee.id });
    const companyIds = [...new Set(assignments.map(a => a.company_id).filter(Boolean))];
    let companies = [];
    if (companyIds.length > 0) {
      const allCompanies = await base44.asServiceRole.entities.Company.list();
      companies = assignments
        .filter(a => a.assignment_status === 'active' || !a.assignment_status)
        .map(a => {
          const co = allCompanies.find(c => c.id === a.company_id);
          return co ? {
            company_id: co.id,
            company_name: co.display_name,
            trade_name: co.trade_name || null,
            assignment_status: a.assignment_status || 'active',
            is_primary: a.is_primary || false,
          } : null;
        }).filter(Boolean);
    }
    // Also include primary company if not in assignments
    if (employee.primary_company_id && !companies.find(c => c.company_id === employee.primary_company_id)) {
      const allCos = await base44.asServiceRole.entities.Company.filter({ id: employee.primary_company_id });
      if (allCos[0]) {
        companies.push({ company_id: allCos[0].id, company_name: allCos[0].display_name, trade_name: allCos[0].trade_name || null, assignment_status: 'active', is_primary: true });
      }
    }

    return {
      is_linked: true,
      employee_id: employee.id,
      employee_display_name: employee.name || null,
      linked_user_id: user.id,
      companies,
      pending_invitations: [],
      permissions: {
        can_view_employee_portal: true,
        can_view_mobile_route: true,
        can_submit_reports: true,
      },
    };
  }

  // 2. No linked employee — check for pending invitations matching user email
  const pendingInvitations = await base44.asServiceRole.entities.EmployeeInvitation.filter({
    normalized_email: normalizedUserEmail,
    status: 'pending',
  });

  const allCompanies = pendingInvitations.length > 0 ? await base44.asServiceRole.entities.Company.list() : [];
  const allPersonnel = pendingInvitations.length > 0 ? await base44.asServiceRole.entities.Personnel.list() : [];

  const inviteList = pendingInvitations
    .filter(inv => !inv.expires_at || new Date(inv.expires_at) > new Date())
    .map(inv => {
      const co = allCompanies.find(c => c.id === inv.company_id);
      const p = allPersonnel.find(p => p.id === inv.personnel_id);
      return {
        id: inv.id,
        personnel_id: inv.personnel_id,
        company_id: inv.company_id || null,
        company_name: co?.display_name || null,
        employee_display_name: p?.name || null,
        email: inv.email,
        expires_at: inv.expires_at || null,
      };
    });

  return {
    is_linked: false,
    employee_id: null,
    linked_user_id: user.id,
    companies: [],
    pending_invitations: inviteList,
    permissions: {
      can_view_employee_portal: true,
      can_view_mobile_route: false,
      can_submit_reports: false,
    },
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const employee_context = await buildEmployeeContext(base44, user);

    await writeAuditLog(base44, {
      user_id: user.id,
      personnel_id: employee_context.employee_id,
      action: 'employee_context_viewed',
    });

    return Response.json({ employee_context });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

export { buildEmployeeContext };