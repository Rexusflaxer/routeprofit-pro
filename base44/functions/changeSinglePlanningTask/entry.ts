import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Dit oude endpoint splitste een herhalende reeks met een tijdelijke one_time-
 * revisie en een hardcoded hervatting na zeven dagen. Dat model kan de
 * blauwdruk en alternatieven uit synchronisatie brengen. Nieuwe clients moeten
 * de geleasede, idempotente planningApi-actie gebruiken.
 */
export default async function deprecatedSinglePlanningTaskChange(req: Request) {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Niet ingelogd' }, { status: 401 });
  if (user.role !== 'admin') {
    return Response.json(
      { error: 'Alleen backofficebeheerders hebben toegang' },
      { status: 403 },
    );
  }
  return Response.json({
    error: 'Deze taakbewerking is vervangen. Vernieuw de applicatie en probeer opnieuw.',
    details: {
      code: 'PLANNING_CLIENT_UPDATE_REQUIRED',
      replacement_action: 'change_single_task_occurrence',
    },
  }, { status: 410 });
}
