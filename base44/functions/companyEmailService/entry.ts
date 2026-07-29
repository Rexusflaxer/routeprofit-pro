// base44/functions/_shared/companyEmail/completeCompanyEmailOAuth.ts
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";
var PROVIDER_CONFIG = {
  microsoft_365: {
    label: "Microsoft 365",
    scopes: ["openid", "profile", "offline_access", "User.Read", "Mail.Send"]
  },
  google_workspace: {
    label: "Google Workspace",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"]
  }
};
function json(data, status = 200) {
  return Response.json(data, { status });
}
function getEnv(...names) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}
function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  return atob(padded);
}
function base64UrlToString(value) {
  const binary = base64UrlToBytes(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function signStatePart(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}
async function importEncryptionKey(secret) {
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt"]);
}
async function encryptToken(value, secret) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey(secret);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value)
  );
  return `${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}
async function decodeState(state, secret) {
  try {
    const [body, signature] = state.split(".");
    if (!body || !signature) return null;
    const expectedSignature = await signStatePart(body, secret);
    if (signature !== expectedSignature) return null;
    return JSON.parse(base64UrlToString(body));
  } catch {
    return null;
  }
}
function getClientConfig(provider) {
  if (provider === "microsoft_365") {
    return {
      clientId: getEnv("MICROSOFT_EMAIL_CLIENT_ID", "MICROSOFT_CLIENT_ID"),
      clientSecret: getEnv("MICROSOFT_EMAIL_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET"),
      tenant: getEnv("MICROSOFT_EMAIL_TENANT", "MICROSOFT_TENANT_ID") || "common"
    };
  }
  return {
    clientId: getEnv("GOOGLE_EMAIL_CLIENT_ID", "GOOGLE_CLIENT_ID"),
    clientSecret: getEnv("GOOGLE_EMAIL_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET"),
    tenant: ""
  };
}
async function exchangeCode(provider, code, redirectUri) {
  const config = getClientConfig(provider);
  if (!config.clientId || !config.clientSecret) {
    throw new Error(`${PROVIDER_CONFIG[provider].label} OAuth client-id of client-secret ontbreekt`);
  }
  const tokenUrl = provider === "microsoft_365" ? `https://login.microsoftonline.com/${config.tenant}/oauth2/v2.0/token` : "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  if (provider === "microsoft_365") {
    params.set("scope", PROVIDER_CONFIG.microsoft_365.scopes.join(" "));
  }
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error_description || data.error || "OAuth token exchange failed");
  }
  return data;
}
async function fetchAccount(provider, accessToken) {
  if (provider === "microsoft_365") {
    const response2 = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const data2 = await response2.json().catch(() => ({}));
    if (!response2.ok) throw new Error(data2.error?.message || "Microsoft-account ophalen mislukt");
    const email = data2.mail || data2.userPrincipalName;
    return {
      id: data2.id || email,
      email,
      displayName: data2.displayName || email,
      tenantHint: email?.split("@")[1] || null
    };
  }
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || "Google-account ophalen mislukt");
  return {
    id: data.sub || data.email,
    email: data.email,
    displayName: data.name || data.email,
    tenantHint: data.hd || data.email?.split("@")[1] || null
  };
}
function tokenExpiresAt(tokenResponse) {
  const seconds = Number(tokenResponse.expires_in || 3600);
  return new Date(Date.now() + Math.max(60, seconds - 60) * 1e3).toISOString();
}
function buildReadyChannelStatus(existing = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const keys = ["invoices", "reports", "operational"];
  return keys.reduce((result, key) => {
    const current = existing?.[key] || {};
    if (!current?.enabled) return result;
    result[key] = {
      ...current,
      status: "ready",
      hold_reason: null,
      updated_at: now
    };
    return result;
  }, {});
}
async function handleCompleteCompanyEmailOAuth(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const code = String(body.code || "").trim();
    const encryptionSecret = getEnv("EMAIL_TOKEN_ENCRYPTION_KEY", "LOQ_EMAIL_TOKEN_ENCRYPTION_KEY");
    if (!encryptionSecret || encryptionSecret.length < 24) {
      return json({
        error: "EMAIL_TOKEN_ENCRYPTION_KEY ontbreekt",
        detail: "Configureer een lange secret om Microsoft/Google tokens versleuteld op te slaan."
      }, 400);
    }
    const state = await decodeState(String(body.state || ""), encryptionSecret);
    const redirectUri = String(body.redirect_uri || state?.redirect_uri || getEnv("EMAIL_OAUTH_REDIRECT_URI")).trim();
    if (!code) return json({ error: "OAuth code ontbreekt" }, 400);
    if (!state?.company_id || !state?.provider || !(state.provider in PROVIDER_CONFIG)) {
      return json({ error: "Ongeldige OAuth state" }, 400);
    }
    if (!redirectUri) return json({ error: "EMAIL_OAUTH_REDIRECT_URI ontbreekt" }, 400);
    const provider = state.provider;
    const tokenResponse = await exchangeCode(provider, code, redirectUri);
    const account = await fetchAccount(provider, tokenResponse.access_token);
    if (!account.email) throw new Error("De provider gaf geen e-mailadres terug");
    const existingList = await base44.asServiceRole.entities.CompanyEmailSettings.filter({
      company_id: state.company_id
    });
    const existing = existingList?.[0] || null;
    const channelDeliveryStatus = buildReadyChannelStatus(existing?.channel_delivery_status || {});
    const encryptedRefreshToken = tokenResponse.refresh_token ? await encryptToken(tokenResponse.refresh_token, encryptionSecret) : existing?.oauth_refresh_token_encrypted || null;
    const payload = {
      company_id: state.company_id,
      provider,
      status: "connected",
      from_name: existing?.from_name || account.displayName || null,
      from_email: account.email,
      reply_to_email: account.email,
      oauth_tenant_hint: account.tenantHint,
      oauth_account_id: account.id,
      oauth_scopes: PROVIDER_CONFIG[provider].scopes,
      oauth_access_token_encrypted: await encryptToken(tokenResponse.access_token, encryptionSecret),
      oauth_refresh_token_encrypted: encryptedRefreshToken,
      oauth_token_expires_at: tokenExpiresAt(tokenResponse),
      oauth_token_type: tokenResponse.token_type || "Bearer",
      token_secret_reference: `company-email-oauth:${state.company_id}:${provider}:${account.id}`,
      connected_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_checked_at: (/* @__PURE__ */ new Date()).toISOString(),
      last_error: null,
      action_required_reason: null,
      delivery_hold_reason: null,
      channel_delivery_status: channelDeliveryStatus,
      save_to_sent_items: true,
      require_manual_review_before_send: false
    };
    const saved = existing?.id ? await base44.asServiceRole.entities.CompanyEmailSettings.update(existing.id, payload) : await base44.asServiceRole.entities.CompanyEmailSettings.create(payload);
    return json({
      ok: true,
      company_id: state.company_id,
      provider,
      settings: saved,
      from_email: account.email
    });
  } catch (error) {
    return json({ error: error.message || "OAuth afronden mislukt" }, 500);
  }
}

// base44/functions/_shared/companyEmail/sendCompanyEmail.ts
import { createClientFromRequest as createClientFromRequest2 } from "npm:@base44/sdk@0.8.31";
var CHANNEL_FIELDS = {
  invoices: "use_for_invoices",
  reports: "use_for_reports",
  operational: "use_for_operational_mail"
};
function json2(data, status = 200) {
  return Response.json(data, { status });
}
function getEnv2(...names) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}
function base64UrlToBytes2(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function bytesToBase64Url2(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function importEncryptionKey2(secret, usages) {
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, usages);
}
async function encryptToken2(value, secret) {
  if (!value) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importEncryptionKey2(secret, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(value)
  );
  return `${bytesToBase64Url2(iv)}.${bytesToBase64Url2(new Uint8Array(ciphertext))}`;
}
async function decryptToken(value, secret) {
  if (!value) return "";
  const [ivPart, ciphertextPart] = value.split(".");
  if (!ivPart || !ciphertextPart) throw new Error("OAuth token is ongeldig versleuteld");
  const key = await importEncryptionKey2(secret, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes2(ivPart) },
    key,
    base64UrlToBytes2(ciphertextPart)
  );
  return new TextDecoder().decode(plaintext);
}
function normalizeRecipients(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((item) => String(item || "").trim()).filter(Boolean);
}
function getEmailDomain(email) {
  return String(email || "").split("@")[1] || "";
}
function getChannel(body) {
  const channel = String(body.channel || "operational");
  return channel in CHANNEL_FIELDS ? channel : "operational";
}
function isChannelAllowed(settings, channel) {
  const deliveryStatus = settings.channel_delivery_status || {};
  const channelStatus = deliveryStatus?.[channel];
  if (channelStatus?.status === "hold") return false;
  return Boolean(settings[CHANNEL_FIELDS[channel]] || channelStatus?.enabled || channel === "operational");
}
function getChannelHold(settings, channel) {
  const deliveryStatus = settings.channel_delivery_status || {};
  const channelStatus = deliveryStatus?.[channel];
  const channelEnabled = Boolean(settings[CHANNEL_FIELDS[channel]] || channelStatus?.enabled);
  if (channelStatus?.status === "hold") return channelStatus?.hold_reason || settings.delivery_hold_reason || settings.action_required_reason;
  if (settings.status === "action_required" && channelEnabled) {
    return settings.delivery_hold_reason || settings.action_required_reason || "Stel de zakelijke e-mail opnieuw in.";
  }
  return null;
}
function getSender(settings, company) {
  if (settings?.provider && settings.provider !== "platform" && settings.from_email) {
    return {
      name: String(settings.from_name || company?.display_name || company?.legal_name || "LOQ"),
      email: String(settings.from_email),
      replyTo: String(settings.reply_to_email || settings.from_email)
    };
  }
  const defaultEmail = getEnv2("LOQ_MAIL_FROM_EMAIL", "RESEND_FROM_EMAIL");
  if (!defaultEmail) {
    throw new Error("LOQ_MAIL_FROM_EMAIL ontbreekt. Configureer het standaard LOQ-afzendadres.");
  }
  return {
    name: String(company?.display_name || company?.legal_name || getEnv2("LOQ_MAIL_FROM_NAME") || "LOQ"),
    email: defaultEmail,
    replyTo: String(company?.email || defaultEmail)
  };
}
async function sendViaResend({ from, to, subject, html, text, replyTo }) {
  const apiKey = getEnv2("RESEND_API_KEY", "LOQ_RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY ontbreekt. Configureer de LOQ standaard mailprovider.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      html,
      text,
      reply_to: replyTo || void 0
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || data.error || "LOQ-mail verzenden mislukt");
  return data;
}
function microsoftMessage({ to, subject, html, text, replyTo }) {
  return {
    message: {
      subject,
      body: {
        contentType: html ? "HTML" : "Text",
        content: html || text || ""
      },
      toRecipients: to.map((address) => ({ emailAddress: { address } })),
      replyTo: replyTo ? [{ emailAddress: { address: replyTo } }] : void 0
    },
    saveToSentItems: true
  };
}
function encodeMimeHeader(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim();
}
function googleRawMessage({ fromName, fromEmail, to, subject, html, text, replyTo }) {
  const boundary = `loq_${crypto.randomUUID().replace(/-/g, "")}`;
  const body = html ? [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    text || "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
    `--${boundary}--`
  ].join("\r\n") : [
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    text || ""
  ].join("\r\n");
  const headers = [
    `From: ${encodeMimeHeader(fromName)} <${fromEmail}>`,
    `To: ${to.join(", ")}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    "MIME-Version: 1.0",
    replyTo ? `Reply-To: ${replyTo}` : null
  ].filter(Boolean).join("\r\n");
  return bytesToBase64Url2(new TextEncoder().encode(`${headers}\r
${body}`));
}
async function refreshOAuthToken(provider, settings, encryptionSecret) {
  const refreshToken = await decryptToken(String(settings.oauth_refresh_token_encrypted || ""), encryptionSecret);
  if (!refreshToken) throw new Error("Refresh token ontbreekt. Koppel het e-mailadres opnieuw.");
  const isMicrosoft = provider === "microsoft_365";
  const clientId = isMicrosoft ? getEnv2("MICROSOFT_EMAIL_CLIENT_ID", "MICROSOFT_CLIENT_ID") : getEnv2("GOOGLE_EMAIL_CLIENT_ID", "GOOGLE_CLIENT_ID");
  const clientSecret = isMicrosoft ? getEnv2("MICROSOFT_EMAIL_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET") : getEnv2("GOOGLE_EMAIL_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("OAuth client-id of client-secret ontbreekt");
  const tenant = getEnv2("MICROSOFT_EMAIL_TENANT", "MICROSOFT_TENANT_ID") || "common";
  const tokenUrl = isMicrosoft ? `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token` : "https://oauth2.googleapis.com/token";
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || "OAuth token verversen mislukt");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + Math.max(60, Number(data.expires_in || 3600) - 60) * 1e3).toISOString(),
    tokenType: data.token_type || "Bearer"
  };
}
async function getValidAccessToken(base44, settings, encryptionSecret) {
  const expiresAt = settings.oauth_token_expires_at ? new Date(String(settings.oauth_token_expires_at)).getTime() : 0;
  if (settings.oauth_access_token_encrypted && expiresAt > Date.now() + 12e4) {
    return decryptToken(String(settings.oauth_access_token_encrypted), encryptionSecret);
  }
  const refreshed = await refreshOAuthToken(String(settings.provider), settings, encryptionSecret);
  await base44.asServiceRole.entities.CompanyEmailSettings.update(settings.id, {
    oauth_access_token_encrypted: await encryptToken2(refreshed.accessToken, encryptionSecret),
    oauth_refresh_token_encrypted: await encryptToken2(refreshed.refreshToken, encryptionSecret),
    oauth_token_expires_at: refreshed.expiresAt,
    oauth_token_type: refreshed.tokenType,
    last_checked_at: (/* @__PURE__ */ new Date()).toISOString(),
    last_error: null
  });
  return refreshed.accessToken;
}
async function sendViaMicrosoft(accessToken, payload) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || "Microsoft-mail verzenden mislukt");
  }
  return { id: null, provider_response: "accepted" };
}
async function sendViaGoogle(accessToken, raw) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ raw })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Google-mail verzenden mislukt");
  return data;
}
async function handleSendCompanyEmail(req) {
  try {
    const base44 = createClientFromRequest2(req);
    const user = await base44.auth.me();
    if (!user) return json2({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || "").trim();
    const to = normalizeRecipients(body.to);
    const subject = String(body.subject || "").trim();
    const html = body.html ? String(body.html) : "";
    const text = body.text ? String(body.text) : "";
    const channel = getChannel(body);
    if (!companyId) return json2({ error: "company_id is required" }, 400);
    if (!to.length) return json2({ error: "Minimaal een ontvanger is verplicht" }, 400);
    if (!subject) return json2({ error: "Onderwerp is verplicht" }, 400);
    if (!html && !text) return json2({ error: "E-mailinhoud is verplicht" }, 400);
    const company = await base44.asServiceRole.entities.Company.get(companyId).catch(() => null);
    const settingsList = await base44.asServiceRole.entities.CompanyEmailSettings.filter({ company_id: companyId });
    const connected = settingsList.find((item) => item.status === "connected" && item.provider !== "platform");
    const blockingSettings = settingsList.find((item) => getChannelHold(item, channel));
    const settings = connected || null;
    if (!settings && blockingSettings) {
      return json2({
        error: "E-mailkanaal staat op hold",
        detail: getChannelHold(blockingSettings, channel)
      }, 409);
    }
    if (settings && !isChannelAllowed(settings, channel)) {
      return json2({
        error: "E-mailkanaal staat op hold",
        detail: settings.delivery_hold_reason || settings.action_required_reason || "Stel de zakelijke e-mail opnieuw in."
      }, 409);
    }
    const sender = getSender(settings, company);
    const from = `${sender.name} <${sender.email}>`;
    if (!settings || settings.provider === "platform") {
      const sent = await sendViaResend({
        from,
        to,
        subject,
        html,
        text,
        replyTo: sender.replyTo
      });
      return json2({
        ok: true,
        provider: "loq_platform",
        from_email: sender.email,
        from_domain: getEmailDomain(sender.email),
        result: sent
      });
    }
    if (settings.provider === "microsoft_365" || settings.provider === "google_workspace") {
      const encryptionSecret = getEnv2("EMAIL_TOKEN_ENCRYPTION_KEY", "LOQ_EMAIL_TOKEN_ENCRYPTION_KEY");
      if (!encryptionSecret) throw new Error("EMAIL_TOKEN_ENCRYPTION_KEY ontbreekt");
      const accessToken = await getValidAccessToken(base44, settings, encryptionSecret);
      if (settings.provider === "microsoft_365") {
        const sent2 = await sendViaMicrosoft(accessToken, microsoftMessage({
          to,
          subject,
          html,
          text,
          replyTo: sender.replyTo
        }));
        return json2({ ok: true, provider: settings.provider, from_email: sender.email, result: sent2 });
      }
      const sent = await sendViaGoogle(accessToken, googleRawMessage({
        fromName: sender.name,
        fromEmail: sender.email,
        to,
        subject,
        html,
        text,
        replyTo: sender.replyTo
      }));
      return json2({ ok: true, provider: settings.provider, from_email: sender.email, result: sent });
    }
    return json2({
      error: "SMTP/overige mail is nog niet gekoppeld aan een SMTP-relay",
      detail: "Gebruik Microsoft/Google OAuth of configureer een SMTP-relay/API voor overige providers."
    }, 501);
  } catch (error) {
    return json2({ error: error.message || "E-mail verzenden mislukt" }, 500);
  }
}

// base44/functions/_shared/companyEmail/startCompanyEmailOAuth.ts
import { createClientFromRequest as createClientFromRequest3 } from "npm:@base44/sdk@0.8.31";
var PROVIDER_CONFIG2 = {
  microsoft_365: {
    label: "Microsoft 365",
    scopes: ["openid", "profile", "offline_access", "User.Read", "Mail.Send"],
    authUrl: (tenant) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
  },
  google_workspace: {
    label: "Google Workspace",
    scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"],
    authUrl: () => "https://accounts.google.com/o/oauth2/v2/auth"
  }
};
function json3(data, status = 200) {
  return Response.json(data, { status });
}
function getEnv3(...names) {
  for (const name of names) {
    const value = Deno.env.get(name);
    if (value) return value;
  }
  return "";
}
function bytesToBase64Url3(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function stringToBase64Url(value) {
  return bytesToBase64Url3(new TextEncoder().encode(value));
}
async function signStatePart2(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url3(new Uint8Array(signature));
}
async function buildState(payload, secret) {
  const body = stringToBase64Url(JSON.stringify(payload));
  const signature = await signStatePart2(body, secret);
  return `${body}.${signature}`;
}
function getClientId(provider) {
  if (provider === "microsoft_365") {
    return getEnv3("MICROSOFT_EMAIL_CLIENT_ID", "MICROSOFT_CLIENT_ID");
  }
  return getEnv3("GOOGLE_EMAIL_CLIENT_ID", "GOOGLE_CLIENT_ID");
}
function getClientSecret(provider) {
  if (provider === "microsoft_365") {
    return getEnv3("MICROSOFT_EMAIL_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET");
  }
  return getEnv3("GOOGLE_EMAIL_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET");
}
async function handleStartCompanyEmailOAuth(req) {
  try {
    const base44 = createClientFromRequest3(req);
    const user = await base44.auth.me();
    if (!user) return json3({ error: "Unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const companyId = String(body.company_id || "").trim();
    const provider = String(body.provider || "").trim();
    const redirectUri = String(
      body.redirect_uri || getEnv3("EMAIL_OAUTH_REDIRECT_URI", "APP_EMAIL_OAUTH_REDIRECT_URI")
    ).trim();
    if (!companyId) return json3({ error: "company_id is required" }, 400);
    if (!provider || !(provider in PROVIDER_CONFIG2)) return json3({ error: "Unsupported provider" }, 400);
    if (!redirectUri) {
      return json3({
        error: "EMAIL_OAUTH_REDIRECT_URI ontbreekt",
        detail: "Configureer de callback-url, bijvoorbeeld https://app.base44.com/.../email-oauth/callback."
      }, 400);
    }
    const clientId = getClientId(provider);
    const clientSecret = getClientSecret(provider);
    const encryptionSecret = getEnv3("EMAIL_TOKEN_ENCRYPTION_KEY", "LOQ_EMAIL_TOKEN_ENCRYPTION_KEY");
    if (!clientId || !clientSecret) {
      return json3({
        error: `${PROVIDER_CONFIG2[provider].label} OAuth configuratie ontbreekt`,
        detail: provider === "microsoft_365" ? "Configureer MICROSOFT_EMAIL_CLIENT_ID en MICROSOFT_EMAIL_CLIENT_SECRET in de Base44 function secrets." : "Configureer GOOGLE_EMAIL_CLIENT_ID en GOOGLE_EMAIL_CLIENT_SECRET in de Base44 function secrets."
      }, 400);
    }
    if (!encryptionSecret || encryptionSecret.length < 24) {
      return json3({
        error: "EMAIL_TOKEN_ENCRYPTION_KEY ontbreekt",
        detail: "Configureer een lange secret zodat LOQ OAuth tokens versleuteld kan bewaren."
      }, 400);
    }
    const state = await buildState({
      company_id: companyId,
      provider,
      redirect_uri: redirectUri,
      nonce: crypto.randomUUID(),
      ts: Date.now(),
      requested_by: user.id || user.email || null
    }, encryptionSecret);
    const tenant = provider === "microsoft_365" ? getEnv3("MICROSOFT_EMAIL_TENANT", "MICROSOFT_TENANT_ID") || "common" : "";
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: PROVIDER_CONFIG2[provider].scopes.join(" "),
      state,
      prompt: "consent"
    });
    if (provider === "microsoft_365") {
      params.set("response_mode", "query");
    }
    if (provider === "google_workspace") {
      params.set("access_type", "offline");
      params.set("include_granted_scopes", "true");
    }
    return json3({
      provider,
      authorize_url: `${PROVIDER_CONFIG2[provider].authUrl(tenant)}?${params.toString()}`,
      redirect_uri: redirectUri
    });
  } catch (error) {
    return json3({ error: error.message || "OAuth start failed" }, 500);
  }
}

// base44/functions/companyEmailService/entry.ts
var HANDLERS = {
  send: handleSendCompanyEmail,
  start_oauth: handleStartCompanyEmailOAuth,
  complete_oauth: handleCompleteCompanyEmailOAuth
};
function json4(data, status = 200) {
  return Response.json(data, { status });
}
Deno.serve(async (req) => {
  try {
    const body = await req.clone().json().catch(() => ({}));
    const action = String(body?.action || "");
    const handler = HANDLERS[action];
    if (!handler) {
      return json4({
        error: "Onbekende e-mailactie",
        allowed_actions: Object.keys(HANDLERS)
      }, 400);
    }
    return handler(req);
  } catch (error) {
    return json4({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
