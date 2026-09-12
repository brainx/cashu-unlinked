import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMintEnvironment } from '../../lab/mint-environment.mjs';

test('mint environment excludes ambient Cashu and Lightning configuration', () => {
  const environment = buildMintEnvironment('/tmp/unlinked-mint', {
    PATH: '/usr/bin',
    LANG: 'en_US.UTF-8',
    LC_ALL: 'en_US.UTF-8',
    TMPDIR: '/tmp/',
    MINT_BACKEND_BOLT11_USD: 'RealWallet',
    MINT_LND_REST_ENDPOINT: 'https://real.example',
    CASHU_DIR: '/sensitive/ambient',
    LIGHTNING_PASSWORD: 'not-for-the-lab',
  });

  assert.equal(environment.PATH, '/usr/bin');
  assert.equal(environment.MINT_BACKEND_BOLT11_SAT, 'FakeWallet');
  assert.equal(environment.CASHU_DIR, '/tmp/unlinked-mint');
  for (const forbidden of [
    'MINT_BACKEND_BOLT11_USD',
    'MINT_LND_REST_ENDPOINT',
    'LIGHTNING_PASSWORD',
  ]) {
    assert.equal(Object.hasOwn(environment, forbidden), false, forbidden);
  }
});
