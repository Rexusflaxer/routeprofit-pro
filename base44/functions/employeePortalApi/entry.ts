var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// base44/functions/_shared/employeePortal/employeeContext.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}
async function writeAuditLog(base44, { user_id, personnel_id, company_id, action, payload }) {
  await base44.asServiceRole.entities.EmployeeAccessAuditLog.create({
    user_id: user_id || null,
    personnel_id: personnel_id || null,
    company_id: company_id || null,
    action,
    payload: payload || null,
    created_at: nowIso()
  });
}
async function buildEmployeeContext(base44, user) {
  const normalizedUserEmail = normalizeEmail(user.email);
  const linkedPersonnel = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
  const employee = linkedPersonnel[0] || null;
  if (employee) {
    const assignments = await base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id: employee.id });
    const companyIds = [...new Set(assignments.map((a) => a.company_id).filter(Boolean))];
    let companies = [];
    if (companyIds.length > 0) {
      const allCompanies2 = await base44.asServiceRole.entities.Company.list();
      companies = assignments.filter((a) => a.assignment_status === "active" || !a.assignment_status).map((a) => {
        const co = allCompanies2.find((c) => c.id === a.company_id);
        return co ? {
          company_id: co.id,
          company_name: co.display_name,
          trade_name: co.trade_name || null,
          assignment_status: a.assignment_status || "active",
          is_primary: a.is_primary || false
        } : null;
      }).filter(Boolean);
    }
    if (employee.primary_company_id && !companies.find((c) => c.company_id === employee.primary_company_id)) {
      const allCos = await base44.asServiceRole.entities.Company.filter({ id: employee.primary_company_id });
      if (allCos[0]) {
        companies.push({ company_id: allCos[0].id, company_name: allCos[0].display_name, trade_name: allCos[0].trade_name || null, assignment_status: "active", is_primary: true });
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
        can_submit_reports: true
      }
    };
  }
  const pendingInvitations = await base44.asServiceRole.entities.EmployeeInvitation.filter({
    normalized_email: normalizedUserEmail,
    status: "pending"
  });
  const allCompanies = pendingInvitations.length > 0 ? await base44.asServiceRole.entities.Company.list() : [];
  const allPersonnel = pendingInvitations.length > 0 ? await base44.asServiceRole.entities.Personnel.list() : [];
  const inviteList = pendingInvitations.filter((inv) => !inv.expires_at || new Date(inv.expires_at) > /* @__PURE__ */ new Date()).map((inv) => {
    const co = allCompanies.find((c) => c.id === inv.company_id);
    const p = allPersonnel.find((p2) => p2.id === inv.personnel_id);
    return {
      id: inv.id,
      personnel_id: inv.personnel_id,
      company_id: inv.company_id || null,
      company_name: co?.display_name || null,
      employee_display_name: p?.name || null,
      email: inv.email,
      expires_at: inv.expires_at || null
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
      can_submit_reports: false
    }
  };
}
async function handleEmployeeContext(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const employee_context = await buildEmployeeContext(base44, user);
    await writeAuditLog(base44, {
      user_id: user.id,
      personnel_id: employee_context.employee_id,
      action: "employee_context_viewed"
    });
    return Response.json({ employee_context });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
var init_employeeContext = __esm({
  "base44/functions/_shared/employeePortal/employeeContext.ts"() {
  }
});

// base44/functions/employeePortalApi/entry.ts
init_employeeContext();

// base44/functions/_shared/employeePortal/employeeInvitationAction.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.31";
function nowIso2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function normalizeEmail2(email) {
  return String(email || "").trim().toLowerCase();
}
function isPrivileged(user) {
  return ["admin", "director", "hr", "manager", "planner"].includes(String(user?.role || "").toLowerCase());
}
async function writeAuditLog2(base44, { user_id, personnel_id, company_id, action, payload }) {
  await base44.asServiceRole.entities.EmployeeAccessAuditLog.create({
    user_id: user_id || null,
    personnel_id: personnel_id || null,
    company_id: company_id || null,
    action,
    payload: payload || null,
    created_at: nowIso2()
  });
}
async function handleEmployeeInvitationAction(req) {
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json();
    const { action, invitation_id, personnel_id, email } = body || {};
    if (action === "accept") {
      if (!invitation_id) return Response.json({ error: "invitation_id required" }, { status: 400 });
      const invitations = await base44.asServiceRole.entities.EmployeeInvitation.filter({ id: invitation_id });
      const inv = invitations[0];
      if (!inv) return Response.json({ error: "Uitnodiging niet gevonden" }, { status: 404 });
      if (inv.status !== "pending") return Response.json({ error: "Uitnodiging is niet meer geldig" }, { status: 409 });
      if (inv.normalized_email !== normalizeEmail2(user.email)) return Response.json({ error: "Uitnodiging is voor een ander e-mailadres" }, { status: 403 });
      if (inv.expires_at && new Date(inv.expires_at) < /* @__PURE__ */ new Date()) return Response.json({ error: "Uitnodiging is verlopen" }, { status: 410 });
      const personnelList = await base44.asServiceRole.entities.Personnel.filter({ id: inv.personnel_id });
      const p = personnelList[0];
      if (!p) return Response.json({ error: "Medewerkerdossier niet gevonden" }, { status: 404 });
      if (p.linked_user_id && p.linked_user_id !== user.id) return Response.json({ error: "Medewerkerdossier is al aan een ander account gekoppeld" }, { status: 409 });
      const updateData = {
        linked_user_id: user.id,
        linked_user_email: user.email,
        linked_at: nowIso2()
      };
      if (!p.login_email) updateData.login_email = user.email;
      await base44.asServiceRole.entities.Personnel.update(inv.personnel_id, updateData);
      await base44.asServiceRole.entities.EmployeeInvitation.update(inv.id, {
        status: "accepted",
        accepted_by_user_id: user.id,
        accepted_at: nowIso2()
      });
      const otherPending = await base44.asServiceRole.entities.EmployeeInvitation.filter({ personnel_id: inv.personnel_id, status: "pending" });
      for (const other of otherPending) {
        if (other.id !== inv.id) {
          await base44.asServiceRole.entities.EmployeeInvitation.update(other.id, { status: "expired" });
        }
      }
      await writeAuditLog2(base44, { user_id: user.id, personnel_id: inv.personnel_id, company_id: inv.company_id, action: "employee_invitation_accepted", payload: { invitation_id: inv.id } });
      const linked = await base44.asServiceRole.entities.Personnel.filter({ linked_user_id: user.id });
      const employee = linked[0];
      const assignments = employee ? await base44.asServiceRole.entities.PersonnelCompanyAssignment.filter({ personnel_id: employee.id }) : [];
      const companyIds = [...new Set(assignments.map((a) => a.company_id).filter(Boolean))];
      let companies = [];
      if (companyIds.length > 0) {
        const allCos = await base44.asServiceRole.entities.Company.list();
        companies = assignments.filter((a) => a.assignment_status === "active" || !a.assignment_status).map((a) => {
          const co = allCos.find((c) => c.id === a.company_id);
          return co ? { company_id: co.id, company_name: co.display_name, trade_name: co.trade_name || null, assignment_status: a.assignment_status, is_primary: a.is_primary } : null;
        }).filter(Boolean);
      }
      return Response.json({
        success: true,
        employee_context: {
          is_linked: true,
          employee_id: employee?.id || null,
          employee_display_name: employee?.name || null,
          linked_user_id: user.id,
          companies,
          pending_invitations: [],
          permissions: { can_view_employee_portal: true, can_view_mobile_route: true, can_submit_reports: true }
        }
      });
    }
    if (action === "decline") {
      if (!invitation_id) return Response.json({ error: "invitation_id required" }, { status: 400 });
      const invitations = await base44.asServiceRole.entities.EmployeeInvitation.filter({ id: invitation_id });
      const inv = invitations[0];
      if (!inv) return Response.json({ error: "Uitnodiging niet gevonden" }, { status: 404 });
      if (inv.status !== "pending") return Response.json({ error: "Uitnodiging is niet meer geldig" }, { status: 409 });
      if (inv.normalized_email !== normalizeEmail2(user.email)) return Response.json({ error: "Uitnodiging is voor een ander e-mailadres" }, { status: 403 });
      await base44.asServiceRole.entities.EmployeeInvitation.update(inv.id, { status: "declined", declined_at: nowIso2() });
      await writeAuditLog2(base44, { user_id: user.id, personnel_id: inv.personnel_id, company_id: inv.company_id, action: "employee_invitation_declined", payload: { invitation_id: inv.id } });
      return Response.json({ success: true });
    }
    if (action === "create_invitation") {
      if (!isPrivileged(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
      if (!personnel_id || !email) return Response.json({ error: "personnel_id and email required" }, { status: 400 });
      const normalizedEmail = normalizeEmail2(email);
      const existing = await base44.asServiceRole.entities.EmployeeInvitation.filter({ personnel_id, normalized_email: normalizedEmail, status: "pending" });
      if (existing.length > 0) return Response.json({ error: "Er bestaat al een openstaande uitnodiging", existing_id: existing[0].id }, { status: 409 });
      const personnelList = await base44.asServiceRole.entities.Personnel.filter({ id: personnel_id });
      const p = personnelList[0];
      const inv = await base44.asServiceRole.entities.EmployeeInvitation.create({
        personnel_id,
        company_id: p?.primary_company_id || null,
        email,
        normalized_email: normalizedEmail,
        status: "pending",
        invitation_type: "employee_claim",
        created_by_user_id: user.id,
        created_by_name: user.full_name || user.email,
        created_at: nowIso2(),
        expires_at: null
      });
      await writeAuditLog2(base44, { user_id: user.id, personnel_id, action: "employee_invitation_created", payload: { invitation_id: inv.id, email } });
      return Response.json({ success: true, invitation: inv });
    }
    if (action === "revoke_link") {
      if (!isPrivileged(user)) return Response.json({ error: "Forbidden" }, { status: 403 });
      if (!personnel_id) return Response.json({ error: "personnel_id required" }, { status: 400 });
      await base44.asServiceRole.entities.Personnel.update(personnel_id, {
        linked_user_id: null,
        linked_user_email: null,
        linked_at: null
      });
      await writeAuditLog2(base44, { user_id: user.id, personnel_id, action: "employee_link_revoked" });
      return Response.json({ success: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// base44/functions/employeePortalApi/entry.ts
function json(data, status = 200) {
  return Response.json(data, { status });
}
function requestWithOperation(req, body) {
  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  const { operation, ...rest } = body;
  return new Request(req.url, {
    method: req.method,
    headers,
    body: JSON.stringify({ ...rest, action: operation })
  });
}
Deno.serve(async (req) => {
  try {
    const body = await req.clone().json().catch(() => ({}));
    const action = String(body?.action || "");
    if (action === "context") return handleEmployeeContext(req);
    if (action === "invitation") {
      if (!body.operation) {
        return json({ error: "operation is verplicht voor invitation" }, 400);
      }
      return handleEmployeeInvitationAction(requestWithOperation(req, body));
    }
    return json({
      error: "Onbekende medewerkerportaalactie",
      allowed_actions: ["context", "invitation"]
    }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
