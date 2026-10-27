import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

// Generate local-only keys without printing their values or replacing existing ones.
const variables = [
  'APP_ORIGIN=http://localhost:4173',
  'APP_ENV=development',
  'BETTER_AUTH_SECRET=' + randomBytes(48).toString('base64url'),
  'DATA_ENCRYPTION_KEY=' + randomBytes(32).toString('base64'),
  'EMAIL_ENABLED=false',
  'TURNSTILE_SITE_KEY=',
  'TURNSTILE_SECRET_KEY=',
  'GOOGLE_CLIENT_ID=',
  'GOOGLE_CLIENT_SECRET=',
  'VAPID_PUBLIC_KEY=',
  'VAPID_PRIVATE_KEY=',
  'VAPID_SUBJECT=http://localhost:4173',
].join('\n') + '\n';

try {
  await writeFile('.dev.vars', variables, { flag: 'wx', mode: 0o600 });
  console.log('Configuração local criada em .dev.vars. Mantenha esse arquivo fora do Git.');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('.dev.vars já existe; a configuração foi preservada.');
}
