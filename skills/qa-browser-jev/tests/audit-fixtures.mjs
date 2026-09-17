/** Synthetic fixtures for validator tests. Never publish these as browser QA evidence. */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { crc32 } from '../scripts/png-evidence.mjs';
import { minimumCases, createRun } from '../scripts/project.mjs';
import { hash } from '../scripts/jev-core.mjs';
export const digest=b=>createHash('sha256').update(b).digest('hex');
export const json=v=>JSON.stringify(v,null,2)+'\n';
export const subject={revision:'fixture-release',sourceDigest:'b'.repeat(64),buildId:'fixture-build'};
export function chunk(type,body) {
  const content=Buffer.concat([Buffer.from(type),body]);
  const length=Buffer.alloc(4);length.writeUInt32BE(body.length);
  const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(content));
  return Buffer.concat([length,content,crc]);
}
export function png(width=320,height=240,{filter=0,tail=Buffer.alloc(0)}={}) {
  const h=Buffer.alloc(13);h.writeUInt32BE(width,0);h.writeUInt32BE(height,4);h[8]=8;h[9]=2;
  const pixels=Buffer.alloc(height*(width*3+1));
  for(let y=0;y<height;y++)pixels[y*(width*3+1)]=filter;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0)),tail]);
}
export async function configFixture({mobile=false,mode='required'}={}) {
  const c=JSON.parse(await readFile(new URL('../templates/qa.config.example.json',import.meta.url),'utf8'));
  c.browser.viewports=[{id:'desktop',width:320,height:240},...(mobile?[{id:'mobile',width:240,height:320}]:[])];
  c.journeys[0].viewports=c.browser.viewports.map(v=>v.id);c.jev.mode=mode;return c;
}
export async function writeEvidence(dir,path,kind,body) {
  await writeFile(join(dir,path),body);return {path,kind,sha256:digest(body)};
}
export function assertionFor(contract,c) {return {schemaVersion:1,runId:contract.runId,caseId:c.id,subject:{...contract.subject},
  verifierId:'fixture-verifier',observedAt:new Date().toISOString(),status:'passed',passed:true,exitCode:0,
  checks:[{id:'state-preserved',operator:'equals',expected:'A',actual:'A',passed:true}]};}
export function ledgerFor(ctx) {
  const base={runId:ctx.contract.runId,configSha256:ctx.contract.configSha256,contractSha256:ctx.contractSha256,
    caseId:ctx.contract.cases[0].id,purpose:'assessment',attemptId:1};
  return [ {...base,event:'attempt',at:new Date().toISOString()}, {...base,event:'result',mode:'assess',requestedModel:'typesafe-ai/jev',
    returnedModel:'typesafe-ai/jev',approvesQa:false,executedBrowserAction:false,status:'ADVISORY'} ].map(v=>JSON.stringify(v)).join('\n')+'\n';
}
export async function gateFixture(options={}) {
  const dir=await mkdtemp(join(tmpdir(),'browser-qa-gate-'));const config=await configFixture(options);
  const cfgRaw=json(config);await writeFile(join(dir,'config.snapshot.json'),cfgRaw);
  const cases=minimumCases(config).sort((a,b)=>(a.dimension==='visual'?-1:1)-(b.dimension==='visual'?-1:1));
  const contract={schemaVersion:2,runId:'QA-001',environment:'local',subject:{...subject},configSha256:hash(cfgRaw),
    requireLiveJev:config.jev.mode==='required',scope:config.name,scopeExclusions:[],cases};
  const contractHash=hash(json(contract));await writeFile(join(dir,'contract.json'),json(contract));
  const report={schemaVersion:2,runId:contract.runId,environment:'local',subject:{...subject},configSha256:contract.configSha256,
    contractSha256:contractHash,simulated:false,executorId:'executor-a',reviewer:{id:'reviewer-b',independent:true,verdict:'accepted'},
    tools:{agentBrowser:{ready:true,version:'fixture',skillSha256:'c'.repeat(64)},
      jev:{mode:contract.requireLiveJev?'live':'off',smokePassed:contract.requireLiveJev,requests:contract.requireLiveJev?1:0,model:'typesafe-ai/jev'}},cases:[],defects:[]};
  for(const c of cases) {
    const vp=config.browser.viewports.find(v=>v.id===c.viewport);
    const shot=await writeEvidence(dir,c.viewport==='desktop'?'shot.png':'mobile.png','screenshot',png(vp.width,vp.height));
    shot.capture={schemaVersion:1,runId:contract.runId,caseId:c.id,subject:{...subject},capturedAt:new Date().toISOString(),
      url:config.target.baseUrl,viewport:{width:vp.width,height:vp.height},dpr:1,mode:'viewport'};
    const evidence=[shot,await writeEvidence(dir,'snapshot.txt','snapshot','Synthetic snapshot')];
    if(c.dimension==='visual')evidence.push(await writeEvidence(dir,'review.md','visual-review','Synthetic review, tests only.'));
    else evidence.push(await writeEvidence(dir,`${c.id}.assertion.json`,'assertion',json(assertionFor(contract,c))));
    report.cases.push({id:c.id,status:'passed',observed:'Synthetic observation',verifier:'fixture-verifier',actor:c.actor,viewport:c.viewport,
      pathViolation:false,...(c.dimension==='visual'?{visualInspectedBy:'reviewer-b'}:{}),evidence});
  }
  const review={schemaVersion:1,runId:contract.runId,subject:{...subject},contractSha256:contractHash,configSha256:contract.configSha256,
    reviewerId:'reviewer-b',executorId:'executor-a',independent:true,verdict:'accepted',reviewedAt:new Date().toISOString(),caseIds:cases.map(c=>c.id),
    visualEvidence:report.cases.filter(c=>c.visualInspectedBy).flatMap(c=>c.evidence.filter(e=>e.kind==='screenshot').map(e=>({caseId:c.id,path:e.path,sha256:e.sha256})))};
  report.reviewer.evidence=await writeEvidence(dir,'independent-review.json','independent-review',json(review));
  const ctx={contract,config,configSha256:contract.configSha256,contractSha256:contractHash,runDir:dir};
  if(contract.requireLiveJev)await writeFile(join(dir,'jev.jsonl'),ledgerFor(ctx));
  return {dir,config,contract,report,review,ctx,options:{contractHash,approvedContractHash:contractHash,artifactRoot:dir,expectedSubject:{...subject}}};
}
export async function productRun() {
  const project=await mkdtemp(join(tmpdir(),'browser-qa-product-'));const config=await configFixture();
  await writeFile(join(project,'qa.config.json'),json(config));
  const run=await createRun(project,'QA-LIVE',subject);
  const contract=JSON.parse(await readFile(join(run.runDir,'contract.json'),'utf8'));
  const input={schemaVersion:1,mode:'assess',runId:'QA-LIVE',scenarioId:contract.cases[0].id,goal:'Check synthetic persistence',
    environment:'local',dataClass:'synthetic',approvedBySupervisor:true,approvedOrigins:config.target.allowedOrigins,
    observation:{id:'obs-fixture',url:config.target.baseUrl,capturedAt:new Date().toISOString(),snapshot:'Synthetic filter is A',refs:{}},
    criterion:'Filter remains A',evidence:'Independent observation: filter is A'};
  return {project,config,run,contract,input};
}
export function fakeEvaluate(request) {
  return {answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
    const keys=Object.keys(q.criteria);return [id,{type:'choice',choice:keys[0],probabilities:Object.fromEntries(keys.map((k,i)=>[k,i?0:1]))}];
  })),response:{modelId:'typesafe-ai/jev'},usage:{inputTokens:10,outputTokens:3}};
}
