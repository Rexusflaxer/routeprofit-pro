/**
 * onPersonnelSaved — entity automation triggered on Personnel create/update.
 *
 * Automatically creates a pending EmployeeInvitation when:
 *   - a Personnel record has email or login_email set
 *   - there is no accepted link yet (linked_user_id is empty)
 *   - no pending invitation exists for same personnel_id + normalized_email
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function nowIso() { return new Date().toISOString(); }
function normalizeEmail(email) { return String(email || '').trim().toLowerCase(); }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { event, data } = body || {};

    if (!data || !data.id) return Response.json({ ok: true });

    const p = data;
    const emailToUse = p.email || p.login_email;
    if (!emailToUse) return Response.json({ ok: true, skipped: 'no_email' });

    // Already linked — no invitation needed
    if (p.linked_user_id) return Response.json({ ok: true, skipped: 'already_linked' });

    const normalizedEmail = normalizeEmail(emailToUse);

    // Check for existing pending or accepted invitation
    const existing = await base44.asServiceRole.entities.EmployeeInvitation.filter({
      personnel_id: p.id,
      normalized_email: normalizedEmail,
    });
    const hasActive = existing.some(i => i.status === 'pending' || i.status === 'accepted');
    if (hasActive) return Response.json({ ok: true, skipped: 'invitation_exists' });

    await base44.asServiceRole.entities.EmployeeInvitation.create({
      personnel_id: p.id,
      company_id: p.primary_company_id || null,
      email: emailToUse,
      normalized_email: normalizedEmail,
      status: 'pending',
      invitation_type: 'employee_claim',
      created_by_user_id: null,
      created_by_name: 'Systeem',
      created_at: nowIso(),
      expires_at: null,
    });

    await base44.asServiceRole.entities.EmployeeAccessAuditLog.create({
      personnel_id: p.id,
      action: 'employee_invitation_created',
      payload: { trigger: 'personnel_saved', email: emailToUse },
      created_at: nowIso(),
    });

    return Response.json({ ok: true, created: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});