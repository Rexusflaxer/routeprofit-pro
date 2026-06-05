// extractCaoParameters — DISABLED for customer app.
// CAO parameter extraction runs in Codex and is applied via ingestCaoAutomationPayload.
Deno.serve(async (_req) => {
  return Response.json(
    {
      error: 'CAO-parameterextractie verloopt via Codex automation en de Cloudflare relay. ' +
             'Deze functie is niet beschikbaar voor klantrollen.'
    },
    { status: 403 }
  );
});