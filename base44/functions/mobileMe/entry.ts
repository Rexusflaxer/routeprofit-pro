import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() { return new Date().toISOString(); }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }
function isPrivileged(user) {
  return ['admin', 'director', 'hr', 'manager', 'planner'].includes(String(user?.role || '').toLowerCase());
}

async function getEmployeeContext(base44, user) {
  // 1. Primary lookup: linked_user_id
  const linked = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
  const employee = linked[0] || null;

  if (employee) {
    const assignments = await base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id: employee.id });
    const allCos = assignments.length > 0 ? await base44.asServiceRole.entities.Company.list() : [];
    const companies = assignments
      .filter(a => a.assignment_status === 'active' || !a.assignment_status)
      .map(a => {
        const co = allCos.find(c => c.id === a.company_id);
        return co ? { company_id: co.id, company_name: co.display_name, trade_name: co.trade_name || null, is_primary: a.is_primary || false } : null;
      }).filter(Boolean);

    return {
      is_linked: true,
      employee_id: employee.id,
      employee_display_name: employee.name || null,
      linked_user_id: user.id,
      companies,
      pending_invitations: [],
    };
  }

  // 2. Pending invitations
  const normalizedEmail = normalizeEmail(user.email);
  const pendingInvitations = await base44.asServiceRole.entities.EmployeeInvitation.filter({ normalized_email: normalizedEmail, status: 'pending' });
  const validInvites = pendingInvitations.filter(inv => !inv.expires_at || new Date(inv.expires_at) > new Date());

  let inviteList = [];
  if (validInvites.length > 0) {
    const allCos = await base44.asServiceRole.entities.Company.list();
    const allP = await base44.asServiceRole.entities.Personnel.list();
    inviteList = validInvites.map(inv => {
      const co = allCos.find(c => c.id === inv.company_id);
      const p = allP.find(p => p.id === inv.personnel_id);
      return { id: inv.id, personnel_id: inv.personnel_id, company_id: inv.company_id || null, company_name: co?.display_name || null, employee_display_name: p?.name || null, email: inv.email, expires_at: inv.expires_at || null };
    });
  }

  return {
    is_linked: false,
    employee_id: null,
    linked_user_id: user.id,
    companies: [],
    pending_invitations: inviteList,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const employeeCtx = await getEmployeeContext(base44, user);
    const canViewRoute = isPrivileged(user) || employeeCtx.is_linked;
    const canSubmitReports = isPrivileged(user) || employeeCtx.is_linked;

    return Response.json({
      user: { id: user.id, name: user.full_name || user.email, email: user.email, role: user.role || 'user' },
      permissions: { can_view_mobile_route: canViewRoute, can_submit_reports: canSubmitReports },
      employee_context: {
        ...employeeCtx,
        permissions: { can_view_employee_portal: true, can_view_mobile_route: canViewRoute, can_submit_reports: canSubmitReports },
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});