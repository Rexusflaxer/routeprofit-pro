import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const routingApiUrl = Deno.env.get('ROUTING_API_URL');
    const routingApiKey = Deno.env.get('ROUTING_API_KEY');
    if (!routingApiUrl || !routingApiKey) {
      return Response.json({ error: 'Routing API secrets ontbreken.' }, { status: 500 });
    }

    const payload = await req.json();
    const endpoint = `${routingApiUrl.trim().replace(/\/$/, '')}/optimize`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${routingApiKey}`,
        'X-API-Key': routingApiKey,
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      return Response.json({ error: data?.error || data?.message || 'Routing server gaf een fout terug.', details: data }, { status: response.status });
    }

    return Response.json(data);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});