import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, mkdtemp, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gateFixture, productRun, fakeEvaluate, png, digest, json, chunk, assertionFor } from './audit-fixtures.mjs';
import { evaluateGate } from '../scripts/qa-gate.mjs';
import { runEvaluation } from '../scripts/jev.mjs';
import { loadApprovedRun } from '../scripts/run-contract.mjs';
import { inspectLedger } from '../scripts/jev-ledger.mjs';
import { validatePng, validateCapture } from '../scripts/png-evidence.mjs';
import { guardSensitive, hash } from '../scripts/jev-core.mjs';
import { loadGatewayCredential, defaultCredentialsFile } from '../scripts/credentials.mjs';
import { diagnose } from '../scripts/diagnostics.mjs';
import { createRun } from '../scripts/project.mjs';

async function fixture(options,fn){const f=await gateFixture(options);try{return await fn(f);}finally{await rm(f.dir,{recursive:true,force:true});}}
async function mutateArtifact(f,e,body){await writeFile(join(f.dir,e.path),body);e.sha256=digest(body);}
const flow=f=>f.report.cases.find(c=>c.id.endsWith('-flow'));
const visual=f=>f.report.cases.find(c=>c.id.endsWith('-visual'));
const gate=f=>evaluateGate(f.contract,f.report,f.options);
function rehashContract(f){const sha=hash(json(f.contract));f.report.contractSha256=sha;f.options.contractHash=sha;f.options.approvedContractHash=sha;}

for(const [name,mutate,code] of [
  ['removed mobile coverage',f=>{f.contract.cases=f.contract.cases.filter(c=>c.viewport!=='mobile');f.report.cases=f.report.cases.filter(c=>c.viewport!=='mobile');rehashContract(f);},'REQUIRED_COVERAGE_MISSING'],
  ['disabled required Jev',f=>{f.contract.requireLiveJev=false;rehashContract(f);},'CONTRACT_POLICY_MISMATCH'],
  ['weakened expected behavior',f=>{f.contract.cases.find(c=>c.dimension==='flow').criterion='It opens';rehashContract(f);},'REQUIRED_CASE_CHANGED'],
  ['removed no-recovery rule',f=>{f.contract.cases[0].forbiddenRecovery=[];rehashContract(f);},'REQUIRED_CASE_CHANGED'],
  ['missing approved digest',f=>{delete f.options.approvedContractHash;},'APPROVED_CONTRACT_HASH'],
  ['different approved digest',f=>{f.options.approvedContractHash='f'.repeat(64);},'APPROVED_CONTRACT_HASH'],
  ['unapproved scope exclusion',f=>{const c=f.contract.cases.pop();f.contract.scopeExclusions=[{caseId:c.id,reason:'Not relevant'}];rehashContract(f);},'INVALID_SCOPE_EXCLUSION'],
])test(`F02 rejects ${name}`,()=>fixture({mobile:true},async f=>{mutate(f);const r=await gate(f);assert.equal(r.status,'BLOCKED');assert.ok(r.blocked.includes(code),JSON.stringify(r));}));

test('F02 allows an explicit pre-approved exclusion and unchanged remaining coverage',()=>fixture({mobile:true,mode:'off'},async f=>{
  const removed=f.contract.cases.filter(c=>c.viewport==='mobile');
  f.contract.scopeExclusions=removed.map(c=>({caseId:c.id,reason:'This release explicitly excludes mobile',approvedBy:'reviewer-b',approvedAt:new Date().toISOString()}));
  f.contract.cases=f.contract.cases.filter(c=>c.viewport!=='mobile');f.report.cases=f.report.cases.filter(c=>c.viewport!=='mobile');rehashContract(f);
  f.review.contractSha256=f.options.contractHash;f.review.caseIds=f.contract.cases.map(c=>c.id);f.review.visualEvidence=f.review.visualEvidence.filter(e=>!e.caseId.includes('mobile'));
  await mutateArtifact(f,f.report.reviewer.evidence,json(f.review));const r=await gate(f);assert.equal(r.status,'PASSED',JSON.stringify(r));
}));
for(const [name,change] of [
  ['header only',()=>Buffer.from([137,80,78,71,13,10,26,10])],
  ['truncated data',()=>png().subarray(0,-13)],
  ['bad CRC',()=>{const b=png();b[29]^=1;return b;}],
  ['invalid row filter',()=>png(320,240,{filter:9})],
  ['trailing bytes',()=>png(320,240,{tail:Buffer.from('extra')})],
  ['wrong dimensions',()=>png(1,1)],
])test(`F03 rejects ${name}`,()=>fixture({},async f=>{const e=visual(f).evidence[0];await mutateArtifact(f,e,change());const r=await gate(f);assert.equal(r.status,'BLOCKED',JSON.stringify(r));assert.ok(r.blocked.some(v=>/PNG|CAPTURE_DIMENSIONS/.test(v)));}));
test('F03 rejects decompression bombs before inflation',()=>{
  const h=Buffer.alloc(13);h.writeUInt32BE(32768);h.writeUInt32BE(32768,4);h[8]=8;h[9]=2;
  const b=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',Buffer.from([0])),chunk('IEND',Buffer.alloc(0))]);
  assert.throws(()=>validatePng(b),/DIMENSION_LIMIT/);
});
for(const [name,edit,image] of [
  ['DPR 2',m=>m.dpr=2,{width:640,height:480}],
  ['full-page',m=>{m.mode='full-page';m.documentSize={width:320,height:1000};},{width:320,height:1000}],
  ['detail clip',m=>{m.mode='clip';m.clip={x:10,y:10,width:100,height:80};},{width:100,height:80}],
])test(`F03 supports measured ${name}`,()=>fixture({},async f=>{
  const c=f.contract.cases[0],m=structuredClone(f.report.cases[0].evidence[0].capture);edit(m);
  assert.equal(validateCapture(m,validatePng(png(image.width,image.height)),{contract:f.contract,caseSpec:c,config:f.config}),m);
}));
test('F03 rejects missing metadata and incorrect build identity',()=>fixture({},async f=>{
  const e=visual(f).evidence[0];e.capture.subject.buildId='different';let r=await gate(f);assert.ok(r.blocked.some(x=>x.includes('CAPTURE_IDENTITY')));
  delete e.capture;r=await gate(f);assert.equal(r.status,'BLOCKED');
}));
test('F03 clip alone cannot establish whole-screen visual coverage',()=>fixture({mode:'off'},async f=>{
  const e=visual(f).evidence[0];e.capture.mode='clip';e.capture.clip={x:0,y:0,width:1,height:1};await mutateArtifact(f,e,png(1,1));
  const r=await gate(f);assert.ok(r.blocked.some(v=>v.includes('FULL_CONTEXT_IMAGE_REQUIRED')));
}));
for(const [name,change] of [
  ['negative minimal assertion',()=>({passed:false,exitCode:1})],
  ['negative envelope',a=>({...a,passed:false,status:'failed',exitCode:1})],
  ['lying comparison',a=>({...a,checks:[{id:'different',expected:1,actual:2,passed:true}]})],
])test(`F04 ${name} overrides a passed summary`,()=>fixture({},async f=>{
  const e=flow(f).evidence.find(v=>v.kind==='assertion');const a=JSON.parse(await readFile(join(f.dir,e.path),'utf8'));
  await mutateArtifact(f,e,json(change(a)));const r=await gate(f);assert.equal(r.status,'FAILED',JSON.stringify(r));assert.ok(r.failed.some(c=>c.endsWith(':ASSERTION_FAILED')));
}));
for(const [name,change] of [
  ['unknown format',()=>({passed:true,exitCode:0})],
  ['wrong case',a=>({...a,caseId:'unrelated'})],
  ['wrong build',a=>({...a,subject:{...a.subject,buildId:'other'}})],
  ['unknown operator',a=>({...a,checks:[{id:'custom',operator:'execute-command',expected:1,actual:1,passed:true}]})],
])test(`F04 blocks ${name}`,()=>fixture({},async f=>{
  const e=flow(f).evidence.find(v=>v.kind==='assertion');const a=JSON.parse(await readFile(join(f.dir,e.path),'utf8'));
  await mutateArtifact(f,e,json(change(a)));const r=await gate(f);assert.equal(r.status,'BLOCKED');
}));
for(const [name,change] of [
  ['missing ledger',async f=>rm(join(f.dir,'jev.jsonl'))],
  ['wrong ledger context',async f=>writeFile(join(f.dir,'jev.jsonl'),(await readFile(join(f.dir,'jev.jsonl'),'utf8')).replaceAll(f.contract.configSha256,'0'.repeat(64)))],
  ['wrong model',async f=>writeFile(join(f.dir,'jev.jsonl'),(await readFile(join(f.dir,'jev.jsonl'),'utf8')).replaceAll('typesafe-ai/jev','not-jev'))],
  ['incomplete attempt',async f=>writeFile(join(f.dir,'jev.jsonl'),(await readFile(join(f.dir,'jev.jsonl'),'utf8')).split('\n')[0]+'\n')],
  ['wrong usage count',async f=>{f.report.tools.jev.requests=999;}],
  ['missing review artifact',async f=>rm(join(f.dir,f.report.reviewer.evidence.path))],
  ['incomplete review coverage',async f=>{f.review.caseIds=[];await mutateArtifact(f,f.report.reviewer.evidence,json(f.review));}],
  ['review of different image',async f=>{f.review.visualEvidence[0].sha256='0'.repeat(64);await mutateArtifact(f,f.report.reviewer.evidence,json(f.review));}],
])test(`F04 blocks ${name}`,()=>fixture({},async f=>{await change(f);const r=await gate(f);assert.equal(r.status,'BLOCKED',JSON.stringify(r));}));

async function liveFixture(fn){const f=await productRun();const prior=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='synthetic-evaluation-key';try{await fn(f);}finally{if(prior===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=prior;await rm(f.project,{recursive:true,force:true});}}
for(const [name,change] of [
  ['budget',c=>c.jev.maxCalls=100],['origins',c=>c.target.allowedOrigins.push('http://localhost:9191')],
  ['environment',c=>c.target.environment='test'],['artifact location',c=>c.artifacts.directory='.other-run-root'],
])test(`F01 refuses changed ${name} before first transport`,()=>liveFixture(async f=>{
  change(f.config);await writeFile(join(f.project,'qa.config.json'),json(f.config));let called=false;
  await assert.rejects(()=>runEvaluation(f.input,{project:f.project,approvedContractSha256:f.run.contractSha256,evaluate:async()=>{called=true;}}));assert.equal(called,false);
}));
test('F01 refuses an unknown scenario, missing run and changed contract',()=>liveFixture(async f=>{
  await assert.rejects(()=>runEvaluation({...f.input,scenarioId:'unknown'},{project:f.project,approvedContractSha256:f.run.contractSha256,evaluate:fakeEvaluate}),/SCENARIO_NOT_IN_CONTRACT/);
  await assert.rejects(()=>loadApprovedRun(f.project,'QA-NONE',f.run.contractSha256));
  await writeFile(join(f.run.runDir,'contract.json'),json({...f.contract,requireLiveJev:false}));
  await assert.rejects(()=>runEvaluation(f.input,{project:f.project,approvedContractSha256:f.run.contractSha256,evaluate:fakeEvaluate}),/APPROVED_CONTRACT_CHANGED/);
}));
test('F01 approved run uses the persisted shared budget',()=>liveFixture(async f=>{
  f.config.jev.maxCalls=1;await writeFile(join(f.project,'qa.config.json'),json(f.config));
  const next=await createRun(f.project,'QA-NEXT',f.contract.subject);f.input.runId='QA-NEXT';
  const opts={project:f.project,approvedContractSha256:next.contractSha256,evaluate:fakeEvaluate};
  const r=await runEvaluation(f.input,opts);assert.equal(r.status,'ADVISORY');
  await assert.rejects(()=>runEvaluation(f.input,opts),/CALL_BUDGET_EXHAUSTED/);
  const ctx=await loadApprovedRun(f.project,'QA-NEXT',next.contractSha256,f.input.scenarioId);
  assert.deepEqual(inspectLedger(await readFile(join(next.runDir,'jev.jsonl'),'utf8'),ctx),{attempts:1,results:1,errors:0,pending:false});
}));
test('F01 connectivity is separate and cannot count as product evidence',()=>liveFixture(async f=>{
  f.input.runId='QA-SMOKE';f.input.scenarioId='API-SMOKE';
  const r=await runEvaluation(f.input,{project:f.project,smoke:true,evaluate:fakeEvaluate});assert.equal(r.countsAsProductCoverage,false);
  await assert.rejects(()=>readFile(join(f.run.runDir,'jev.jsonl')),{code:'ENOENT'});
}));
for(const value of [
  {password:'test-sentinel'}, {nested:{api_key:'test-sentinel'}},
  JSON.stringify({password:'test-sentinel'}),JSON.stringify(JSON.stringify({password:'test-sentinel'})),
  'log: {"password":"test-sentinel"}', 'password=test-sentinel',
  String.raw`log: {\"password\":\"test-sentinel\"}`,
])test('F05 blocks structured, quoted and embedded secrets',()=>assert.throws(()=>guardSensitive(value),/POSSIBLE_SECRET/));
test('F05 known secret matching works after decoding JSON escapes',()=>assert.throws(()=>guardSensitive('"\\u0073ynthetic-key"',['synthetic-key']),/SECRET_IN_INPUT/));
test('F05 safe dry-run prints only metadata',()=>liveFixture(async f=>{
  const r=await runEvaluation(f.input,{project:f.project,approvedContractSha256:f.run.contractSha256,dry:true});
  assert.equal(r.payloadPrinted,false);assert.equal(r.request,undefined);assert.ok(!JSON.stringify(r).includes(f.input.evidence));
}));
test('F05 dry-run loads file credentials and never echoes the sentinel',async()=>{
  const f=await productRun();try{
    const key='qa-only-private-sentinel';const file=join(f.project,'private.env');await writeFile(file,`AI_GATEWAY_API_KEY=${key}\n`,{mode:0o600});
    f.input.evidence=key;const request=join(f.project,'request.json');await writeFile(request,json(f.input));
    const env={...process.env,BROWSER_QA_ENV_FILE:file};delete env.AI_GATEWAY_API_KEY;
    const p=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/jev.mjs',import.meta.url)),request,'--project',f.project,'--approved-contract-sha256',f.run.contractSha256,'--dry-run'],{encoding:'utf8',env});
    assert.equal(p.status,2,p.stderr);assert.ok(!`${p.stdout}${p.stderr}`.includes(key));assert.match(p.stderr,/SECRET_IN_INPUT/);
  }finally{await rm(f.project,{recursive:true,force:true});}
});
