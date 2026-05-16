import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    return Response.json({
      user: { id: user.id, name: user.full_name || user.email, email: user.email, role: user.role || 'surveillant' },
      permissions: { can_view_mobile_route: true, can_submit_reports: true },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});