import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { hash, QaError } from '../scripts/jev-core.mjs';
import { createRun, SKILL_DIR } from '../scripts/project.mjs';
import { normalizeObservation, validatePlan, candidatesFor, commandFor, executeSegment } from '../scripts/navigation-core.mjs';
import { NavigationBrowser, browserEnvironment } from '../scripts/navigation-browser.mjs';
import { loadNavigationRun, evaluateForNavigation, navigate } from '../scripts/navigation.mjs';

const config = JSON.parse(await readFile(resolve(SKILL_DIR,'templates/qa.config.example.json'),'utf8'));
const origin = config.target.allowedOrigins[0];
const before = () => normalizeObservation({url:origin+'/',snapshot:'Catalog Help Other',refs:{e1:{role:'button',name:'Help'},e2:{role:'button',name:'Other'}}},config.target.allowedOrigins);
const after = () => normalizeObservation({url:origin+'/',snapshot:'Help content Back',refs:{e3:{role:'button',name:'Back'}}},config.target.allowedOrigins);
const contract = {runId:'QA-ONE',cases:[{id:'FILTER-01-desktop-flow',dimension:'flow'}]};
const contractSha256 = hash('approved contract');
function plan() {
  return {schemaVersion:1,id:'segment-1',runId:'QA-ONE',caseId:'FILTER-01-desktop-flow',contractSha256,
    approvedBySupervisor:true,dataClass:'synthetic',review:{checkpointId:'cp-start',observationHash:before().stateHash,
      screenshotSha256:hash('test image'),reviewedBy:'supervisor',accepted:true},
    steps:[{id:'help',goal:'Open Help',at:origin+'/',settleTimeoutMs:0,options:[
      {kind:'click',role:'button',name:'Help',effect:'read-only'},
      {kind:'click',role:'button',name:'Other',effect:'read-only'}],expectedAfter:{textIncludes:['Help content']}}]};
}
const validate = p => validatePlan(p,{config,contract,contractSha256});
async function segment(p=plan(), options={}) {
  const observations = options.observations ?? [before(),before(),after()];
  const actions=[],events=[];let decisions=0;
  const result=await executeSegment(p,{config,
    observe:async()=>observations.shift() ?? after(),
    act:async a=>{actions.push(a);if(options.failAction)throw new QaError('NAV_BROWSER_TIMEOUT_OUTCOME_UNKNOWN');},
    checkpoint:async()=>{},emit:async e=>events.push(e),
    decide:async()=>{decisions++;return options.decision ?? {status:'PROPOSED',selectedCandidate:'option-1',usage:{inputTokens:20,outputTokens:4},latencyMs:5};}});
  return {result,actions,events,decisions};
}

test('normalizes actual agent-browser JSON refs and does not disclose URL query values',()=>{
  const o=normalizeObservation({url:origin+'/?session=local-synthetic#private',snapshot:'Hello',refs:{e1:{role:'button',name:'Help'}}},[origin]);
  assert.ok(o.refs['@e1']);assert.equal(o.url,origin+'/');assert.equal(JSON.stringify(o).includes('local-synthetic'),false);
  assert.notEqual(o.stateHash,normalizeObservation({url:origin+'/',snapshot:'Hello',refs:{e1:{role:'button',name:'Help'}}},[origin]).stateHash);
});
test('unknown origins and malformed refs are refused',()=>{
  assert.throws(()=>normalizeObservation({url:'https://other.invalid/',snapshot:'Hi',refs:{}},[origin]),/NAV_ORIGIN/);
  assert.throws(()=>normalizeObservation({url:origin,snapshot:'Hi',refs:{bad:{role:'button',name:'Help'}}},[origin]),/NAV_REFS/);
});
test('plan is reviewed once and supports a bounded navigation segment',()=>assert.equal(validate(plan()).steps.length,1));
for(const [label,change] of [
  ['more than three actions',p=>p.steps=Array.from({length:4},(_,i)=>({...p.steps[0],id:'s'+i}))],
  ['missing visual review',p=>p.review.accepted=false],
  ['Jev visual reviewer',p=>p.review.reviewedBy='Jev'],
  ['unapproved plan',p=>p.approvedBySupervisor=false],
  ['real data',p=>p.dataClass='real'],
  ['changed contract',p=>p.contractSha256=hash('changed')],
  ['duplicate steps',p=>p.steps.push(p.steps[0])],
  ['arbitrary shell',p=>p.steps[0].options[0].shell='anything'],
  ['arbitrary selector',p=>p.steps[0].options[0].selector='body'],
  ['mutation capability',p=>p.steps[0].options[0].effect='mutation'],
  ['destructive button',p=>p.steps[0].options[0].name='Delete account'],
  ['password field',p=>p.steps[0].options[0]={kind:'fill',role:'textbox',name:'Password',value:'synthetic',effect:'synthetic-input'}],
  ['native select shortcut',p=>p.steps[0].options[0].kind='select'],
  ['duplicate role and name',p=>p.steps[0].options.push(p.steps[0].options[0])],
  ['CLI flag as fill value',p=>p.steps[0].options[0]={kind:'fill',role:'textbox',name:'Search',value:'--auto-connect',effect:'synthetic-input'}],
  ['unbounded readiness wait',p=>p.steps[0].settleTimeoutMs=999999],
  ['postcondition missing',p=>p.steps[0].expectedAfter={}],
  ['external postcondition',p=>p.steps[0].expectedAfter={url:'https://other.invalid/'}]
])test(`rejects ${label}`,()=>{const p=plan();change(p);assert.throws(()=>validate(p));});
test('candidate discovery uses exact unique observed names, never approximate matches',()=>{
  const s=plan().steps[0];assert.equal(candidatesFor(s,before()).length,2);
  const o=before();o.refs['@e9']={role:'button',name:'Help'};assert.throws(()=>candidatesFor(s,o),/AMBIGUOUS/);
  s.options=[{kind:'click',role:'button',name:'Hel',effect:'read-only'}];assert.throws(()=>candidatesFor(s,before()),/NO_APPROVED/);
});
test('Jev picks during navigation and agent-browser receives a typed action, not prose',async()=>{
  const {result,actions,decisions}=await segment();
  assert.deepEqual(actions,[['click','@e1']]);assert.equal(decisions,1);
  assert.equal(result.status,'CHECKPOINT');assert.equal(result.metrics.jevSelectedActions,1);
  assert.equal(result.metrics.assessmentCalls,0);assert.equal(result.approvesQa,false);
  assert.equal(result.newBugsDiscovered,null);assert.equal(result.avoidedIncorrectApproval,null);
});
test('one eligible action avoids a redundant paid model call',async()=>{
  const p=plan();p.steps[0].options.pop();const r=await segment(p);
  assert.equal(r.decisions,0);assert.equal(r.result.metrics.directActions,1);
});
test('synthetic fill values remain local and command compilation cannot become shell',()=>{
  const step={options:[{kind:'fill',role:'textbox',name:'Search',value:'synthetic book',effect:'synthetic-input'}]};
  const c=candidatesFor({...step,at:origin+'/'},{...before(),refs:{'@e4':{role:'textbox',name:'Search'}}})[0];
  assert.equal(JSON.stringify(c).includes('synthetic book'),false);
  assert.deepEqual(commandFor(step,c),['fill','@e4','synthetic book']);
});
for(const status of ['ESCALATE','CHECKPOINT','ADVISORY'])test(`${status} from Jev never causes browser input`,async()=>{
  const r=await segment(plan(),{decision:{status,reason:'review'}});assert.equal(r.actions.length,0);assert.equal(r.result.approvesQa,false);
});
test('unknown selection is rejected',async()=>{const r=await segment(plan(),{decision:{status:'PROPOSED',selectedCandidate:'arbitrary'}});assert.equal(r.result.status,'BLOCKED');assert.equal(r.actions.length,0);});
test('page changing during inference never causes stale action or retry',async()=>{
  const r=await segment(plan(),{observations:[before(),after()]});assert.equal(r.actions.length,0);assert.equal(r.decisions,1);assert.equal(r.result.reason,'NAV_STALE_BEFORE_ACTION');
});
test('outdated initial visual review is rejected before model or input',async()=>{
  const p=plan();p.review.observationHash=hash('old');const r=await segment(p);assert.equal(r.decisions,0);assert.equal(r.actions.length,0);
});
test('uncertain mutation outcome is recorded once and is never replayed',async()=>{
  const r=await segment(plan(),{failAction:true});assert.equal(r.actions.length,1);assert.equal(r.result.status,'BLOCKED');
  assert.equal(r.events.filter(e=>e.event==='action-intent').length,1);assert.equal(r.events.filter(e=>e.event==='action-completed').length,0);
});
test('failed postcondition ends the segment without trying an alternative',async()=>{
  const p=plan();p.steps[0].expectedAfter={textIncludes:['missing expected text']};const r=await segment(p);
  assert.equal(r.result.status,'FAILED');assert.equal(r.actions.length,1);assert.equal(r.decisions,1);
});
test('no progress ends the segment rather than re-clicking',async()=>{
  const r=await segment(plan(),{observations:[before(),before(),before()]});assert.equal(r.result.reason,'NAV_NO_PROGRESS');assert.equal(r.actions.length,1);
});
test('browser child does not inherit provider keys, Chrome attach flags or plugins',()=>{
  const e=browserEnvironment({PATH:'bin',HOME:'home',AI_GATEWAY_API_KEY:'secret',AGENT_BROWSER_CDP:'9222',AGENT_BROWSER_PLUGINS:'evil',DATABASE_URL:'secret'});
  assert.deepEqual(e,{PATH:'bin',HOME:'home'});
});
test('browser client emits only JSON CLI commands and rejects malformed responses',async()=>{
  const calls=[];
  const b=new NavigationBrowser({command:'agent-browser',configPath:'approved.json',session:'qa-isolated',cwd:tmpdir(),origins:[origin],run:async(c,a)=>{
    calls.push({c,a});return JSON.stringify({success:true,data:{visible:true,enabled:true}});
  }});
  await b.act(['click','@e1']);assert.equal(calls.length,3);
  assert.deepEqual(calls[2].a,['--config','approved.json','--session','qa-isolated','--json','click','@e1']);
  await assert.rejects(()=>b.act(['eval','code']),/NOT_ALLOWED/);
  b.run=async()=>JSON.stringify({success:false,error:'private data'});await assert.rejects(()=>b.call(['snapshot']),/NAV_BROWSER_REJECTED/);
});

async function project(fn){const root=await mkdtemp(join(tmpdir(),'browser-qa-navigation-'));try{
  await writeFile(join(root,'qa.config.json'),JSON.stringify(config));
  const run=await createRun(root,'QA-ONE',{revision:'test-revision',sourceDigest:hash('source'),buildId:'test-build'});
  const meta={runId:'QA-ONE',caseId:'FILTER-01-desktop-flow',contractSha256:run.contractSha256,approvedBySupervisor:true,dataClass:'synthetic'};
  await fn(root,meta,run);
}finally{await rm(root,{recursive:true,force:true});}}

test('frozen configuration is checked before browser or Gateway work',()=>project(async(root,meta)=>{
  await loadNavigationRun(root,meta);const changed=structuredClone(config);changed.jev.maxCalls++;
  await writeFile(join(root,'qa.config.json'),JSON.stringify(changed));
  await assert.rejects(()=>loadNavigationRun(root,meta),/FROZEN_CONFIG_CHANGED/);
}));
test('an altered contract is rejected against the approved digest',()=>project(async(root,meta,run)=>{
  const file=join(run.runDir,'contract.json');await writeFile(file,(await readFile(file,'utf8'))+' ');
  await assert.rejects(()=>loadNavigationRun(root,meta),/CONTRACT_CHANGED/);
}));
test('navigation and assessment share the same persisted call budget',()=>project(async(root,meta,run)=>{
  const ctx=await loadNavigationRun(root,meta);
  const ledger=Array.from({length:config.jev.maxCalls},(_,i)=>JSON.stringify({runId:meta.runId,configSha256:ctx.configSha256,event:'attempt',attemptId:i+1})).join('\n')+'\n';
  await writeFile(join(run.runDir,'jev.jsonl'),ledger);
  let calls=0;
  await assert.rejects(()=>evaluateForNavigation({runId:meta.runId},ctx,{evaluate:async()=>{calls++;}}),/CALL_BUDGET_EXHAUSTED/);
  assert.equal(calls,0);
}));
test('ledger mismatch blocks calls',()=>project(async(root,meta,run)=>{
  const ctx=await loadNavigationRun(root,meta);await writeFile(join(run.runDir,'jev.jsonl'),JSON.stringify({runId:meta.runId,configSha256:hash('old'),event:'attempt'})+'\n');
  await assert.rejects(()=>evaluateForNavigation({runId:meta.runId},ctx),/LEDGER_CONTEXT/);
}));

// Explicit injected browser double. This exercises orchestration/files only, not live visual QA.
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
function fakeBrowser({fail=false}={}) {
  let changed=false;let mutations=0;
  return {get mutations(){return mutations;},session:'fake-session',calls:0,checkVersion:async()=> '0.0.0-test',
    call:async()=>{ },observe:async()=>changed?after():before(),
    screenshot:async file=>writeFile(file,png),
    act:async()=>{mutations++;changed=true;if(fail)throw new QaError('NAV_BROWSER_TIMEOUT_OUTCOME_UNKNOWN');}};
}
function reviewedPlan(meta,cp){const p=plan();Object.assign(p,meta);p.steps[0].options.pop();p.review={checkpointId:cp.id,observationHash:cp.observationHash,screenshotSha256:cp.screenshotSha256,reviewedBy:'human-test-double',accepted:true};return p;}
test('open -> reviewed segment -> checkpoint persists evidence without approving QA',()=>project(async(root,meta,run)=>{
  const browser=fakeBrowser(),deps={createBrowser:()=>browser};
  const opened=await navigate('open',meta,root,deps);
  const result=await navigate('run',reviewedPlan(meta,opened.checkpoint),root,deps);
  assert.equal(result.status,'CHECKPOINT');assert.equal(result.approvesQa,false);assert.equal(browser.mutations,1);
  assert.equal(result.metrics.jevDecisions,0);assert.ok(result.checkpoint.screenshotSha256);
  const report=JSON.parse(await readFile(join(run.runDir,'result.json'),'utf8'));
  assert.ok(report.cases.every(c=>c.status==='not_executed'));
  await assert.rejects(()=>navigate('run',reviewedPlan(meta,opened.checkpoint),root,deps));
  assert.equal(browser.mutations,1);
}));
test('blocked case cannot continue by submitting a different segment ID',()=>project(async(root,meta)=>{
  const browser=fakeBrowser({fail:true}),deps={createBrowser:()=>browser};
  const opened=await navigate('open',meta,root,deps);
  const result=await navigate('run',reviewedPlan(meta,opened.checkpoint),root,deps);
  assert.equal(result.status,'BLOCKED');assert.equal(browser.mutations,1);
  const retry=reviewedPlan(meta,result.checkpoint);retry.id='segment-2';
  await assert.rejects(()=>navigate('run',retry,root,deps),/CASE_ALREADY_STOPPED/);
  assert.equal(browser.mutations,1);
}));
test('modified browser containment is refused',()=>project(async(root,meta)=>{
  const deps={createBrowser:()=>fakeBrowser()};const opened=await navigate('open',meta,root,deps);
  const path=join(opened.artifactDirectory,'agent-browser.json');const modified=JSON.parse(await readFile(path,'utf8'));modified.profile='personal';await writeFile(path,JSON.stringify(modified));
  await assert.rejects(()=>navigate('capture',meta,root,deps),/POLICY_CHANGED/);
}));
test('captured screenshot must match its reviewed bytes',()=>project(async(root,meta)=>{
  const browser=fakeBrowser(),deps={createBrowser:()=>browser};const opened=await navigate('open',meta,root,deps);
  await writeFile(join(opened.artifactDirectory,opened.checkpoint.screenshot),Buffer.concat([png,Buffer.from('changed')]));
  await assert.rejects(()=>navigate('run',reviewedPlan(meta,opened.checkpoint),root,deps),/SCREENSHOT_CHANGED/);
  assert.equal(browser.mutations,0);
}));
test('an interrupted segment requires investigation before any new segment',()=>project(async(root,meta)=>{
  const browser=fakeBrowser(),deps={createBrowser:()=>browser};const opened=await navigate('open',meta,root,deps);
  await writeFile(join(opened.artifactDirectory,'segment-interrupted.json'),'{}');
  await assert.rejects(()=>navigate('run',reviewedPlan(meta,opened.checkpoint),root,deps),/INCOMPLETE_SEGMENT/);
  assert.equal(browser.mutations,0);
}));
test('bounded readiness waits do not repeat browser input',async()=>{
  const p=plan();p.steps[0].options.pop();p.steps[0].settleTimeoutMs=250;
  const r=await segment(p,{observations:[before(),before(),before(),after()]});
  assert.equal(r.actions.length,1);assert.equal(r.result.status,'CHECKPOINT');
});
