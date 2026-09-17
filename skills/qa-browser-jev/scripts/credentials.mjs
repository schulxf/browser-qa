import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export function defaultCredentialsFile(env = process.env, platform = process.platform) {
  if (env.BROWSER_QA_ENV_FILE) return resolve(env.BROWSER_QA_ENV_FILE);
  if (platform === 'win32') {
    const base = env.APPDATA || (env.USERPROFILE ? join(env.USERPROFILE, 'AppData', 'Roaming') : '');
    if (!base) throw new Error('BROWSER_QA_CREDENTIAL_PATH_UNAVAILABLE');
    return join(base, 'browser-qa', 'credentials.env');
  }
  const base = env.XDG_CONFIG_HOME || (env.HOME ? join(env.HOME, '.config') : '');
  if (!base) throw new Error('BROWSER_QA_CREDENTIAL_PATH_UNAVAILABLE');
  return join(base, 'browser-qa', 'credentials.env');
}

export function credentialsDirectory(env = process.env, platform = process.platform) {
  return dirname(defaultCredentialsFile(env, platform));
}

export function parseGatewayCredential(text) {
  const match = /^(?:export\s+)?AI_GATEWAY_API_KEY=(.*)$/m.exec(String(text).replace(/^\uFEFF/, ''));
  if (!match) return '';
  const value = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!value || /[\r\n\0]/.test(value)) return '';
  return value;
}

export async function loadGatewayCredential({
  env = process.env,
  platform = process.platform,
  read = readFile,
  inspect = lstat,
} = {}) {
  if (env.AI_GATEWAY_API_KEY?.trim()) return { present: true, source: 'environment', file: null };
  const file = defaultCredentialsFile(env, platform);
  try {
    const metadata = await inspect(file);
    if (metadata.isSymbolicLink?.() || (metadata.isFile && !metadata.isFile())) throw new Error('BROWSER_QA_CREDENTIAL_FILE_TYPE');
    if (platform !== 'win32') {
      if ((metadata.mode & 0o077) !== 0) throw new Error('BROWSER_QA_CREDENTIAL_FILE_PERMISSIONS');
    }
    const value = parseGatewayCredential(await read(file, 'utf8'));
    if (!value) return { present: false, source: 'file-invalid', file };
    env.AI_GATEWAY_API_KEY = value;
    return { present: true, source: 'private-file', file };
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, source: 'missing', file };
    throw error;
  }
}
