// approveCaoConfiguration — DISABLED for all customer roles.
// CAO activation is owner-only via Codex/Cloudflare ingestCaoAutomationPayload.
Deno.serve(async (_req) => {
  return Response.json(
    {
      error: 'CAO activatie verloopt uitsluitend via Codex/Cloudflare owner-approved payloads. ' +
             'Gebruik de ingestCaoAutomationPayload functie via de Cloudflare relay.'
    },
    { status: 403 }
  );
});