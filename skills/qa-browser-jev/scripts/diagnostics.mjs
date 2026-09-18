/** One offline diagnostic contract for the installed skill and the installer. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readConfig, SKILL_DIR } from './project.mjs';
import { loadGatewayCredential } from './credentials.mjs';

async function probeSdk(skillDir) {
  try {
    const require=createRequire(resolve(skillDir,'package.json'));
    return typeof (await import(pathToFileURL(require.resolve('ai')).href)).experimental_evaluate==='function';
  } catch {return false;}
}
function probeBrowser(command,env) {
  const names=['PATH','Path','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SYSTEMROOT','SystemRoot','WINDIR','COMSPEC','TEMP','TMP','TMPDIR'];
  const childEnv=Object.fromEntries(names.filter(n=>typeof env[n]==='string').map(n=>[n,env[n]]));
  return spawnSync(command,['--version'],{encoding:'utf8',timeout:5000,maxBuffer:65536,shell:false,windowsHide:true,env:childEnv});
}
export async function diagnose({project,skillDir=SKILL_DIR,env=process.env,sdkProbe=probeSdk,browserProbe=probeBrowser}={}) {
  const blockers=[];let loaded=null;
  try {if(project)loaded=await readConfig(project);}catch{blockers.push('CONFIG_INVALID');}
  let credential={present:false,source:'missing',file:null};
  try {credential=await loadGatewayCredential({env});}catch{credential={present:false,source:'unsafe-file',file:null};}
  let sdk=false;try{sdk=await sdkProbe(skillDir);}catch{}
  let browser;try{browser=await browserProbe(loaded?.config.browser.command??'agent-browser',env);}catch{}
  const ready=!!browser&&!browser.error&&browser.status===0;
  const version=ready?String(browser.stdout).match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0]??null:null;
  const nodeReady=Number(process.versions.node.split('.')[0])>=22;
  if(!nodeReady)blockers.push('NODE_VERSION');
  if(!ready||!version)blockers.push('AGENT_BROWSER_UNAVAILABLE');
  if(loaded?.config.jev.mode!=='off') {
    if(!sdk)blockers.push('AI_SDK_EVALUATE_UNAVAILABLE');
    if(!credential.present)blockers.push('GATEWAY_CREDENTIAL_UNAVAILABLE');
  }
  return {status:blockers.length?'BLOCKED':'READY',blockers,scope:'offline-prerequisites-only',skillDir:resolve(skillDir),
    node:{version:process.version,ready:nodeReady},config:loaded?'VALID':project?'INVALID':'NOT_CHECKED',
    sdkEvaluateAvailable:sdk,gatewayKeyPresent:credential.present,gatewayCredentialSource:credential.source,gatewayCredentialFile:credential.file,
    agentBrowser:{ready:ready&&!!version,version},vision:'MUST_BE_CONFIRMED_BY_HOST',independentReviewer:'MUST_BE_CONFIRMED_BY_HOST',
    liveGatewayTest:'NOT_EXECUTED',liveBrowserTest:'NOT_EXECUTED'};
}
