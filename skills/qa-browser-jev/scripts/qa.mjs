#!/usr/bin/env node
/** Ferramentas de preparação: não abre navegador, não testa o app, não faz rede. */
import { readFile } from 'node:fs/promises';
import { initProject, readConfig, createRun } from './project.mjs';
import { QaError, demand } from './jev-core.mjs';
const help=`QA Browser + Jev — preparação independente (Node 22+)
  node <SKILL_DIR>/scripts/qa.mjs init --project <pasta-app> --url <url> [--environment local|test|preview|staging] [--name nome]
  node <SKILL_DIR>/scripts/qa.mjs config --project <pasta-app>
  node <SKILL_DIR>/scripts/qa.mjs run-init --project <pasta-app> --run-id QA-001 --subject-file <identidade.json>

init cria somente qa.config.json, sem sobrescrever. Revise as jornadas.
run-init exige identidade real e jornadas revisadas; produz casos ainda NÃO EXECUTADOS.
Não instala pacotes, não altera o app ou AGENTS.md, não roda shell e não aprova QA.
`;
async function main(){
  const a=process.argv.slice(2);if(!a.length||a.includes('--help')){console.log(help);return;}
  const cmd=a.shift(), opts={};
  const allowed={init:['project','url','environment','name'],config:['project'],'run-init':['project','run-id','subject-file']};
  demand(Object.hasOwn(allowed,cmd),'UNKNOWN_COMMAND');
  while(a.length){const key=a.shift();demand(key.startsWith('--')&&allowed[cmd].includes(key.slice(2)),'UNKNOWN_ARGUMENT');
    const value=a.shift();demand(value&&!value.startsWith('--')&&!Object.hasOwn(opts,key.slice(2)),'ARGUMENT_VALUE');opts[key.slice(2)]=value;}
  demand(opts.project,'PROJECT_REQUIRED');let out;
  if(cmd==='init'){demand(opts.url,'URL_REQUIRED');out=await initProject(opts.project,{url:opts.url,environment:opts.environment??'local',name:opts.name??'web-app'});}
  if(cmd==='config'){const {config,configSha256}=await readConfig(opts.project);out={config,configSha256};}
  if(cmd==='run-init'){demand(opts['run-id']&&opts['subject-file'],'RUN_ARGUMENTS');
    const subject=JSON.parse((await readFile(opts['subject-file'],'utf8')).replace(/^\uFEFF/,''));out=await createRun(opts.project,opts['run-id'],subject);}
  console.log(JSON.stringify({status:'PREPARED_ONLY',approvesQa:false,...out},null,2));
}
main().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:e instanceof QaError?e.code:(e.code==='EEXIST'?'ALREADY_EXISTS':'INVALID_INPUT_OR_LOCAL_IO'),approvesQa:false}));process.exitCode=2;});
