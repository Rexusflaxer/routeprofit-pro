import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const allowedRoles = ['admin', 'director', 'hr', 'payroll'];
    if (!allowedRoles.includes(user.role)) {
      return Response.json({ error: 'Onvoldoende rechten. Alleen admin/director/hr/payroll mag goedkeuren.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { cao_configuration_id, action, activate_from, review_notes } = body;

    if (!cao_configuration_id) {
      return Response.json({ error: 'cao_configuration_id is verplicht' }, { status: 400 });
    }
    if (!action || !['approve', 'reject'].includes(action)) {
      return Response.json({ error: 'action moet "approve" of "reject" zijn' }, { status: 400 });
    }

    // Haal de configuratie op
    const configs = await base44.asServiceRole.entities.CAOConfiguration.filter({ id: cao_configuration_id });
    const config = configs[0];
    if (!config) {
      return Response.json({ error: 'CAO-configuratie niet gevonden' }, { status: 404 });
    }

    if (config.status === 'active' && action === 'approve') {
      return Response.json({ error: 'Deze configuratie is al actief' }, { status: 400 });
    }

    const now = new Date().toISOString();

    if (action === 'reject') {
      await base44.asServiceRole.entities.CAOConfiguration.update(cao_configuration_id, {
        status: 'rejected',
        review_notes: review_notes || null
      });
      return Response.json({
        success: true,
        message: `CAO-configuratie "${config.name}" is afgewezen.`
      });
    }

    // action === 'approve': activeer de configuratie
    const validFrom = activate_from || config.valid_from || now.split('T')[0];

    // Archiveer andere actieve configs met dezelfde cao_key
    const activeCaos = await base44.asServiceRole.entities.CAOConfiguration.filter({
      cao_key: config.cao_key || 'cao_particuliere_beveiliging'
    });

    let archivedCount = 0;
    for (const other of activeCaos) {
      if (other.id !== cao_configuration_id && other.status === 'active') {
        await base44.asServiceRole.entities.CAOConfiguration.update(other.id, {
          status: 'archived',
          is_active: false
        });
        archivedCount++;
      }
    }

    // Activeer de nieuwe configuratie
    await base44.asServiceRole.entities.CAOConfiguration.update(cao_configuration_id, {
      status: 'active',
      is_active: true,
      valid_from: validFrom,
      approved_by_user_id: user.id,
      approved_by_name: user.full_name || user.email,
      approved_at: now,
      review_notes: review_notes || config.review_notes
    });

    // Keur openstaande pending reviews goed die bij deze configuratie horen
    const pendingReviews = await base44.asServiceRole.entities.CAOChangeReview.filter({
      cao_configuration_id,
      status: 'pending'
    });

    let approvedReviews = 0;
    for (const review of pendingReviews) {
      await base44.asServiceRole.entities.CAOChangeReview.update(review.id, {
        status: 'approved',
        reviewed_by_user_id: user.id,
        reviewed_at: now,
        review_notes: 'Auto-goedgekeurd bij activering configuratie'
      });
      approvedReviews++;
    }

    return Response.json({
      success: true,
      message: `CAO-configuratie "${config.name}" is geactiveerd vanaf ${validFrom}.`,
      archived_configurations: archivedCount,
      approved_reviews: approvedReviews
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});