import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const APP_ID = '698e307ed3aa4cab3729bbf1';
export const APP_URL = 'https://route-profit-pro.base44.app';
export const API_URL = 'https://base44.app';
export const MAX_FILE_BYTES = 12 * 1024 * 1024;
export const ALLOWED_ACTIONS = new Set(['search_customer_objects', 'get_object_map_configuration', 'list_object_installations', 'get_object_building_floor_plan_workspace', 'save_object_building_floor_plan_draft', 'publish_object_building_floor_plan', 'upload_object_building_floor_plan_asset', 'read_object_building_floor_plan_asset']);
export const sha256 = value => createHash('sha256').update(value).digest('base64url');
export const newAttempt = () => ({verifier: randomBytes(32).toString('base64url'), state: randomBytes(32).toString('base64url'), createdAt: Date.now()});
export function validateCallback(value, pending, now = Date.now()) {
  let url;
  try { url = new URL(value); } catch { throw new Error('Ongeldige aanmeldlink.'); }
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  if (url.protocol !== 'loq-desktop:' || url.hostname !== 'auth-callback' || !['', '/'].includes(url.pathname) || url.username || url.password || url.port || url.hash || url.searchParams.getAll('code').length !== 1 || url.searchParams.getAll('state').length !== 1 || [...url.searchParams.keys()].some(key => !['code', 'state'].includes(key)) || !/^[A-Za-z0-9_-]{43,128}$/.test(code) || !pending || now - pending.createdAt > 600_000 || now < pending.createdAt || state.length !== pending.state?.length || !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))) throw new Error('Aanmeldlink is ongeldig of verlopen. Begin opnieuw.');
  return {code, state, verifier: pending.verifier};
}
export function scopeKey(userId, scope) {
  if (!userId || !scope || !['customer_id', 'object_id', 'building_selection_key'].every(key => typeof scope[key] === 'string' && scope[key].length > 0 && scope[key].length < 250)) throw new Error('Ongeldige gebouwselectie.');
  return sha256(JSON.stringify([APP_ID, userId, scope.customer_id, scope.object_id, scope.building_selection_key]));
}
export function validateAction(action, payload) {
  if (!ALLOWED_ACTIONS.has(action) || !payload || typeof payload !== 'object' || Array.isArray(payload) || ['action', 'token', 'authorization', '__proto__', 'constructor'].some(key => Object.hasOwn(payload, key))) throw new Error('Deze desktopactie is niet toegestaan.');
  if (JSON.stringify(payload).length > 20 * 1024 * 1024) throw new Error('Dit document is te groot.');
}
export function validatePrint({html, paper, landscape}) {
  if (typeof html !== 'string' || html.length > 30 * 1024 * 1024 || !['A4', 'A3'].includes(paper) || typeof landscape !== 'boolean') throw new Error('Ongeldige afdrukinstellingen.');
  const inspected = html.replace('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\';">', '').replace(/http:\/\/www\.w3\.org\/2000\/svg/g, '');
  if (/<\s*(script|iframe|object|embed|base|link|form|input)\b/i.test(inspected) || /\bon[a-z]+\s*=/i.test(inspected) || /(?:javascript|file|https?):/i.test(inspected) || /http-equiv/i.test(inspected) || /@import/i.test(inspected)) throw new Error('De afdruk bevat niet-toegestane externe inhoud.');
  return {html, paper, landscape};
}
