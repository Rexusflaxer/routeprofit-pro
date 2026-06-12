import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROVIDER_CONFIG = {
  microsoft_365: {
    label: 'Microsoft 365',
    scopes: ['openid', 'profile', 'offline_access', 'User.Read', 'Mail.Send'],
    authUrl: (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
  },
  google_workspace: {
    label: 'Google Workspace',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.send'],
    authUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth',
  },
} as const;

type OAuthProvider = keyof typeof PROVIDER_CONFIG;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function getEnv(...names: string[]) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return '';
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function stringToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

async function signStatePart(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function buildState(payload: Record<string, unknown>, secret: string) {
  const body = stringToBase64Url(JSON.stringify(payload));
  const signature = await signStatePart(body, secret);
  return `${body}.${signature}`;
}

function getClientId(provider: OAuthProvider) {
  if (provider === 'microsoft_365') {
    return getEnv('MICROSOFT_EMAIL_CLIENT_ID', 'MICROSOFT_CLIENT_ID');
  }
  return getEnv('GOOGLE_EMAIL_CLIENT_ID', 'GOOGLE_CLIENT_ID');
}

function getClientSecret(provider: OAuthProvider) {
  if (provider === 'microsoft_365') {
    return getEnv('MICROSOFT_EMAIL_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET');
  }
  return getEnv('GOOGLE_EMAIL_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || '').trim();
    const provider = String(body.provider || '').trim() as OAuthProvider;
    const redirectUri = String(
      body.redirect_uri ||
      getEnv('EMAIL_OAUTH_REDIRECT_URI', 'APP_EMAIL_OAUTH_REDIRECT_URI')
    ).trim();

    if (!companyId) return json({ error: 'company_id is required' }, 400);
    if (!provider || !(provider in PROVIDER_CONFIG)) return json({ error: 'Unsupported provider' }, 400);
    if (!redirectUri) {
      return json({
        error: 'EMAIL_OAUTH_REDIRECT_URI ontbreekt',
        detail: 'Configureer de callback-url, bijvoorbeeld https://app.base44.com/.../email-oauth/callback.',
      }, 400);
    }

    const clientId = getClientId(provider);
    const clientSecret = getClientSecret(provider);
    const encryptionSecret = getEnv('EMAIL_TOKEN_ENCRYPTION_KEY', 'LOQ_EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!clientId || !clientSecret) {
      return json({
        error: `${PROVIDER_CONFIG[provider].label} OAuth configuratie ontbreekt`,
        detail: provider === 'microsoft_365'
          ? 'Configureer MICROSOFT_EMAIL_CLIENT_ID en MICROSOFT_EMAIL_CLIENT_SECRET in de Base44 function secrets.'
          : 'Configureer GOOGLE_EMAIL_CLIENT_ID en GOOGLE_EMAIL_CLIENT_SECRET in de Base44 function secrets.',
      }, 400);
    }
    if (!encryptionSecret || encryptionSecret.length < 24) {
      return json({
        error: 'EMAIL_TOKEN_ENCRYPTION_KEY ontbreekt',
        detail: 'Configureer een lange secret zodat LOQ OAuth tokens versleuteld kan bewaren.',
      }, 400);
    }

    const state = await buildState({
      company_id: companyId,
      provider,
      redirect_uri: redirectUri,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
      requested_by: user.id || user.email || null,
    }, encryptionSecret);

    const tenant = provider === 'microsoft_365'
      ? getEnv('MICROSOFT_EMAIL_TENANT', 'MICROSOFT_TENANT_ID') || 'common'
      : '';
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: PROVIDER_CONFIG[provider].scopes.join(' '),
      state,
      prompt: 'consent',
    });

    if (provider === 'microsoft_365') {
      params.set('response_mode', 'query');
    }

    if (provider === 'google_workspace') {
      params.set('access_type', 'offline');
      params.set('include_granted_scopes', 'true');
    }

    return json({
      provider,
      authorize_url: `${PROVIDER_CONFIG[provider].authUrl(tenant)}?${params.toString()}`,
      redirect_uri: redirectUri,
    });
  } catch (error) {
    return json({ error: error.message || 'OAuth start failed' }, 500);
  }
});
