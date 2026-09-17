#!/usr/bin/env node
/** Ponte consultiva. Configuração por projeto; credencial apenas no ambiente. */
import { readFile, appendFile, stat, mkdir, rm, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildRequest, callJev, hash, QaError, demand } from './jev-core.mjs';
import { readConfig, privateDirectory } from './project.mjs';
import { loadGatewayCredential } from './credentials.mjs';
const HELP=`Uso:
  node <SKILL_DIR>/scripts/jev.mjs pedido.json --project <pasta-app> --dry-run
  node <SKILL_DIR>/scripts/jev.mjs pedido.json --project <pasta-app>

--dry-run apenas valida e mostra payload revisado, sem rede. Nunca conta como uso real.
Configuração: <pasta-app>/qa.config.json. Ledger exclusivo e automático por run:
  <artifacts.directory>/runs/<runId>/jev.jsonl
Chamada real exige AI_GATEWAY_API_KEY e ai@7.0.105; não executa ações do navegador.
Limites vêm da configuração. Não há retry automático. Erros usam exit 2.
`;
async function main(){
  const args=process.argv.slice(2);
  if(!args.length||args.includes('--help')){console.log(HELP);return;}
  const file=args.shift();let dry=false,project;
  while(args.length){const a=args.shift();
    if(a==='--dry-run'){demand(!dry,'DUPLICATE_ARGUMENT');dry=true;}
    else if(a==='--project'){demand(!project,'DUPLICATE_ARGUMENT');project=args.shift();demand(project&&!project.startsWith('--'),'PROJECT_ARGUMENT');}
    else throw new QaError('UNKNOWN_ARGUMENT');}
  demand(project,'PROJECT_REQUIRED');
  const {root,config,configSha256}=await readConfig(project);
  demand(config.jev.mode==='required','JEV_DISABLED_BY_PROJECT');
  demand((await stat(file)).size<=48000,'INPUT_TOO_LARGE');
  const input=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
  demand(input.environment===config.target.environment,'PROJECT_ENVIRONMENT_MISMATCH');
  demand(input.approvedOrigins.every(origin=>config.target.allowedOrigins.includes(origin)),'PROJECT_ORIGIN_MISMATCH');
  if(dry){const request=buildRequest(input,{secretValues:[process.env.AI_GATEWAY_API_KEY]});console.log(JSON.stringify({status:'DRY_RUN_ONLY',approvesQa:false,request},null,2));return;}
  let credential;
  try{credential=await loadGatewayCredential();}catch{throw new QaError('GATEWAY_CREDENTIAL_FILE_UNSAFE');}
  demand(credential.present,'MISSING_AI_GATEWAY_API_KEY');
  const request=buildRequest(input,{secretValues:[process.env.AI_GATEWAY_API_KEY]});
  let evaluate;
  try{({experimental_evaluate:evaluate}=await import('ai'));}catch{throw new QaError('AI_SDK_NOT_INSTALLED');}
  demand(typeof evaluate==='function','AI_SDK_EVALUATE_UNAVAILABLE');
  const dir=await privateDirectory(root,`${config.artifacts.directory}/runs/${input.runId}`);
  const ledger=resolve(dir,'jev.jsonl'),lock=ledger+'.lock';
  try{await mkdir(lock,{mode:0o700});}catch{throw new QaError('LEDGER_LOCKED');}
  try{
    let previous='';
    try{demand((await lstat(ledger)).isFile(),'LEDGER_NOT_REGULAR_FILE');
      demand((await stat(ledger)).size<=10*1024*1024,'LEDGER_TOO_LARGE');previous=await readFile(ledger,'utf8');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    const entries=previous.trim()?previous.trim().split('\n').map(line=>JSON.parse(line)):[];
    demand(entries.every(e=>e.runId===input.runId&&e.configSha256===configSha256),'LEDGER_CONTEXT_MISMATCH');
    const attempts=entries.filter(e=>e.event==='attempt').length;
    demand(attempts<config.jev.maxCalls,'CALL_BUDGET_EXHAUSTED');
    const log=e=>appendFile(ledger,JSON.stringify({runId:input.runId,configSha256,attemptId:attempts+1,...e})+'\n',{mode:0o600});
    await log({event:'attempt',at:new Date().toISOString(),requestHash:hash(request)});
    try{
      const result=await callJev(input,{evaluate,timeoutMs:config.jev.timeoutMs,secretValues:[process.env.AI_GATEWAY_API_KEY]});
      await log({event:'result',...result});console.log(JSON.stringify(result,null,2));
    }catch(e){const code=e instanceof QaError?e.code:'GATEWAY_REQUEST_FAILED';await log({event:'error',code});throw new QaError(code);}
  }finally{await rm(lock,{recursive:true,force:true});}
}
main().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:e instanceof QaError?e.code:'INVALID_INPUT_OR_LOCAL_IO',approvesQa:false}));process.exitCode=2;});
