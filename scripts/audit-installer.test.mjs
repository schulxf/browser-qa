import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { runInstall, runDoctor, parseCredentialInput } from '../bin/browser-qa.mjs';
import { defaultCredentialsFile, loadGatewayCredential } from '../skills/qa-browser-jev/scripts/credentials.mjs';
import { diagnose } from '../skills/qa-browser-jev/scripts/diagnostics.mjs';
const bin=fileURLToPath(new URL('../bin/browser-qa.mjs',import.meta.url));
const credentialsUrl=new URL('../skills/qa-browser-jev/scripts/credentials.mjs',import.meta.url).href;
async function temp(fn){const dir=await mkdtemp(join(tmpdir(),'bqa-installer-'));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
const missing=()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});};

for(const option of ['directory','file','both'])test(`F06 configure -> new process loads ${option} override`,()=>temp(async dir=>{
  const env={...process.env};delete env.AI_GATEWAY_API_KEY;delete env.BROWSER_QA_ENV_FILE;delete env.BROWSER_QA_CONFIG_DIR;
  if(option!=='file')env.BROWSER_QA_CONFIG_DIR=join(dir,'settings');
  if(option!=='directory')env.BROWSER_QA_ENV_FILE=join(dir,'alternate','custom-name.env');
  const expected=defaultCredentialsFile(env);const key='not-a-real-key-round-trip';
  const p=spawnSync(process.execPath,[bin,'configure','--gateway-key-stdin'],{encoding:'utf8',env,input:key});
  assert.equal(p.status,0,p.stderr);assert.ok(!`${p.stdout}${p.stderr}`.includes(key));
  assert.equal(await readFile(expected,'utf8'),`AI_GATEWAY_API_KEY=${key}\n`);
  if(process.platform!=='win32')assert.equal((await stat(expected)).mode&0o777,0o600);
  const source=`import {loadGatewayCredential} from ${JSON.stringify(credentialsUrl)}; console.log(JSON.stringify(await loadGatewayCredential()));`;
  const next=spawnSync(process.execPath,['--input-type=module','-e',source],{env,encoding:'utf8'});
  assert.equal(next.status,0,next.stderr);const result=JSON.parse(next.stdout);assert.equal(result.present,true);assert.equal(result.file,expected);assert.ok(!next.stdout.includes(key));
}));
test('F06 nonpersisted --config-dir prints an explicit future-process instruction',()=>temp(async dir=>{
  const env={...process.env};delete env.AI_GATEWAY_API_KEY;
  const p=spawnSync(process.execPath,[bin,'configure','--config-dir',dir,'--gateway-key-stdin'],{encoding:'utf8',env,input:'synthetic-key'});
  assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/BROWSER_QA_ENV_FILE/);assert.match(p.stdout,/not persisted/);
  const expected=join(dir,'credentials.env');assert.equal(await readFile(expected,'utf8'),'AI_GATEWAY_API_KEY=synthetic-key\n');
}));
test('F06 explicit directory takes precedence; env file takes precedence over env directory',()=>{
  const env={BROWSER_QA_ENV_FILE:resolve('custom-file.env'),BROWSER_QA_CONFIG_DIR:resolve('custom-dir')};
  assert.equal(defaultCredentialsFile(env),env.BROWSER_QA_ENV_FILE);
  assert.equal(defaultCredentialsFile(env,process.platform,{directory:resolve('explicit')}),join(resolve('explicit'),'credentials.env'));
});
test('F06 environment credential takes precedence without reading a file',async()=>{
  const env={AI_GATEWAY_API_KEY:'synthetic-value'};const c=await loadGatewayCredential({env,read:missing,inspect:missing});assert.equal(c.source,'environment');assert.ok(!JSON.stringify(c).includes(env.AI_GATEWAY_API_KEY));
});
test('F05 invalid credential JSON does not echo pasted input',()=>assert.throws(()=>parseCredentialInput('{"AI_GATEWAY_API_KEY":"SENTINEL'),{message:'Invalid credential input.'}));
test('F05 rejected secret argument is not printed',()=>{
  const key='synthetic-CLI-sentinel';const p=spawnSync(process.execPath,[bin,`--gateway-key=${key}`],{encoding:'utf8'});
  assert.notEqual(p.status,0);assert.ok(!`${p.stdout}${p.stderr}`.includes(key));
});
function installIo(list,hasPackage=true){const calls=[],messages=[];return {calls,messages,fs:{stat:hasPackage?async()=>({isFile:()=>true}):async()=>missing()},
  log:v=>messages.push(v),isTty:false,run:async(command,args)=>{calls.push(args);return {stdout:args.includes('list')?JSON.stringify(list):''};}};}
test('F07 empty installed-skill discovery fails instead of reporting success',async()=>{
  const io=installIo([]);await assert.rejects(()=>runInstall({scope:'project',agents:['codex'],skipConfig:true},io),/unverified/);assert.equal(io.calls.length,2);
});
test('F07 discovered copy without package is incomplete, including --skip-deps',async()=>{
  const io=installIo([{name:'qa-browser-jev',path:resolve('missing-skill')}],false);
  await assert.rejects(()=>runInstall({scope:'project',agents:['codex'],skipDeps:true,skipConfig:true},io),/incomplete/);
});
test('F07 skipped dependency installation is distinct from installed runtime',async()=>{
  const io=installIo([{name:'qa-browser-jev',path:resolve('test-skill')}]);
  const r=await runInstall({scope:'project',agents:['codex'],skipDeps:true,skipConfig:true},io);
  assert.equal(r.status,'INSTALLED_DEPENDENCIES_SKIPPED');assert.equal(io.calls.length,2);
});
test('F07 doctor checks discovered installed copies rather than the npx cache',async()=>{
  const previous=process.exitCode;const paths=[],logs=[];
  try {
    const io={log:v=>logs.push(v),run:async()=>({stdout:JSON.stringify([{name:'qa-browser-jev',path:resolve('installed-copy')}])}),
      diagnose:async({skillDir})=>{paths.push(skillDir);return {status:'BLOCKED',blockers:['AI_SDK_EVALUATE_UNAVAILABLE']};}};
    const r=await runDoctor(io,{scope:'project'});assert.equal(r.status,'BLOCKED');assert.equal(process.exitCode,2);assert.deepEqual(paths,[resolve('installed-copy')]);
  }finally{process.exitCode=previous;}
});
test('F07 doctor cannot return READY for missing installation',async()=>{
  const previous=process.exitCode;try{
    const r=await runDoctor({log:()=>{},run:async()=>({stdout:'[]'}),diagnose:async()=>assert.fail('should not inspect a fabricated copy')},{scope:'project'});
    assert.equal(r.status,'BLOCKED');assert.ok(r.blockers.includes('NO_INSTALLED_SKILL_FOUND'));
  }finally{process.exitCode=previous;}
});
test('F07 shared diagnostics report missing prerequisites with no success claim',async()=>{
  const c=await diagnose({env:{BROWSER_QA_ENV_FILE:resolve('absent-credential.env')},sdkProbe:async()=>false,browserProbe:async()=>({status:1,stdout:'untrusted output'})});
  assert.equal(c.status,'BLOCKED');assert.ok(c.blockers.includes('AI_SDK_EVALUATE_UNAVAILABLE'));assert.ok(c.blockers.includes('GATEWAY_CREDENTIAL_UNAVAILABLE'));
  assert.equal(c.liveGatewayTest,'NOT_EXECUTED');assert.ok(!JSON.stringify(c).includes('untrusted output'));
});
test('F07 READY means prerequisites, not live QA or visual validation',async()=>{
  const c=await diagnose({env:{AI_GATEWAY_API_KEY:'synthetic-value'},sdkProbe:async()=>true,browserProbe:async()=>({status:0,stdout:'agent-browser 1.0.0'})});
  assert.equal(c.status,'READY');assert.equal(c.scope,'offline-prerequisites-only');assert.equal(c.liveBrowserTest,'NOT_EXECUTED');assert.ok(!JSON.stringify(c).includes('synthetic-value'));
});
