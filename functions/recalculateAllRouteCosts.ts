import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

// Triggered by personnel changes - marks all cached route cost data as stale
// Since costs are calculated on-the-fly in the frontend, we just need to
// invalidate any cached/stored cost data on routes if present.
// This function is called by the Personnel entity automation.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // This endpoint is called from an entity automation (no user auth context)
    // Use service role to access data
    const routes = await base44.asServiceRole.entities.Route.list();

    // Touch each route's updated_date so frontend cache is invalidated
    // (routes use updated_date to detect staleness)
    // We do a lightweight update - just bump the record so react-query refetches
    let updated = 0;
    for (const route of routes) {
      await base44.asServiceRole.entities.Route.update(route.id, {
        _cost_cache_busted: Date.now()
      });
      updated++;
    }

    return Response.json({ ok: true, routes_invalidated: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});