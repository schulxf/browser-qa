#!/usr/bin/env node
/** Sem rede, sem ler o valor da chave, sem abrir browser. */
import { spawnSync } from 'node:child_process';
import { readConfig } from './project.mjs';
import { loadGatewayCredential } from './credentials.mjs';
const args=process.argv.slice(2);
if(args.includes('--help')){console.log('node <SKILL_DIR>/scripts/doctor.mjs [--project <pasta-app>]');process.exit(0);}
try{
  if(args.length && !(args.length===2&&args[0]==='--project'))throw new Error('ARGUMENTS');
  const loaded=args.length?await readConfig(args[1]):null;
  const command=loaded?.config.browser.command??'agent-browser';
  let credential={present:false,source:'missing',file:null};
  try{credential=await loadGatewayCredential();}catch{credential={present:false,source:'unsafe-file',file:null};}
  let sdk=false;try{sdk=typeof (await import('ai')).experimental_evaluate==='function';}catch{}
  const browser=spawnSync(command,['--version'],{encoding:'utf8',timeout:5000,shell:false,windowsHide:true});
  const ready=!browser.error&&browser.status===0;
  // Não imprime stdout arbitrário de um executável configurado: extrai somente versão semântica.
  const version=ready?browser.stdout.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0]??'available-version-unparsed':null;
  const required=loaded?.config.jev.mode!=='off';
  const checks={node:{version:process.version,ready:Number(process.versions.node.split('.')[0])>=22},
    config:loaded?'VALID':'NOT_CHECKED',sdkEvaluateAvailable:sdk,
    gatewayKeyPresent:credential.present,gatewayCredentialSource:credential.source,gatewayCredentialFile:credential.file,
    agentBrowser:{ready,version},vision:'MUST_BE_CONFIRMED_BY_HOST',independentReviewer:'MUST_BE_CONFIRMED_BY_HOST',
    liveGatewayTest:'NOT_EXECUTED',liveBrowserTest:'NOT_EXECUTED'};
  console.log(JSON.stringify(checks,null,2));
  if(!checks.node.ready||!ready||(required&&(!sdk||!checks.gatewayKeyPresent)))process.exitCode=2;
}catch{console.error(JSON.stringify({status:'BLOCKED',code:'CONFIG_OR_ARGUMENT_ERROR'}));process.exitCode=2;}
