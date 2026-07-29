import { base44 } from "@/api/base44Client";

function bytesToBase64(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function sha256Base64(buffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bytesToBase64(digest);
}

function normalizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export function maskBsn(value) {
  const digits = normalizeDigits(value);
  if (!digits) return null;
  return `*** *** ${digits.slice(-3).padStart(3, "*")}`;
}

export function maskIban(value) {
  const compact = String(value || "").replace(/\s/g, "").toUpperCase();
  if (!compact) return null;
  const country = compact.slice(0, 2) || "**";
  const last4 = compact.slice(-4).padStart(4, "*");
  return `${country}** **** **** ${last4}`;
}

function assertCryptoSupport() {
  if (!crypto?.subtle) {
    throw new Error("Deze browser ondersteunt beveiligde veld-encryptie niet.");
  }
}

export async function encryptSensitiveText(value, context = {}) {
  const plainText = String(value || "").trim();
  if (!plainText) return null;
  assertCryptoSupport();

  const encoded = new TextEncoder().encode(plainText);
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawKey = await crypto.subtle.exportKey("raw", key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  const { data } = await base44.functions.invoke("managedFileCrypto", {
    action: "wrap_key",
    raw_key_b64: bytesToBase64(rawKey),
    context: {
      ...context,
      sensitive_field: context.fieldName || null,
      encryption_policy: "sensitive-field-encryption-v1"
    }
  });

  if (!data?.encrypted_data_key || !data?.key_wrap_iv) {
    throw new Error("Gevoelig veld kon niet veilig worden versleuteld.");
  }

  return {
    encrypted: true,
    version: "sensitive-field-encryption-v1",
    encryption_algorithm: data.encryption_algorithm || "AES-256-GCM",
    encryption_key_id: data.encryption_key_id,
    encryption_iv: bytesToBase64(iv),
    encrypted_data_key: data.encrypted_data_key,
    key_wrap_algorithm: data.key_wrap_algorithm || "AES-256-GCM",
    key_wrap_iv: data.key_wrap_iv,
    ciphertext: bytesToBase64(ciphertext),
    plaintext_sha256: await sha256Base64(encoded)
  };
}

export async function preparePersonnelSensitiveData(sensitiveData, context = {}) {
  const bsnPayload = await encryptSensitiveText(sensitiveData.bsn, {
    ...context,
    fieldName: "bsn",
    source_entity: "PersonnelSensitiveData",
    source_field: "bsn"
  });

  return {
    ...sensitiveData,
    bsn: null,
    bsn_masked: maskBsn(sensitiveData.bsn),
    bsn_encrypted_payload: bsnPayload,
    sensitive_payload_version: "sensitive-field-encryption-v1"
  };
}

export async function prepareBankAccountSensitiveData(bankAccount, context = {}) {
  if (bankAccount.iban_encrypted_payload && bankAccount.iban_masked && bankAccount.iban === bankAccount.iban_masked) {
    return bankAccount;
  }
  const ibanPayload = await encryptSensitiveText(bankAccount.iban, {
    ...context,
    fieldName: "iban",
    source_field: "iban"
  });
  const ibanMasked = maskIban(bankAccount.iban);

  return {
    ...bankAccount,
    iban: ibanMasked || bankAccount.iban,
    iban_masked: ibanMasked,
    iban_encrypted_payload: ibanPayload,
    sensitive_payload_version: "sensitive-field-encryption-v1"
  };
}
