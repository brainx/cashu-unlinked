import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

export function buildMintEnvironment(runDirectory, ambient = process.env) {
  const environment = {};
  for (const key of ['PATH', 'LANG', 'TMPDIR']) {
    if (ambient[key] !== undefined) environment[key] = ambient[key];
  }
  for (const [key, value] of Object.entries(ambient)) {
    if (key.startsWith('LC_') && value !== undefined) environment[key] = value;
  }
  return {
    ...environment,
    CASHU_DIR: runDirectory,
    MINT_DATABASE: resolve(runDirectory, 'mint'),
    MINT_AUTH_DATABASE: resolve(runDirectory, 'auth'),
    MINT_PRIVATE_KEY: `UNLINKED_FAKE_VALUE_${randomUUID()}`,
    MINT_BACKEND_BOLT11_SAT: 'FakeWallet',
    MINT_LISTEN_HOST: '127.0.0.1',
    MINT_LISTEN_PORT: '3338',
    TOR: 'FALSE',
    DEBUG: 'FALSE',
    FAKEWALLET_BRR: 'TRUE',
    FAKEWALLET_DELAY_INCOMING_PAYMENT: '0',
    MINT_RATE_LIMIT: 'FALSE',
  };
}
