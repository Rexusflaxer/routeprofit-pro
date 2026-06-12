import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const PROVIDER_CONFIG = {
  microsoft_365: {
    label: 'Microsoft 365',
    scopes: ['openid', 'profile', 'offline_access', 'User.Read', 'Mail.Send'],
  },
  google_workspace: {
    label: 'Google Workspace',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.send'],
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

function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  return atob(padded);
}

function base64UrlToString(value: string) {
  const binary = base64UrlToBytes(value);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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

async function importEncryptionKey(secret: string) {
  const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
}

async function encryptToken(value: string | null | undefined, secret: string) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function decodeState(state: string, secret: string) {
  try {
    const [body, signature] = state.split('.');
    if (!body || !signature) return null;
    const expectedSignature = await signStatePart(body, secret);
    if (signature !== expectedSignature) return null;
    return JSON.parse(base64UrlToString(body));
  } catch {
    return null;
  }
}

function getClientConfig(provider: OAuthProvider) {
  if (provider === 'microsoft_365') {
    return {
      clientId: getEnv('MICROSOFT_EMAIL_CLIENT_ID', 'MICROSOFT_CLIENT_ID'),
      clientSecret: getEnv('MICROSOFT_EMAIL_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET'),
      tenant: getEnv('MICROSOFT_EMAIL_TENANT', 'MICROSOFT_TENANT_ID') || 'common',
    };
  }
  return {
    clientId: getEnv('GOOGLE_EMAIL_CLIENT_ID', 'GOOGLE_CLIENT_ID'),
    clientSecret: getEnv('GOOGLE_EMAIL_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET'),
    tenant: '',
  };
}

async function exchangeCode(provider: OAuthProvider, code: string, redirectUri: string) {
  const config = getClientConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${PROVIDER_CONFIG[provider].label} OAuth client-id of client-secret ontbreekt`);
  }

  const tokenUrl = provider === 'microsoft_365'
    ? `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token`
    : 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  if (provider === 'microsoft_365') {
    params.set('scope', PROVIDER_CONFIG.microsoft_365.scopes.join(' '));
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || 'OAuth token exchange failed');
  }
  return data;
}

async function fetchAccount(provider: OAuthProvider, accessToken: string) {
  if (provider === 'microsoft_365') {
    const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.message || 'Microsoft-account ophalen mislukt');
    const email = data.mail || data.userPrincipalName;
    return {
      id: data.id || email,
      email,
      displayName: data.displayName || email,
      tenantHint: email?.split('@')[1] || null,
    };
  }

  const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || 'Google-account ophalen mislukt');
  return {
    id: data.sub || data.email,
    email: data.email,
    displayName: data.name || data.email,
    tenantHint: data.hd || data.email?.split('@')[1] || null,
  };
}

function tokenExpiresAt(tokenResponse: Record<string, unknown>) {
  const seconds = Number(tokenResponse.expires_in || 3600);
  return new Date(Date.now() + Math.max(60, seconds - 60) * 1000).toISOString();
}

function buildReadyChannelStatus(existing: Record<string, any> = {}) {
  const now = new Date().toISOString();
  const keys = ['invoices', 'reports', 'operational'];
  return keys.reduce((result, key) => {
    const current = existing?.[key] || {};
    if (!current?.enabled) return result;
    result[key] = {
      ...current,
      status: 'ready',
      hold_reason: null,
      updated_at: now,
    };
    return result;
  }, {} as Record<string, unknown>);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const code = String(body.code || '').trim();
    const encryptionSecret = getEnv('EMAIL_TOKEN_ENCRYPTION_KEY', 'LOQ_EMAIL_TOKEN_ENCRYPTION_KEY');
    if (!encryptionSecret || encryptionSecret.length < 24) {
      return json({
        error: 'EMAIL_TOKEN_ENCRYPTION_KEY ontbreekt',
        detail: 'Configureer een lange secret om Microsoft/Google tokens versleuteld op te slaan.',
      }, 400);
    }

    const state = await decodeState(String(body.state || ''), encryptionSecret);
    const redirectUri = String(body.redirect_uri || state?.redirect_uri || getEnv('EMAIL_OAUTH_REDIRECT_URI')).trim();

    if (!code) return json({ error: 'OAuth code ontbreekt' }, 400);
    if (!state?.company_id || !state?.provider || !(state.provider in PROVIDER_CONFIG)) {
      return json({ error: 'Ongeldige OAuth state' }, 400);
    }
    if (!redirectUri) return json({ error: 'EMAIL_OAUTH_REDIRECT_URI ontbreekt' }, 400);

    const provider = state.provider as OAuthProvider;
    const tokenResponse = await exchangeCode(provider, code, redirectUri);
    const account = await fetchAccount(provider, tokenResponse.access_token);
    if (!account.email) throw new Error('De provider gaf geen e-mailadres terug');

    const existingList = await base44.asServiceRole.entities.CompanyEmailSettings.filter({
      company_id: state.company_id,
    });
    const existing = existingList?.[0] || null;
    const channelDeliveryStatus = buildReadyChannelStatus(existing?.channel_delivery_status || {});
    const encryptedRefreshToken = tokenResponse.refresh_token
      ? await encryptToken(tokenResponse.refresh_token, encryptionSecret)
      : existing?.oauth_refresh_token_encrypted || null;
    const payload = {
      company_id: state.company_id,
      provider,
      status: 'connected',
      from_name: existing?.from_name || account.displayName || null,
      from_email: account.email,
      reply_to_email: account.email,
      oauth_tenant_hint: account.tenantHint,
      oauth_account_id: account.id,
      oauth_scopes: PROVIDER_CONFIG[provider].scopes,
      oauth_access_token_encrypted: await encryptToken(tokenResponse.access_token, encryptionSecret),
      oauth_refresh_token_encrypted: encryptedRefreshToken,
      oauth_token_expires_at: tokenExpiresAt(tokenResponse),
      oauth_token_type: tokenResponse.token_type || 'Bearer',
      token_secret_reference: `company-email-oauth:${state.company_id}:${provider}:${account.id}`,
      connected_at: new Date().toISOString(),
      last_checked_at: new Date().toISOString(),
      last_error: null,
      action_required_reason: null,
      delivery_hold_reason: null,
      channel_delivery_status: channelDeliveryStatus,
      save_to_sent_items: true,
      require_manual_review_before_send: false,
    };

    const saved = existing?.id
      ? await base44.asServiceRole.entities.CompanyEmailSettings.update(existing.id, payload)
      : await base44.asServiceRole.entities.CompanyEmailSettings.create(payload);

    return json({
      ok: true,
      company_id: state.company_id,
      provider,
      settings: saved,
      from_email: account.email,
    });
  } catch (error) {
    return json({ error: error.message || 'OAuth afronden mislukt' }, 500);
  }
});
