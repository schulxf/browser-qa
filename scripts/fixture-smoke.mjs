/** Smoke HTTP local. Não abre navegador nem atesta layout ou comportamento de cliques. */
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createFixtureServer } from '../examples/fixture-app/server.mjs';
const {server,identity}=await createFixtureServer();
server.listen(0,'127.0.0.1');
await once(server,'listening');
try{
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/__qa/build');assert.equal(response.status,200);
  const observed=await response.json();assert.deepEqual(observed,identity);assert.match(observed.sourceDigest,/^[a-f0-9]{64}$/);
  for(const path of ['/','/broken-state','/broken-layout']){const r=await fetch(base+path);assert.equal(r.status,200);const text=await r.text();assert.ok(text.includes('Catálogo de teste'));assert.ok(text.includes('lost-state'));}
  assert.equal((await fetch(base+'/missing')).status,404);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  console.log('Fixture HTTP: PASS (3 rotas, identidade, 404 e 405). Browser/visual: NOT_EXECUTED.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
