#!/usr/bin/env node
/** Opt-in navigation bursts. No final QA verdict, live calls only when two or more targets are eligible. */
import { readFile, writeFile, appendFile, mkdir, rm, lstat, realpath, rename, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { demand, hash, callJev, QaError, guardSensitive } from './jev-core.mjs';
import { readConfig, privateDirectory, inside } from './project.mjs';
import { loadGatewayCredential } from './credentials.mjs';
import { validatePlan, executeSegment } from './navigation-core.mjs';
import { NavigationBrowser } from './navigation-browser.mjs';

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const CASE = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const fileHash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value,null,2)+'\n';

export async function readPrivate(root, name, limit = 256*1024) {
  const path = resolve(root,name);
  demand(inside(root,path), 'NAV_PATH_ESCAPE');
  const info = await lstat(path);
  demand(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limit &&
    inside(root,await realpath(path)), 'NAV_PRIVATE_FILE');
  return readFile(path);
}
async function replacePrivate(dir,name,value) {
  const target = resolve(dir,name);
  try { demand((await lstat(target)).isFile(),'NAV_PRIVATE_FILE'); } catch(e) { if(e.code !== 'ENOENT') throw e; }
  const tmp = `${target}.${randomUUID()}.tmp`;
  await writeFile(tmp,json(value),{flag:'wx',mode:0o600});
  try { await rename(tmp,target); } finally { await rm(tmp,{force:true}); }
}

/** Bind live work to the existing run, approved contract, and frozen configuration BEFORE any browser/API call. */
export async function loadNavigationRun(project, request) {
  demand(ID.test(request.runId ?? '') && CASE.test(request.caseId ?? '') && DIGEST.test(request.contractSha256 ?? ''), 'NAV_REQUEST_ID');
  const loaded = await readConfig(project);
  const dir = resolve(loaded.root,loaded.config.artifacts.directory,'runs',request.runId);
  const resolved = await realpath(dir);
  demand(resolved === dir && inside(loaded.root,resolved), 'NAV_RUN_PATH');
  const contractRaw = (await readPrivate(dir,'contract.json')).toString('utf8');
  demand(hash(contractRaw) === request.contractSha256, 'NAV_CONTRACT_CHANGED');
  const contract = JSON.parse(contractRaw);
  const configRaw = (await readPrivate(dir,'config.snapshot.json')).toString('utf8');
  demand(contract.runId === request.runId && hash(configRaw) === contract.configSha256 &&
    loaded.configSha256 === contract.configSha256, 'NAV_FROZEN_CONFIG_CHANGED');
  demand(contract.environment === loaded.config.target.environment &&
    contract.requireLiveJev === (loaded.config.jev.mode === 'required'), 'NAV_CONTRACT_POLICY');
  const caseSpec = contract.cases?.find(c=>c.id === request.caseId && c.dimension === 'flow');
  demand(caseSpec, 'NAV_FLOW_CASE_REQUIRED');
  const journey = loaded.config.journeys.find(j=>j.id === caseSpec.journeyId && j.actor === caseSpec.actor && j.viewports.includes(caseSpec.viewport));
  demand(journey,'NAV_CASE_CONFIG_MISMATCH');
  const viewport = loaded.config.browser.viewports.find(v=>v.id === caseSpec.viewport);
  demand(viewport,'NAV_VIEWPORT');
  return {...loaded,contract,contractSha256:request.contractSha256,runDir:dir,caseSpec,viewport};
}

export async function withLock(dir, name, callback) {
  const lock = resolve(dir,name);
  try { await mkdir(lock,{mode:0o700}); } catch { throw new QaError('NAV_LOCKED'); }
  try { return await callback(); } finally { await rm(lock,{recursive:true,force:true}); }
}

export async function evaluateForNavigation(input, ctx, { evaluate, secretValues = [] } = {}) {
  // The legacy assessment helper uses this same lock and ledger: one budget for both purposes.
  return withLock(ctx.runDir,'jev.jsonl.lock',async()=> {
    let previous = '';
    try { previous = (await readPrivate(ctx.runDir,'jev.jsonl',10*1024*1024)).toString('utf8'); }
    catch(e) { if(e.code !== 'ENOENT') throw e; }
    const entries = previous.trim() ? previous.trim().split('\n').map(s=>JSON.parse(s)) : [];
    demand(entries.every(e=>e.runId === input.runId && e.configSha256 === ctx.configSha256), 'NAV_LEDGER_CONTEXT');
    const attemptId = entries.filter(e=>e.event === 'attempt').length+1;
    demand(attemptId <= ctx.config.jev.maxCalls,'CALL_BUDGET_EXHAUSTED');
    const log = e=>appendFile(resolve(ctx.runDir,'jev.jsonl'),JSON.stringify({runId:input.runId,
      configSha256:ctx.configSha256,contractSha256:ctx.contractSha256,purpose:'navigation',caseId:ctx.caseSpec.id,attemptId,...e})+'\n',{mode:0o600});
    await log({event:'attempt',at:new Date().toISOString()});
    try {
      const result = await callJev(input,{evaluate,secretValues,timeoutMs:ctx.config.jev.timeoutMs});
      await log({event:'result',...result});
      return result;
    } catch(e) {
      await log({event:'error',code:e instanceof QaError?e.code:'GATEWAY_REQUEST_FAILED'});
      throw e instanceof QaError?e:new QaError('GATEWAY_REQUEST_FAILED');
    }
  });
}

async function capture(ctx,client,dir) {
  const before = await client.observe();
  guardSensitive(before,[process.env.AI_GATEWAY_API_KEY]);
  const id = `cp-${randomUUID()}`;
  const screenshot = `${id}.png`;
  await client.screenshot(resolve(dir,screenshot));
  const after = await client.observe();
  demand(after.stateHash === before.stateHash, 'NAV_SCREENSHOT_STATE_CHANGED');
  const bytes = await readPrivate(dir,screenshot,50*1024*1024);
  // This is a capture sanity check, not a substitute for opening the actual image.
  demand(bytes.length > 32 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'NAV_SCREENSHOT_FORMAT');
  const checkpoint = {id,runId:ctx.contract.runId,caseId:ctx.caseSpec.id,contractSha256:ctx.contractSha256,
    configSha256:ctx.configSha256,observationHash:after.stateHash,screenshot,screenshotSha256:fileHash(bytes),
    snapshot:`${id}.snapshot.json`,createdAt:new Date().toISOString(),visuallyInspected:false};
  await writeFile(resolve(dir,checkpoint.snapshot),json(after),{flag:'wx',mode:0o600});
  await writeFile(resolve(dir,`${id}.json`),json(checkpoint),{flag:'wx',mode:0o600});
  await replacePrivate(dir,'latest-checkpoint.json',checkpoint);
  return checkpoint;
}

async function browserContext(ctx,dir,open) {
  if (open) {
    const session = `bqa-${randomUUID()}`;
    const policyPath = resolve(dir,'action-policy.json');
    // Local reviewed commands only. Deny eval, mutation shortcuts, imports, plugins and file transfer.
    const policy = {default:'allow',deny:['eval','download','upload','state','interact','plugin']};
    const config = {session,json:true,contentBoundaries:true,maxOutput:50000,noAutoDialog:true,
      allowedDomains:[...new Set(ctx.config.target.allowedOrigins.map(o=>new URL(o).hostname))],
      actionPolicy:policyPath,plugins:[]};
    await writeFile(resolve(dir,'session.json'),json({session,contractSha256:ctx.contractSha256,launchSha256:hash(config),policySha256:hash(policy)}),{flag:'wx',mode:0o600});
    await writeFile(policyPath,json(policy),{flag:'wx',mode:0o600});
    await writeFile(resolve(dir,'agent-browser.json'),json(config),{flag:'wx',mode:0o600});
  }
  const state = JSON.parse((await readPrivate(dir,'session.json')).toString('utf8'));
  demand(/^bqa-[a-f0-9-]{36}$/.test(state.session) && state.contractSha256 === ctx.contractSha256,'NAV_SESSION');
  // Refuse local changes to launch containment between chunks.
  const launch = JSON.parse((await readPrivate(dir,'agent-browser.json')).toString('utf8'));
  const policy = JSON.parse((await readPrivate(dir,'action-policy.json')).toString('utf8'));
  demand(hash(launch) === state.launchSha256 && hash(policy) === state.policySha256, 'NAV_BROWSER_POLICY_CHANGED');
  demand(launch.session === state.session && JSON.stringify(launch.allowedDomains) ===
    JSON.stringify([...new Set(ctx.config.target.allowedOrigins.map(o=>new URL(o).hostname))]),'NAV_BROWSER_POLICY_CHANGED');
  const configPath = resolve(dir,'agent-browser.json');
  return new NavigationBrowser({command:ctx.config.browser.command,session:state.session,configPath,cwd:dir,
    origins:ctx.config.target.allowedOrigins});
}

export async function navigate(command,request,project, { createBrowser } = {}) {
  const commandStarted = performance.now();
  const ctx = await loadNavigationRun(project,request);
  demand(request.approvedBySupervisor === true && request.dataClass === 'synthetic','NAV_NOT_APPROVED');
  const dir = await privateDirectory(ctx.root,`${ctx.config.artifacts.directory}/runs/${request.runId}/navigation/${request.caseId}`);
  return withLock(dir,'session.lock',async()=> {
    const configuredClient = await browserContext(ctx,dir,command === 'open');
    const client = createBrowser ? createBrowser(configuredClient) : configuredClient;
    if (command === 'close') { await client.call(['close']); return {status:'CLOSED',approvesQa:false}; }
    if (command === 'open') {
      const version = await client.checkVersion();
      await client.call(['open',ctx.config.target.baseUrl]);
      await client.call(['set','viewport',String(ctx.viewport.width),String(ctx.viewport.height)]);
      const cp = await capture(ctx,client,dir);
      return {status:'CHECKPOINT',reason:'INITIAL_VISUAL_INSPECTION_REQUIRED',browserVersion:version,session:client.session,
        browserConfig:resolve(dir,'agent-browser.json'),checkpoint:cp,artifactDirectory:dir,approvesQa:false};
    }
    if (command === 'capture') return {status:'CHECKPOINT',checkpoint:await capture(ctx,client,dir),artifactDirectory:dir,approvesQa:false};
    demand(command === 'run','NAV_COMMAND');
    validatePlan(request,ctx);
    const latest = JSON.parse((await readPrivate(dir,'latest-checkpoint.json')).toString('utf8'));
    demand(latest.id === request.review.checkpointId && latest.observationHash === request.review.observationHash &&
      latest.screenshotSha256 === request.review.screenshotSha256,'NAV_CHECKPOINT_REVIEW_MISMATCH');
    demand(fileHash(await readPrivate(dir,latest.screenshot,50*1024*1024)) === latest.screenshotSha256,'NAV_SCREENSHOT_CHANGED');
    try { await lstat(resolve(dir,'stopped.json')); throw new QaError('NAV_CASE_ALREADY_STOPPED'); }
    catch(e) { if(e.code !== 'ENOENT') throw e; }
    const recorded = new Set(await readdir(dir));
    demand([...recorded].filter(n=>/^segment-.*\.json$/.test(n) && !n.endsWith('.result.json')).every(n=>recorded.has(n.replace(/\.json$/,'.result.json'))), 'NAV_INCOMPLETE_SEGMENT');
    // Consume the reviewed checkpoint once, before any model call or input. Fresh JSON cannot replay it.
    await writeFile(resolve(dir,`${latest.id}.consumed`),request.id,{flag:'wx',mode:0o600});
    await writeFile(resolve(dir,`segment-${request.id}.json`),json(request),{flag:'wx',mode:0o600});
    const events = resolve(dir,`segment-${request.id}.jsonl`);
    const emit = e=>appendFile(events,JSON.stringify({at:new Date().toISOString(),runId:request.runId,caseId:request.caseId,
      segmentId:request.id,contractSha256:ctx.contractSha256,...e})+'\n',{mode:0o600});
    await emit({event:'segment-start',planSha256:hash(request),initialCheckpoint:latest.id});
    const result = await executeSegment(request,{config:ctx.config,observe:()=>client.observe(),act:a=>client.act(a),emit,
      checkpoint:async(observation,stepId)=>{const cp=await capture(ctx,client,dir);demand(cp.observationHash === observation.stateHash,'NAV_CHECKPOINT_STATE_CHANGED');await emit({event:'checkpoint',stepId,checkpointId:cp.id});},
      decide:async input=>{
        let credential;
        try { credential = await loadGatewayCredential(); } catch { throw new QaError('GATEWAY_CREDENTIAL_FILE_UNSAFE'); }
        demand(credential.present,'MISSING_AI_GATEWAY_API_KEY');
        guardSensitive(request,[process.env.AI_GATEWAY_API_KEY]);
        let evaluate;
        try { ({experimental_evaluate:evaluate}=await import('ai')); } catch { throw new QaError('AI_SDK_NOT_INSTALLED'); }
        return evaluateForNavigation(input,ctx,{evaluate,secretValues:[process.env.AI_GATEWAY_API_KEY]});
      }});
    // Preserve an image even after a failure when the browser is still observable. Never retry the action.
    try { result.checkpoint = await capture(ctx,client,dir); }
    catch { result.captureBlocked=true; if (result.status === 'CHECKPOINT') { result.status='BLOCKED'; result.reason='NAV_CHECKPOINT_CAPTURE_FAILED'; } }
    result.metrics.browserCommands = client.calls;
    result.metrics.commandMs = Math.round(performance.now()-commandStarted);
    if (result.status !== 'CHECKPOINT') await replacePrivate(dir,'stopped.json',result);
    await writeFile(resolve(dir,`segment-${request.id}.result.json`),json(result),{flag:'wx',mode:0o600});
    await emit({event:'segment-end',status:result.status,reason:result.reason,metrics:result.metrics});
    return {...result,artifactDirectory:dir};
  });
}

async function main() {
  const a = process.argv.slice(2);
  if (a.includes('--help')) { console.log('node scripts/navigation.mjs <open|capture|run|close> REQUEST.json --project APP\nRead references/navigation.md first. Explicit live browser actions; API only for ambiguous eligible targets.');return; }
  demand(a.length === 4 && ['open','capture','run','close'].includes(a[0]) && a[2] === '--project','NAV_ARGUMENTS');
  const raw = await readFile(a[1],'utf8'); demand(Buffer.byteLength(raw)<=48000,'NAV_INPUT_TOO_LARGE');
  const output = await navigate(a[0],JSON.parse(raw),a[3]);
  console.log(json(output));
  // A checkpoint is not a QA pass. Exit 0 means only that this command handed off normally.
  process.exitCode = output.status === 'FAILED' ? 1 : ['BLOCKED','ESCALATE'].includes(output.status) ? 2 : 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e=> {console.error(JSON.stringify({status:'BLOCKED',code:e instanceof QaError?e.code:'NAV_LOCAL_OR_ARGUMENT_ERROR',approvesQa:false}));process.exitCode=2;});
}
