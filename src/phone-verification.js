import twilio from 'twilio';

function buildClient() {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
  const verifyServiceSid = String(process.env.TWILIO_VERIFY_SERVICE_SID || '').trim();

  if (!accountSid || !authToken || !verifyServiceSid) {
    return null;
  }

  return {
    sdk: twilio(accountSid, authToken),
    verifyServiceSid,
  };
}

export function normalizeSwedishPhone(input) {
  const raw = String(input || '').trim().replace(/[\s()-]/g, '');
  if (!raw) return null;

  let normalized = raw;
  if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;
  if (normalized.startsWith('0')) normalized = `+46${normalized.slice(1)}`;
  if (!normalized.startsWith('+46')) return null;

  if (!/^\+46[1-9]\d{6,11}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export function maskPhone(phone) {
  const value = String(phone || '');
  if (value.length < 5) return value;
  return `${value.slice(0, 4)}${'*'.repeat(Math.max(0, value.length - 6))}${value.slice(-2)}`;
}

export function normalizeEmail(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  return value;
}

export function maskEmail(email) {
  const value = normalizeEmail(email);
  if (!value) return '';
  const [name, domain] = value.split('@');
  if (!name || !domain) return value;
  if (name.length <= 2) return `${name[0] || '*'}*@${domain}`;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export async function sendVerificationCode(phoneNumber) {
  const client = buildClient();
  if (!client) {
    throw new Error('twilio_not_configured');
  }

  return client.sdk.verify.v2
    .services(client.verifyServiceSid)
    .verifications.create({ to: phoneNumber, channel: 'sms' });
}

export async function checkVerificationCode(phoneNumber, code) {
  const client = buildClient();
  if (!client) {
    throw new Error('twilio_not_configured');
  }

  return client.sdk.verify.v2
    .services(client.verifyServiceSid)
    .verificationChecks.create({ to: phoneNumber, code: String(code || '').trim() });
}

export async function sendEmailVerificationCode(email) {
  const client = buildClient();
  if (!client) {
    throw new Error('twilio_not_configured');
  }

  return client.sdk.verify.v2
    .services(client.verifyServiceSid)
    .verifications.create({ to: email, channel: 'email' });
}

export async function checkEmailVerificationCode(email, code) {
  const client = buildClient();
  if (!client) {
    throw new Error('twilio_not_configured');
  }

  return client.sdk.verify.v2
    .services(client.verifyServiceSid)
    .verificationChecks.create({ to: email, code: String(code || '').trim() });
}
