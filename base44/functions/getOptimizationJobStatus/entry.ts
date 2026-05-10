import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function routingBaseUrl() {
  const url = Deno.env.get('ROUTING_API_URL');
  if (!url) throw new Error('ROUTING_API_URL ontbreekt.');
  return url.trim().replace(/\/$/, '');
}

function routingApiKey() {
  const key = Deno.env.get('ROUTING_API_KEY');
  if (!key) throw new Error('ROUTING_API_KEY ontbreekt.');
  return key;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    const preview = text.slice(0, 140).replace(/\s+/g, ' ').trim();
    throw new Error(`Routingserver gaf geen geldige JSON terug: ${preview}`);
  }
}

function compactText(value, maxLength = 1800) {
  if (!value) return value;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}... [ingekort]`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const serverJobId = body.job_id || body.server_job_id;

    if (!serverJobId) {
      return Response.json({ error: 'job_id ontbreekt' }, { status: 400 });
    }

    const response = await fetch(`${routingBaseUrl()}/optimization-jobs/${serverJobId}`, {
      headers: { 'X-API-Key': routingApiKey() },
    });

    const data = await readJsonResponse(response);

    if (!response.ok) {
      return Response.json(data, { status: response.status });
    }

    const jobs = await base44.asServiceRole.entities.OptimizationJob.filter({ server_job_id: serverJobId });
    const job = jobs[0];

    if (job) {
      await base44.asServiceRole.entities.OptimizationJob.update(job.id, {
        status: data.status || job.status,
        progress: Number(data.progress ?? job.progress ?? 0),
        message: compactText(data.message || job.message, 800),
        error: compactText(data.error || job.error, 1800),
        started_at: data.started_at || job.started_at,
        finished_at: data.finished_at || job.finished_at,
      });
    }

    return Response.json({
      ...data,
      message: compactText(data.message, 800),
      error: compactText(data.error, 1800),
      job_id: serverJobId,
      local_job_id: job?.id,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});