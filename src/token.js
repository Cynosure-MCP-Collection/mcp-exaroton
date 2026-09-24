export function parseApiToken(value) {
  const token = value?.trim().replace(/^Bearer(?:\s+|$)/i, '').trim();
  if (!token) {
    throw new Error('EXAROTON_API_TOKEN is required. Create one at https://exaroton.com/account');
  }
  return token;
}
