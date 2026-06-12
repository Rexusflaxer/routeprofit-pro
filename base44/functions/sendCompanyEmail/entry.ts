import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const CHANNEL_FIELDS = {
  invoices: 'use_for_invoices',
  reports: 'use_for_reports',
  operational: 'use_for_operational_mail',
} as const;

type MailChannel = keyof typeof CHANNEL_FIELDS;

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
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importEncryptionKey(secret: string, usages: KeyUsage[]) {
  const keyBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, usages);
}

async function encryptToken(value: string | null | undefined, secret: string) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(secret, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(value)
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function decryptToken(value: string | null | undefined, secret: string) {
  if (!value) return '';
  const [ivPart, ciphertextPart] = value.split('.');
  if (!ivPart || !ciphertextPart) throw new Error('OAuth token is ongeldig versleuteld');
  const key = await importEncryptionKey(secret, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(ivPart) },
    key,
    base64UrlToBytes(ciphertextPart)
  );
  return new TextDecoder().decode(plaintext);
}

function normalizeRecipients(value: unknown) {
  const list = Array.isArray(value) ? value : [value];
  return list
    .map(item => String(item || '').trim())
    .filter(Boolean);
}

function getEmailDomain(email: string) {
  return String(email || '').split('@')[1] || '';
}

function getChannel(body: Record<string, unknown>): MailChannel {
  const channel = String(body.channel || 'operational') as MailChannel;
  return channel in CHANNEL_FIELDS ? channel : 'operational';
}

function isChannelAllowed(settings: Record<string, unknown>, channel: MailChannel) {
  const deliveryStatus = (settings.channel_delivery_status || {}) as Record<string, any>;
  const channelStatus = deliveryStatus?.[channel];
  if (channelStatus?.status === 'hold') return false;
  return Boolean(settings[CHANNEL_FIELDS[channel]] || channelStatus?.enabled || channel === 'operational');
}

function getChannelHold(settings: Record<string, unknown>, channel: MailChannel) {
  const deliveryStatus = (settings.channel_delivery_status || {}) as Record<string, any>;
  const channelStatus = deliveryStatus?.[channel];
  const channelEnabled = Boolean(settings[CHANNEL_FIELDS[channel]] || channelStatus?.enabled);
  if (channelStatus?.status === 'hold') return channelStatus?.hold_reason || settings.delivery_hold_reason || settings.action_required_reason;
  if (settings.status === 'action_required' && channelEnabled) {
    return settings.delivery_hold_reason || settings.action_required_reason || 'Stel de zakelijke e-mail opnieuw in.';
  }
  return null;
}

function getSender(settings: Record<string, unknown> | null, company: Record<string, unknown> | null) {
  if (settings?.provider && settings.provider !== 'platform' && settings.from_email) {
    return {
      name: String(settings.from_name || company?.display_name || company?.legal_name || 'LOQ'),
      email: String(settings.from_email),
      replyTo: String(settings.reply_to_email || settings.from_email),
    };
  }

  const defaultEmail = getEnv('LOQ_MAIL_FROM_EMAIL', 'RESEND_FROM_EMAIL');
  if (!defaultEmail) {
    throw new Error('LOQ_MAIL_FROM_EMAIL ontbreekt. Configureer het standaard LOQ-afzendadres.');
  }

  return {
    name: String(company?.display_name || company?.legal_name || getEnv('LOQ_MAIL_FROM_NAME') || 'LOQ'),
    email: defaultEmail,
    replyTo: String(company?.email || defaultEmail),
  };
}

async function sendViaResend({ from, to, subject, html, text, replyTo }: {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}) {
  const apiKey = getEnv('RESEND_API_KEY', 'LOQ_RESEND_API_KEY');
  if (!apiKey) throw new Error('RESEND_API_KEY ontbreekt. Configureer de LOQ standaard mailprovider.');

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
      reply_to: replyTo || undefined,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || 'LOQ-mail verzenden mislukt');
  return data;
}

function microsoftMessage({ to, subject, html, text, replyTo }: {
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}) {
  return {
    message: {
      subject,
      body: {
        contentType: html ? 'HTML' : 'Text',
        content: html || text || '',
      },
      toRecipients: to.map(address => ({ emailAddress: { address } })),
      replyTo: replyTo ? [{ emailAddress: { address: replyTo } }] : undefined,
    },
    saveToSentItems: true,
  };
}

function encodeMimeHeader(value: string) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function googleRawMessage({ fromName, fromEmail, to, subject, html, text, replyTo }: {
  fromName: string;
  fromEmail: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}) {
  const boundary = `loq_${crypto.randomUUID().replace(/-/g, '')}`;
  const body = html
    ? [
        `Content-Type: multipart/alternative; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        text || '',
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        '',
        html,
        `--${boundary}--`,
      ].join('\r\n')
    : [
        'Content-Type: text/plain; charset="UTF-8"',
        '',
        text || '',
      ].join('\r\n');

  const headers = [
    `From: ${encodeMimeHeader(fromName)} <${fromEmail}>`,
    `To: ${to.join(', ')}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
    replyTo ? `Reply-To: ${replyTo}` : null,
  ].filter(Boolean).join('\r\n');

  return bytesToBase64Url(new TextEncoder().encode(`${headers}\r\n${body}`));
}

async function refreshOAuthToken(provider: string, settings: Record<string, unknown>, encryptionSecret: string) {
  const refreshToken = await decryptToken(String(settings.oauth_refresh_token_encrypted || ''), encryptionSecret);
  if (!refreshToken) throw new Error('Refresh token ontbreekt. Koppel het e-mailadres opnieuw.');

  const isMicrosoft = provider === 'microsoft_365';
  const clientId = isMicrosoft
    ? getEnv('MICROSOFT_EMAIL_CLIENT_ID', 'MICROSOFT_CLIENT_ID')
    : getEnv('GOOGLE_EMAIL_CLIENT_ID', 'GOOGLE_CLIENT_ID');
  const clientSecret = isMicrosoft
    ? getEnv('MICROSOFT_EMAIL_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET')
    : getEnv('GOOGLE_EMAIL_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('OAuth client-id of client-secret ontbreekt');

  const tenant = getEnv('MICROSOFT_EMAIL_TENANT', 'MICROSOFT_TENANT_ID') || 'common';
  const tokenUrl = isMicrosoft
    ? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`
    : 'https://oauth2.googleapis.com/token';
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || 'OAuth token verversen mislukt');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1000).toISOString(),
    tokenType: data.token_type || 'Bearer',
  };
}

async function getValidAccessToken(base44: any, settings: Record<string, unknown>, encryptionSecret: string) {
  const expiresAt = settings.oauth_token_expires_at ? new Date(String(settings.oauth_token_expires_at)).getTime() : 0;
  if (settings.oauth_access_token_encrypted && expiresAt > Date.now() + 120000) {
    return decryptToken(String(settings.oauth_access_token_encrypted), encryptionSecret);
  }

  const refreshed = await refreshOAuthToken(String(settings.provider), settings, encryptionSecret);
  await base44.asServiceRole.entities.CompanyEmailSettings.update(settings.id, {
    oauth_access_token_encrypted: await encryptToken(refreshed.accessToken, encryptionSecret),
    oauth_refresh_token_encrypted: await encryptToken(refreshed.refreshToken, encryptionSecret),
    oauth_token_expires_at: refreshed.expiresAt,
    oauth_token_type: refreshed.tokenType,
    last_checked_at: new Date().toISOString(),
    last_error: null,
  });
  return refreshed.accessToken;
}

async function sendViaMicrosoft(accessToken: string, payload: Record<string, unknown>) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || 'Microsoft-mail verzenden mislukt');
  }
  return { id: null, provider_response: 'accepted' };
}

async function sendViaGoogle(accessToken: string, raw: string) {
  const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Google-mail verzenden mislukt');
  return data;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || '').trim();
    const to = normalizeRecipients(body.to);
    const subject = String(body.subject || '').trim();
    const html = body.html ? String(body.html) : '';
    const text = body.text ? String(body.text) : '';
    const channel = getChannel(body);

    if (!companyId) return json({ error: 'company_id is required' }, 400);
    if (!to.length) return json({ error: 'Minimaal een ontvanger is verplicht' }, 400);
    if (!subject) return json({ error: 'Onderwerp is verplicht' }, 400);
    if (!html && !text) return json({ error: 'E-mailinhoud is verplicht' }, 400);

    const company = await base44.asServiceRole.entities.Company.get(companyId).catch(() => null);
    const settingsList = await base44.asServiceRole.entities.CompanyEmailSettings.filter({ company_id: companyId });
    const connected = settingsList.find((item: Record<string, unknown>) => item.status === 'connected' && item.provider !== 'platform');
    const blockingSettings = settingsList.find((item: Record<string, unknown>) => getChannelHold(item, channel));
    const settings = connected || null;

    if (!settings && blockingSettings) {
      return json({
        error: 'E-mailkanaal staat op hold',
        detail: getChannelHold(blockingSettings, channel),
      }, 409);
    }

    if (settings && !isChannelAllowed(settings, channel)) {
      return json({
        error: 'E-mailkanaal staat op hold',
        detail: settings.delivery_hold_reason || settings.action_required_reason || 'Stel de zakelijke e-mail opnieuw in.',
      }, 409);
    }

    const sender = getSender(settings, company);
    const from = `${sender.name} <${sender.email}>`;

    if (!settings || settings.provider === 'platform') {
      const sent = await sendViaResend({
        from,
        to,
        subject,
        html,
        text,
        replyTo: sender.replyTo,
      });
      return json({
        ok: true,
        provider: 'loq_platform',
        from_email: sender.email,
        from_domain: getEmailDomain(sender.email),
        result: sent,
      });
    }

    if (settings.provider === 'microsoft_365' || settings.provider === 'google_workspace') {
      const encryptionSecret = getEnv('EMAIL_TOKEN_ENCRYPTION_KEY', 'LOQ_EMAIL_TOKEN_ENCRYPTION_KEY');
      if (!encryptionSecret) throw new Error('EMAIL_TOKEN_ENCRYPTION_KEY ontbreekt');
      const accessToken = await getValidAccessToken(base44, settings, encryptionSecret);

      if (settings.provider === 'microsoft_365') {
        const sent = await sendViaMicrosoft(accessToken, microsoftMessage({
          to,
          subject,
          html,
          text,
          replyTo: sender.replyTo,
        }));
        return json({ ok: true, provider: settings.provider, from_email: sender.email, result: sent });
      }

      const sent = await sendViaGoogle(accessToken, googleRawMessage({
        fromName: sender.name,
        fromEmail: sender.email,
        to,
        subject,
        html,
        text,
        replyTo: sender.replyTo,
      }));
      return json({ ok: true, provider: settings.provider, from_email: sender.email, result: sent });
    }

    return json({
      error: 'SMTP/overige mail is nog niet gekoppeld aan een SMTP-relay',
      detail: 'Gebruik Microsoft/Google OAuth of configureer een SMTP-relay/API voor overige providers.',
    }, 501);
  } catch (error) {
    return json({ error: error.message || 'E-mail verzenden mislukt' }, 500);
  }
});
