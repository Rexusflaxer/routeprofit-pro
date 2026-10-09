// The custom URL carries a one-use code only. The bearer stays encrypted on the
// server until a desktop possessing the original verifier redeems the code.
export const APP_ID = '698e307ed3aa4cab3729bbf1';
export const CALLBACK = 'loq-desktop://auth-callback';
const TTL = 120_000;
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const url64 = (bytes: Uint8Array) => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const digest = async (value: string) => url64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const random = () => url64(crypto.getRandomValues(new Uint8Array(32)));
const validSecret = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value);
class AuthError extends Error { constructor(public status: number, message: string) { super(message); } }
type Dependencies = { createClientFromRequest: (request: Request) => any; createClient: (options: any) => any; env: (key: string) => string | undefined; now?: () => number };

async function encryptionKey(env: Dependencies['env']) {
  const raw = env('LOQ_DESKTOP_AUTH_KEY_B64') || env('MANAGED_FILE_MASTER_KEY_B64');
  if (!raw) throw new AuthError(503, 'Desktopaanmelding is nog niet geconfigureerd.');
  let bytes: Uint8Array;
  try { bytes = unb64(raw); } catch { throw new AuthError(503, 'Desktopaanmelding is nog niet geconfigureerd.'); }
  if (bytes.byteLength !== 32) throw new AuthError(503, 'Desktopaanmelding is nog niet geconfigureerd.');
  const root = await crypto.subtle.importKey('raw', bytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(APP_ID), info: encoder.encode('loq.desktop.auth.v1')}, root, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}

export async function handleDesktopAuth(request: Request, deps: Dependencies): Promise<Response> {
  const json = (data: any, status = 200) => Response.json(data, {status, headers: {'Cache-Control': 'no-store', 'Pragma': 'no-cache'}});
  try {
    if (request.method !== 'POST') throw new AuthError(405, 'Alleen POST is toegestaan.');
    if (Number(request.headers.get('content-length') || 0) > 16_384) throw new AuthError(413, 'Aanvraag is te groot.');
    const raw = await request.text();
    if (raw.length > 16_384) throw new AuthError(413, 'Aanvraag is te groot.');
    const body = JSON.parse(raw);
    const client = deps.createClientFromRequest(request);
    const grants = client.asServiceRole.entities.DesktopLoginGrant;
    const now = (deps.now || Date.now)();
    if (body.action === 'approve') {
      const user = await client.auth.me().catch(() => null);
      if (!user) throw new AuthError(401, 'Meld u opnieuw aan bij LOQ.');
      if (user.role !== 'admin') throw new AuthError(403, 'Voor LOQ Desktop is een beheerdersaccount nodig.');
      if (!validSecret(body.state) || !validSecret(body.challenge) || body.redirect_uri !== CALLBACK) throw new AuthError(400, 'Ongeldige desktopaanmelding.');
      const token = request.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/)?.[1];
      if (!token) throw new AuthError(401, 'Meld u opnieuw aan bij LOQ.');
      const code = random();
      const codeHash = await digest(code);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode(`${APP_ID}:${codeHash}`)}, await encryptionKey(deps.env), encoder.encode(token));
      await grants.create({app_id: APP_ID, user_id: user.id, code_hash: codeHash, state_hash: await digest(body.state), challenge: body.challenge, ciphertext: b64(new Uint8Array(ciphertext)), iv: b64(iv), expires_at: new Date(now + TTL).toISOString(), status: 'pending', version: 1});
      return json({code, state: body.state, redirect_uri: CALLBACK, expires_in: TTL / 1000});
    }
    if (body.action === 'exchange') {
      if (![body.code, body.state, body.verifier].every(validSecret)) throw new AuthError(400, 'Ongeldige desktopaanmelding.');
      const codeHash = await digest(body.code);
      const rows = await grants.filter({code_hash: codeHash, app_id: APP_ID}, undefined, 2);
      const grant = rows.length === 1 ? rows[0] : null;
      if (!grant || grant.status !== 'pending' || Date.parse(grant.expires_at) <= now || !Number.isFinite(Date.parse(grant.expires_at)) || grant.challenge !== await digest(body.verifier) || grant.state_hash !== await digest(body.state)) throw new AuthError(401, 'Aanmeldlink is verlopen of al gebruikt. Begin opnieuw in LOQ Desktop.');
      const key = await encryptionKey(deps.env);
      const result = await grants.updateMany({id: grant.id, status: 'pending', version: 1}, {$set: {status: 'consumed', consumed_at: new Date(now).toISOString(), ciphertext: '', iv: ''}, $inc: {version: 1}});
      if (!result?.success || result.updated !== 1) throw new AuthError(401, 'Aanmeldlink is verlopen of al gebruikt.');
      const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(grant.iv), additionalData: encoder.encode(`${APP_ID}:${codeHash}`)}, key, unb64(grant.ciphertext));
      const token = new TextDecoder().decode(clear);
      const user = await deps.createClient({appId: APP_ID, serverUrl: 'https://base44.app', token}).auth.me().catch(() => null);
      if (!user || user.id !== grant.user_id || user.role !== 'admin') throw new AuthError(401, 'Uw LOQ-sessie is verlopen. Meld u opnieuw aan.');
      return json({access_token: token, user: {id: user.id, full_name: user.full_name || user.name || '', email: user.email || '', role: user.role}});
    }
    throw new AuthError(400, 'Onbekende aanmeldactie.');
  } catch (error) {
    if (error instanceof AuthError) return json({error: error.message}, error.status);
    return json({error: 'Desktopaanmelding kon niet worden afgerond. Probeer opnieuw.'}, 500);
  }
}
