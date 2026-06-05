// checkCaoSources — DISABLED for customer app.
// CAO source monitoring runs in Codex automation, not in the customer app.
Deno.serve(async (_req) => {
  return Response.json(
    {
      error: 'CAO-bronbewaking verloopt via Codex automation. ' +
             'Deze functie is niet beschikbaar voor klantrollen.'
    },
    { status: 403 }
  );
});