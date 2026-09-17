import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { defaultCredentialsFile, loadGatewayCredential, parseGatewayCredential } from '../scripts/credentials.mjs';

test('resolve credenciais por plataforma e aceita override explícito', () => {
  assert.match(defaultCredentialsFile({ APPDATA: 'C:/Users/test/AppData/Roaming' }, 'win32'), /browser-qa[\\/]credentials\.env$/);
  assert.equal(defaultCredentialsFile({ BROWSER_QA_ENV_FILE: './private.env' }, 'linux'), resolve('./private.env'));
  assert.match(defaultCredentialsFile({ HOME: '/home/test' }, 'linux'), /[\\/]home[\\/]test[\\/]\.config[\\/]browser-qa[\\/]credentials\.env$/);
});

test('parser lê apenas AI_GATEWAY_API_KEY', () => {
  assert.equal(parseGatewayCredential('AI_GATEWAY_API_KEY="secret"\n'), 'secret');
  assert.equal(parseGatewayCredential('export AI_GATEWAY_API_KEY=secret-2\n'), 'secret-2');
  assert.equal(parseGatewayCredential('OTHER_KEY=secret\n'), '');
});

test('ambiente existente tem precedência e arquivo não é lido', async () => {
  const env = { AI_GATEWAY_API_KEY: 'from-env' };
  const result = await loadGatewayCredential({ env, read: async () => assert.fail('não deve ler arquivo') });
  assert.deepEqual(result, { present: true, source: 'environment', file: null });
});

test('arquivo privado é carregado sem expor o valor no resultado', async () => {
  const env = { HOME: '/home/test' };
  const result = await loadGatewayCredential({
    env,
    platform: 'linux',
    inspect: async () => ({ mode: 0o100600 }),
    read: async () => 'AI_GATEWAY_API_KEY=file-secret\n',
  });
  assert.equal(env.AI_GATEWAY_API_KEY, 'file-secret');
  assert.equal(result.present, true);
  assert.equal(result.source, 'private-file');
  assert.equal(JSON.stringify(result).includes('file-secret'), false);
});

test('arquivo permissivo é recusado em POSIX', async () => {
  await assert.rejects(() => loadGatewayCredential({
    env: { HOME: '/home/test' },
    platform: 'linux',
    inspect: async () => ({ mode: 0o100644 }),
    read: async () => 'AI_GATEWAY_API_KEY=secret\n',
  }), /BROWSER_QA_CREDENTIAL_FILE_PERMISSIONS/);
});

test('symlink de credencial é recusado', async () => {
  await assert.rejects(() => loadGatewayCredential({
    env: { HOME: '/home/test' },
    platform: 'linux',
    inspect: async () => ({ mode: 0o100600, isSymbolicLink: () => true, isFile: () => false }),
    read: async () => 'AI_GATEWAY_API_KEY=secret\n',
  }), /BROWSER_QA_CREDENTIAL_FILE_TYPE/);
});
