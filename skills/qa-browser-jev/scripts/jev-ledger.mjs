/** Product runs use one ledger/budget. Connectivity checks live elsewhere. */
import { mkdir, rm, appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demand, QaError, callJev, MODEL } from './jev-core.mjs';
import { readRunFile, record, timestamp } from './run-contract.mjs';

export function inspectLedger(raw, ctx, { allowPending = false } = {}) {
  demand(typeof raw === 'string' && Buffer.byteLength(raw)<=10*1024*1024, 'LEDGER_TOO_LARGE');
  const entries=raw.trim()?raw.trim().split('\n').map(line=>JSON.parse(line)):[];
  demand(entries.length<=300, 'LEDGER_TOO_LARGE');
  let attempts=0,results=0,errors=0,pending=null;
  for (const e of entries) {
    demand(record(e) && e.runId===ctx.contract.runId && e.configSha256===ctx.configSha256 &&
      e.contractSha256===ctx.contractSha256 && ctx.contract.cases.some(c=>c.id===e.caseId) &&
      ['navigation','decision','assessment'].includes(e.purpose), 'LEDGER_CONTEXT_MISMATCH');
    if (e.event==='attempt') {
      demand(pending===null && e.attemptId===attempts+1 && timestamp(e.at), 'LEDGER_ATTEMPT_SEQUENCE');
      pending=e;attempts++;
    } else {
      demand(pending && e.attemptId===pending.attemptId && e.caseId===pending.caseId && e.purpose===pending.purpose, 'LEDGER_RESULT_SEQUENCE');
      if (e.event==='result') {
        demand(e.requestedModel===MODEL && typeof e.returnedModel==='string' &&
          /^(?:typesafe-ai\/)?jev(?:-\d+\.\d+\.\d+)?$/.test(e.returnedModel) &&
          e.approvesQa===false && e.executedBrowserAction===false &&
          ['ADVISORY','PROPOSED','CHECKPOINT','ESCALATE'].includes(e.status) &&
          e.mode===(e.purpose==='assessment'?'assess':'decide'), 'LEDGER_RESULT_INVALID');
        results++;
      } else {
        demand(e.event==='error' && typeof e.code==='string', 'LEDGER_EVENT_INVALID');errors++;
      }
      pending=null;
    }
  }
  demand(attempts<=ctx.config.jev.maxCalls, 'LEDGER_BUDGET_EXCEEDED');
  demand(allowPending || pending===null, 'LEDGER_INCOMPLETE_ATTEMPT');
  return {attempts,results,errors,pending:pending!==null};
}

export async function evaluateInRun(input, ctx, { evaluate, secretValues = [], purpose = input.mode==='assess'?'assessment':'decision' } = {}) {
  demand(ctx.caseSpec && input.runId===ctx.contract.runId && input.environment===ctx.config.target.environment &&
    input.approvedOrigins.every(o=>ctx.config.target.allowedOrigins.includes(o)), 'LEDGER_CONTEXT_MISMATCH');
  const lock=resolve(ctx.runDir,'jev.jsonl.lock');
  try {await mkdir(lock,{mode:0o700});}catch {throw new QaError('LEDGER_LOCKED');}
  try {
    let raw='';
    try {raw=(await readRunFile(ctx.runDir,'jev.jsonl',10*1024*1024)).toString('utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    const counts=inspectLedger(raw,ctx);
    demand(counts.attempts<ctx.config.jev.maxCalls,'CALL_BUDGET_EXHAUSTED');
    const base={runId:input.runId,configSha256:ctx.configSha256,contractSha256:ctx.contractSha256,
      caseId:ctx.caseSpec.id,purpose,attemptId:counts.attempts+1};
    const log=e=>appendFile(resolve(ctx.runDir,'jev.jsonl'),JSON.stringify({...base,...e})+'\n',{mode:0o600});
    await log({event:'attempt',at:new Date().toISOString()});
    try {
      const result=await callJev(input,{evaluate,secretValues,timeoutMs:ctx.config.jev.timeoutMs});
      await log({event:'result',...result});return result;
    } catch(e) {
      const code=e instanceof QaError?e.code:'GATEWAY_REQUEST_FAILED';
      await log({event:'error',code});throw new QaError(code);
    }
  } finally {await rm(lock,{recursive:true,force:true});}
}
