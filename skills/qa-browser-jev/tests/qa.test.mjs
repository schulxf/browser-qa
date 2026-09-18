import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildRequest, validateInput, validateAnswer, normalizeResult, callJev, guardSensitive, hash } from '../scripts/jev-core.mjs';
import { evaluateGate } from '../scripts/qa-gate.mjs';

const NOW = Date.parse('2026-09-17T13:00:00Z');
function input() { return {
  schemaVersion: 1, mode: 'decide', runId: 'QA-001', scenarioId: 'NAV-001',
  goal: 'Abrir Catálogo sem mudar dados.', environment: 'local', dataClass: 'synthetic', approvedBySupervisor: true,
  approvedOrigins: ['http://localhost:3000'],
  observation: { id: 'obs-1', url: 'http://localhost:3000/catalog', capturedAt: new Date(NOW).toISOString(),
    snapshot: '- link "Catálogo" [ref=e1]', refs: { '@e1': { role: 'link', name: 'Catálogo' } } },
  candidates: [{ id: 'openCatalog', kind: 'click', ref: '@e1', description: 'Abrir Catálogo.', risk: 'low', approved: true }]
}; }
function choice(selected, names, p = 1) {
  return { type: 'choice', choice: selected, probabilities: Object.fromEntries(names.map(k => [k, k === selected ? p : (1-p)/(names.length-1)])) };
}
function response(request, overrides = {}) {
  return { answers: Object.fromEntries(Object.entries(request.questions).map(([k, q]) =>
    [k, choice(overrides[k] ?? Object.keys(q.criteria)[0], Object.keys(q.criteria))])),
    usage: { inputTokens: 200, outputTokens: 20 }, response: { modelId: 'typesafe-ai/jev' } };
}
const options = { now: NOW };

test('constrói avaliação nativa, não chat completions', () => {
  const r = buildRequest(input(), options);
  assert.equal(r.model, 'typesafe-ai/jev'); assert.equal(r.messages, undefined);
  assert.equal(r.maxRetries, 0); assert.equal(r.providerOptions.gateway.zeroDataRetention, true);
  assert.equal(r.providerOptions.gateway.disallowPromptTraining, true);
});
for (const [name, change, code] of [
  ['ambiente produção', i => i.environment = 'prd', 'ENVIRONMENT_NOT_ALLOWED'],
  ['dados reais', i => i.dataClass = 'production', 'DATA_NOT_APPROVED'],
  ['sem revisão', i => i.approvedBySupervisor = false, 'DATA_NOT_APPROVED'],
  ['origem não autorizada', i => i.observation.url = 'https://evil.invalid', 'ORIGIN_NOT_APPROVED'],
  ['URL com query', i => i.observation.url += '?code=secret', 'URL_MUST_BE_MINIMIZED'],
  ['URL com fragmento', i => i.observation.url += '#token', 'URL_MUST_BE_MINIMIZED'],
  ['URL com senha', i => i.observation.url = 'http://u:p@localhost:3000', 'URL'],
  ['snapshot antigo', i => i.observation.capturedAt = new Date(NOW-31000).toISOString(), 'STALE_OBSERVATION'],
  ['snapshot do futuro', i => i.observation.capturedAt = new Date(NOW+4000).toISOString(), 'STALE_OBSERVATION'],
  ['ref inventada', i => i.candidates[0].ref = '@e9', 'UNOBSERVED_REF'],
  ['comando arbitrário', i => i.candidates[0].kind = 'eval', 'UNAPPROVED_ACTION'],
  ['risco alto', i => i.candidates[0].risk = 'high', 'UNAPPROVED_ACTION'],
  ['ação sem aprovação', i => i.candidates[0].approved = false, 'UNAPPROVED_ACTION'],
  ['campo senha', i => i.observation.refs['@e1'].name = 'Senha', 'SENSITIVE_FIELD'],
  ['IDs duplicados', i => i.candidates.push({ ...i.candidates[0] }), 'CANDIDATE_ID'],
  ['ID reservado', i => i.candidates[0].id = 'ESCALATE', 'CANDIDATE_ID'],
  ['campo extra', i => i.exec = 'rm -rf /', 'UNKNOWN_INPUT_FIELD'],
  ['valor de formulário injetado', i => i.candidates[0].value = 'segredo', 'CANDIDATE_FIELDS'],
  ['limiar enfraquecido', i => i.policy = { minProbability: 0.1 }, 'PROBABILITY_POLICY'],
]) {
  test(`rejeita ${name}`, () => { const i = input(); change(i); assert.throws(() => validateInput(i, options), { message: code }); });
}
test('recusa chave conhecida presente na entrada', () => {
  const i = input(); i.goal = 'chave-muito-secreta-123';
  assert.throws(() => buildRequest(i, { ...options, secretValues: ['chave-muito-secreta-123'] }), /SECRET_IN_INPUT/);
});
test('recusa token reconhecível', () => assert.throws(() => guardSensitive('Bearer abcdefghijklmnopqrstuvwxyz'), /POSSIBLE_SECRET/));
test('não permite entrada excessiva', () => assert.throws(() => guardSensitive('x'.repeat(50000)), /INPUT_TOO_LARGE/));
test('ação escolhida nunca executa o navegador nem aprova QA', () => {
  const i = input(), r = buildRequest(i, options), out = normalizeResult(i, r, response(r));
  assert.equal(out.status, 'PROPOSED'); assert.equal(out.executedBrowserAction, false); assert.equal(out.approvesQa, false);
});
test('confiança baixa escala', () => {
  const i = input(), r = buildRequest(i, options), res = response(r);
  res.answers.next = choice('openCatalog', Object.keys(r.questions.next.criteria), 0.7);
  assert.equal(normalizeResult(i, r, res).status, 'ESCALATE');
});
test('erro da página escala', () => {
  const i = input(), r = buildRequest(i, options);
  assert.equal(normalizeResult(i, r, response(r, { pageState: 'error' })).status, 'ESCALATE');
});
test('CHECKPOINT não é sucesso', () => {
  const i = input(), r = buildRequest(i, options), res = normalizeResult(i, r, response(r, { next: 'CHECKPOINT' }));
  assert.equal(res.status, 'CHECKPOINT'); assert.equal(res.approvesQa, false);
});
test('resposta fora da allowlist é rejeitada', () => assert.throws(() => validateAnswer(choice('x', ['x','y']), ['a','b']), /ANSWER_CHOICE/));
test('probabilidade NaN rejeitada', () => assert.throws(() => validateAnswer({type:'choice',choice:'a', probabilities:{a:NaN,b:0}}, ['a','b']), /ANSWER_PROBABILITIES/));
test('soma inválida rejeitada', () => assert.throws(() => validateAnswer({type:'choice',choice:'a',probabilities:{a:0.9,b:0.9}}, ['a','b']), /ANSWER_SUM/));
test('escolha que não maximiza probabilidade rejeitada', () => assert.throws(() => validateAnswer({type:'choice',choice:'a',probabilities:{a:0.1,b:0.9}}, ['a','b']), /ANSWER_NOT_MAXIMUM/));
test('evidência semanticamente sustentada continua consultiva', () => {
  const i = input(); i.mode = 'assess'; delete i.candidates;
  i.criterion = 'O filtro continua selecionado.'; i.evidence = 'Leitura independente encontrou o filtro selecionado.';
  const r = buildRequest(i, options), result = normalizeResult(i, r, response(r));
  assert.equal(result.status, 'ADVISORY'); assert.equal(result.approvesQa, false);
});
test('transport recebe AbortSignal e configuração correta', async () => {
  const out = await callJev(input(), { now: NOW, evaluate: async request => {
    assert.ok(request.abortSignal instanceof AbortSignal);
    assert.equal(request.maxRetries, 0); return response(request);
  } });
  assert.equal(out.status, 'PROPOSED');
});
test('falha de transport nunca vira sucesso', async () => {
  await assert.rejects(() => callJev(input(), { now: NOW, evaluate: async () => { throw new Error('falha'); } }), /falha/);
});

import { gateFixture, digest } from './audit-fixtures.mjs';
async function checkFixture(change, expected) {
  const f = await gateFixture();
  try { await change(f); const out = await evaluateGate(f.contract,f.report,f.options); assert.equal(out.status,expected,JSON.stringify(out)); }
  finally { await rm(f.dir,{recursive:true,force:true}); }
}
test('pacote estruturalmente completo passa sem autorizar deploy', async () => {
  const f=await gateFixture(); try {
    const out=await evaluateGate(f.contract,f.report,f.options);
    assert.equal(out.status,'PASSED');assert.equal(out.approvesDeployment,false);assert.equal(out.integrityCheckOnly,true);
  } finally {await rm(f.dir,{recursive:true,force:true});}
});
for (const [name,change,status] of [
  ['caso não executado',f=>f.report.cases[0].status='not_executed','BLOCKED'],
  ['caso falhou',f=>f.report.cases[0].status='failed','FAILED'],
  ['contrato sem casos',f=>f.contract.cases=[],'BLOCKED'],
  ['contrato alterado',f=>f.report.contractSha256='d'.repeat(64),'BLOCKED'],
  ['build diferente',f=>f.options.expectedSubject.buildId='outro','BLOCKED'],
  ['arquivo de evidência ausente',f=>f.report.cases[0].evidence[0].path='missing.png','BLOCKED'],
  ['hash diferente',f=>f.report.cases[0].evidence[0].sha256='f'.repeat(64),'BLOCKED'],
  ['path traversal',f=>f.report.cases[0].evidence[0].path='../secret','BLOCKED'],
  ['self approval',f=>f.report.reviewer.id='executor-a','BLOCKED'],
  ['captura não inspecionada',f=>delete f.report.cases[0].visualInspectedBy,'BLOCKED'],
  ['Jev como revisor visual',f=>f.report.cases[0].visualInspectedBy='jev','BLOCKED'],
  ['Jev em dry-run',f=>f.report.tools.jev.mode='dry-run','BLOCKED'],
  ['resultado simulado',f=>f.report.simulated=true,'BLOCKED'],
  ['caminho recuperado',f=>f.report.cases[0].pathViolation=true,'FAILED'],
  ['P1 aberto na superfície',f=>f.report.defects=[{id:'BUG-1',severity:'P1',status:'open',inChangedSurface:true}],'FAILED'],
  ['bug corrigido sem reteste',f=>f.report.defects=[{id:'BUG-1',severity:'P1',status:'fixed',inChangedSurface:true}],'BLOCKED'],
  ['casos duplicados',f=>f.report.cases.push({...f.report.cases[0]}),'BLOCKED'],
]) test(`gate bloqueia ${name}`,()=>checkFixture(change,status));
test('symlink fora da pasta é rejeitado',async t=>{
  const f=await gateFixture();
  try {
    try { await symlink(join(f.dir,'..'),join(f.dir,'escape')); }
    catch(error){if(error.code==='EPERM'){t.skip('host não permite criar symlink');return;}throw error;}
    f.report.cases[0].evidence[0].path='escape';
    const out=await evaluateGate(f.contract,f.report,f.options);
    assert.equal(out.status,'BLOCKED',JSON.stringify(out));
  } finally { await rm(f.dir,{recursive:true,force:true}); }
});
test('texto disfarçado de screenshot é rejeitado',()=>checkFixture(async f=>{
  await writeFile(join(f.dir,'shot.png'),'not an image');
  f.report.cases[0].evidence[0].sha256=digest('not an image');
},'BLOCKED'));
