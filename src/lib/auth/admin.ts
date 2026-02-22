import { createHmac, timingSafeEqual } from 'crypto';

export const ADMIN_SESSION_COOKIE = 'gravix_admin_session';
const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

function readEnv(key: string): string | undefined {
  const value = process.env[key];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function getAdminEmail(): string {
  return readEnv('ADMIN_EMAIL') || 'gravixrdp@gmail.com';
}

export function getAdminPassword(): string {
  return readEnv('ADMIN_PASSWORD') || '@VGahir444';
}

function getSessionSecret(): string {
  return readEnv('ADMIN_SESSION_SECRET') || 'gravixrdp-admin-secret-change-this';
}

function signPayload(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('hex');
}

function encodeBase64(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function decodeBase64(input: string): string | null {
  try {
    return Buffer.from(input, 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

export function buildAdminSessionToken(email: string): string {
  const expiresAt = Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000;
  const payload = `${email}|${expiresAt}`;
  const signature = signPayload(payload);
  return `${encodeBase64(payload)}.${signature}`;
}

export function isValidAdminSessionToken(token: string): boolean {
  const [encodedPayload, providedSignature] = token.split('.');
  if (!encodedPayload || !providedSignature) {
    return false;
  }

  const payload = decodeBase64(encodedPayload);
  if (!payload) {
    return false;
  }

  const expectedSignature = signPayload(payload);
  const providedBuffer = Buffer.from(providedSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  if (!timingSafeEqual(providedBuffer, expectedBuffer)) {
    return false;
  }

  const [email, expiresAtRaw] = payload.split('|');
  const expiresAt = Number.parseInt(expiresAtRaw || '', 10);

  if (!email || !Number.isFinite(expiresAt)) {
    return false;
  }

  if (email !== getAdminEmail()) {
    return false;
  }

  return Date.now() < expiresAt;
}

export function isValidAdminCredential(email: string, password: string): boolean {
  return email.trim().toLowerCase() === getAdminEmail().toLowerCase() && password === getAdminPassword();
}

export function getAdminSessionMaxAge(): number {
  return ADMIN_SESSION_TTL_SECONDS;
}
