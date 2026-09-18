#!/usr/bin/env node
/** Textual advice only. Explicit smoke is not product coverage. */
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildRequest, callJev, hash, QaError, demand } from './jev-core.mjs';
import { readConfig, privateDirectory } from './project.mjs';
import { loadGatewayCredential } from './credentials.mjs';
import { loadApprovedRun } from './run-contract.mjs';
import { evaluateInRun } from './jev-ledger.mjs';

export async function runEvaluation(input, {project,approvedContractSha256,dry=false,smoke=false,evaluate}={}) {
  const loaded=await readConfig(project);
  demand(loaded.config.jev.mode==='required','JEV_DISABLED_BY_PROJECT');
  demand(input.environment===loaded.config.target.environment,'PROJECT_ENVIRONMENT_MISMATCH');
  demand(Array.isArray(input.approvedOrigins) && input.approvedOrigins.every(o=>loaded.config.target.allowedOrigins.includes(o)), 'PROJECT_ORIGIN_MISMATCH');
  const ctx=smoke?null:await loadApprovedRun(project,input.runId,approvedContractSha256,input.scenarioId);
  // Dry runs load the same known secrets; no API or browser call is made.
  let credential;
  try {credential=await loadGatewayCredential();}catch {throw new QaError('GATEWAY_CREDENTIAL_FILE_UNSAFE');}
  const request=buildRequest(input,{secretValues:[process.env.AI_GATEWAY_API_KEY]});
  if (dry) return {status:'DRY_RUN_ONLY',purpose:smoke?'connectivity':'product',approvesQa:false,
    requestHash:hash(request),model:request.model,questions:Object.keys(request.questions),payloadPrinted:false};
  demand(credential.present,'MISSING_AI_GATEWAY_API_KEY');
  if (!evaluate) {
    try {({experimental_evaluate:evaluate}=await import('ai'));}catch {throw new QaError('AI_SDK_NOT_INSTALLED');}
  }
  demand(typeof evaluate==='function','AI_SDK_EVALUATE_UNAVAILABLE');
  if (!smoke) return evaluateInRun(input,ctx,{evaluate,secretValues:[process.env.AI_GATEWAY_API_KEY]});
  // A separate directory, a single attempt, no product contract or product ledger.
  const parent=await privateDirectory(loaded.root,`${loaded.config.artifacts.directory}/connectivity`);
  const dir=resolve(parent,input.runId);
  await mkdir(dir,{mode:0o700});
  await writeFile(resolve(dir,'attempt.json'),JSON.stringify({purpose:'connectivity',requestHash:hash(request),at:new Date().toISOString()}),{flag:'wx',mode:0o600});
  const result=await callJev(input,{evaluate,timeoutMs:loaded.config.jev.timeoutMs,secretValues:[process.env.AI_GATEWAY_API_KEY]});
  const output={...result,purpose:'connectivity',countsAsProductCoverage:false};
  await writeFile(resolve(dir,'result.json'),JSON.stringify(output),{flag:'wx',mode:0o600});return output;
}

export async function main(args=process.argv.slice(2)) {
  if (!args.length || args.includes('--help')) {
    console.log('node scripts/jev.mjs REQUEST.json --project APP --approved-contract-sha256 HOST_APPROVED_SHA [--dry-run]\nExplicit connectivity: ... --smoke [--dry-run]. Diagnostics never print the payload.');return;
  }
  const file=args.shift();let project,approvedContractSha256,dry=false,smoke=false;
  while (args.length) {
    const arg=args.shift();
    if (arg==='--project') {demand(!project,'DUPLICATE_ARGUMENT');project=args.shift();}
    else if (arg==='--approved-contract-sha256') {demand(!approvedContractSha256,'DUPLICATE_ARGUMENT');approvedContractSha256=args.shift();}
    else if (arg==='--dry-run') {demand(!dry,'DUPLICATE_ARGUMENT');dry=true;}
    else if (arg==='--smoke') {demand(!smoke,'DUPLICATE_ARGUMENT');smoke=true;}
    else throw new QaError('UNKNOWN_ARGUMENT');
  }
  demand(project && !(smoke && approvedContractSha256),'PROJECT_OR_MODE_ARGUMENT');
  const {config}=await readConfig(project);demand(config.jev.mode==='required','JEV_DISABLED_BY_PROJECT');
  demand((await stat(file)).size<=48000,'INPUT_TOO_LARGE');
  const input=JSON.parse((await readFile(file,'utf8')).replace(/^\uFEFF/,''));
  console.log(JSON.stringify(await runEvaluation(input,{project,approvedContractSha256,dry,smoke}),null,2));
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:e instanceof QaError?e.code:'INVALID_INPUT_OR_LOCAL_IO',approvesQa:false}));process.exitCode=2;});
}
