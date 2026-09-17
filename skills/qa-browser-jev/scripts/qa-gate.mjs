#!/usr/bin/env node
/** Consistency and supported-result gate; never a signature or deployment authorizer. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { hash, MODEL } from './jev-core.mjs';
import { validateConfig } from './project.mjs';
import { assertContractConsistency, record as object, nonempty, timestamp, sameSubject, DIGEST, CASE_ID } from './run-contract.mjs';
import { validatePng, validateCapture } from './png-evidence.mjs';
import { inspectLedger } from './jev-ledger.mjs';
const STATUSES=new Set(['passed','failed','blocked','not_executed']);
const bytesHash=bytes=>createHash('sha256').update(bytes).digest('hex');
function checkResult(check) {
  if (!object(check)) return null;
  const {actual,expected}=check;
  switch(check.operator??'equals') {
    case 'equals': return isDeepStrictEqual(actual,expected);
    case 'not-equals': return !isDeepStrictEqual(actual,expected);
    case 'includes': return typeof actual==='string'&&typeof expected==='string'?actual.includes(expected):
      Array.isArray(actual)?actual.some(v=>isDeepStrictEqual(v,expected)):null;
    case 'gte': return Number.isFinite(actual)&&Number.isFinite(expected)?actual>=expected:null;
    case 'lte': return Number.isFinite(actual)&&Number.isFinite(expected)?actual<=expected:null;
    default: return null;
  }
}


export async function evaluateGate(contract, report, {contractHash,approvedContractHash,artifactRoot,expectedSubject}={}) {
  const blocked=[],failed=[];
  const b=(ok,code)=>{if(!ok)blocked.push(code);return !!ok;};
  const result=()=>({status:failed.length?'FAILED':blocked.length?'BLOCKED':'PASSED',
    failed:[...new Set(failed)],blocked:[...new Set(blocked)],approvesDeployment:false,
    integrityCheckOnly:true,validatesStructuredResults:true,authenticatesExecution:false});
  if(!b(object(contract)&&object(report),'SCHEMA'))return result();
  b(contract.schemaVersion===2&&report.schemaVersion===2,'SCHEMA_VERSION');
  b(CASE_ID.test(contract.runId??'')&&report.runId===contract.runId,'RUN_ID');
  b(DIGEST.test(contractHash??'')&&report.contractSha256===contractHash,'CONTRACT_HASH');
  b(DIGEST.test(approvedContractHash??'')&&approvedContractHash===contractHash,'APPROVED_CONTRACT_HASH');
  b(report.environment===contract.environment,'ENVIRONMENT');
  b(sameSubject(contract.subject,report.subject)&&sameSubject(contract.subject,expectedSubject),'SUBJECT_MISMATCH');
  b(report.configSha256===contract.configSha256,'CONFIG_HASH');
  b(report.simulated===false,'SIMULATED_REPORT');
  b(nonempty(report.executorId),'EXECUTOR');
  b(nonempty(report.reviewer?.id)&&report.reviewer.id!==report.executorId&&report.reviewer.id.toLowerCase()!=='jev'&&report.reviewer.independent===true&&
    report.reviewer.verdict==='accepted','INDEPENDENT_REVIEW');
  b(report.tools?.agentBrowser?.ready===true&&nonempty(report.tools?.agentBrowser?.version)&&
    DIGEST.test(report.tools?.agentBrowser?.skillSha256??''),'AGENT_BROWSER');
  if(!b(Array.isArray(contract.cases)&&contract.cases.length>0,'EMPTY_CONTRACT')||
    !b(Array.isArray(report.cases),'MISSING_CASES'))return result();
  if(!b(contract.cases.every(object)&&report.cases.every(object),'INVALID_CASE_OBJECT'))return result();
  b(new Set(report.cases.map(c=>c.id)).size===report.cases.length,'DUPLICATE_RESULT_CASE');
  b(report.cases.every(c=>contract.cases.some(r=>r.id===c.id)),'UNDECLARED_CASE');
  let root,config;
  try{root=await realpath(artifactRoot);}catch{blocked.push('ARTIFACT_ROOT');return result();}
  const contained=p=>{const rel=relative(root,p);return rel!=='..'&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel);};
  async function readArtifact(path,limit=50*1024*1024) {
    const normalized=typeof path==='string'?path.replaceAll('\\','/') : '';
    if(!nonempty(path)||isAbsolute(path)||/^[A-Za-z]:/.test(path)||normalized.startsWith('/')||normalized.split('/').includes('..'))throw new Error('PATH');
    const target=await realpath(resolve(root,path));if(!contained(target))throw new Error('ESCAPE');
    const meta=await stat(target);if(!meta.isFile()||meta.size<=0||meta.size>limit)throw new Error('SIZE');
    return readFile(target);
  }
  try{
    const raw=(await readArtifact('config.snapshot.json',48000)).toString('utf8');
    b(hash(raw)===contract.configSha256,'CONFIG_SNAPSHOT_HASH');
    config=validateConfig(JSON.parse(raw.replace(/^\uFEFF/,'')));
    assertContractConsistency(contract,config);
  }catch(e){blocked.push(e.code??'CONFIG_OR_CONTRACT_INVALID');}

  async function evidenceCheck(e,caseId) {
    if(!b(object(e)&&nonempty(e.path)&&DIGEST.test(e.sha256??'')&&nonempty(e.kind),`${caseId}:EVIDENCE_SCHEMA`))return null;
    try{
      const content=await readArtifact(e.path);
      if(!b(bytesHash(content)===e.sha256,`${caseId}:EVIDENCE_HASH`))return null;
      return content;
    }catch{blocked.push(`${caseId}:EVIDENCE_MISSING_OR_UNSAFE`);return null;}
  }
  const bind=(document,caseId)=>object(document)&&document.schemaVersion===1&&document.runId===contract.runId&&
    document.caseId===caseId&&sameSubject(document.subject,contract.subject);
  for(const c of contract.cases) {
    const r=report.cases.find(v=>v.id===c.id);
    if(!b(object(r),`${c.id}:NOT_EXECUTED`))continue;
    if(!b(STATUSES.has(r.status),`${c.id}:STATUS`))continue;
    if(r.status==='failed')failed.push(`${c.id}:FAILED`);
    else if(r.status!=='passed')blocked.push(`${c.id}:${r.status.toUpperCase()}`);
    b(nonempty(r.observed)&&nonempty(r.verifier),`${c.id}:OBSERVATION_OR_VERIFIER`);
    b(r.viewport===c.viewport&&r.actor===c.actor,`${c.id}:CONFIGURATION`);
    b(typeof r.pathViolation==='boolean',`${c.id}:PATH_VIOLATION_MISSING`);
    if(r.pathViolation===true)failed.push(`${c.id}:RECOVERED_PATH_NOT_PASS`);
    if(!b(Array.isArray(r.evidence),`${c.id}:EVIDENCE`))continue;
    if(Array.isArray(c.requiredEvidence))for(const kind of c.requiredEvidence)b(r.evidence.some(e=>object(e)&&e.kind===kind),`${c.id}:MISSING_${kind}`);
    if(['flow','data','performance','a11y'].includes(c.dimension))b(c.requiredEvidence?.includes('assertion'),`${c.id}:ASSERTION_CONTRACT`);
    let fullContextImage=false;
    for(const e of r.evidence) {
      const bytes=await evidenceCheck(e,c.id);if(!bytes)continue;
      if(e.kind==='screenshot') {
        try{
          const image=validatePng(bytes);
          if(config)validateCapture(e.capture,image,{contract,caseSpec:c,config});else throw new Error('CONFIG');
          fullContextImage ||= e.capture.mode!=='clip';
        }catch(err){blocked.push(`${c.id}:${err.code??'CAPTURE_INVALID'}`);}
      }
      if(e.kind==='assertion') {
        let a;
        try{a=JSON.parse(bytes.toString('utf8'));}catch{blocked.push(`${c.id}:ASSERTION_FORMAT_UNSUPPORTED`);continue;}
        // Negative supported fields always win, including in a malformed/custom envelope.
        if(a?.passed===false||a?.status==='failed'||(Number.isInteger(a?.exitCode)&&a.exitCode!==0)||
          (Array.isArray(a?.checks)&&a.checks.some(x=>x?.passed===false||checkResult(x)===false)))failed.push(`${c.id}:ASSERTION_FAILED`);
        const valid=bind(a,c.id)&&nonempty(a.verifierId)&&timestamp(a.observedAt)&&a.status==='passed'&&a.passed===true&&a.exitCode===0&&
          Array.isArray(a.checks)&&a.checks.length>0&&a.checks.length<=1000&&
          a.checks.every(x=>object(x)&&nonempty(x.id)&&Object.hasOwn(x,'expected')&&Object.hasOwn(x,'actual')&&x.passed===true&&checkResult(x)===true);
        b(valid,`${c.id}:ASSERTION_NOT_VERIFIED`);
      }
    }
    if(c.dimension==='visual') {
      b(c.requiredEvidence?.includes('screenshot')&&c.requiredEvidence?.includes('visual-review'),`${c.id}:VISUAL_CONTRACT`);
      b(fullContextImage,`${c.id}:FULL_CONTEXT_IMAGE_REQUIRED`);
      b(nonempty(r.visualInspectedBy)&&r.visualInspectedBy.toLowerCase()!=='jev'&&
        r.visualInspectedBy!==report.executorId&&r.visualInspectedBy===report.reviewer?.id,`${c.id}:VISUAL_NOT_INDEPENDENTLY_INSPECTED`);
    }
  }
  // Materialized independent review tied to case coverage and actual screenshot hashes.
  const receipt=report.reviewer?.evidence;
  b(receipt?.kind==='independent-review','REVIEW_EVIDENCE_KIND');
  const reviewBytes=await evidenceCheck(receipt,'REVIEW');
  if(reviewBytes)try{
    const review=JSON.parse(reviewBytes.toString('utf8'));
    b(review.schemaVersion===1&&review.runId===contract.runId&&review.contractSha256===contractHash&&
      review.configSha256===contract.configSha256&&sameSubject(review.subject,contract.subject)&&
      review.reviewerId===report.reviewer.id&&review.executorId===report.executorId&&review.independent===true&&
      review.verdict==='accepted'&&timestamp(review.reviewedAt),'REVIEW_RECEIPT');
    b(Array.isArray(review.caseIds)&&new Set(review.caseIds).size===review.caseIds.length&&
      review.caseIds.length===contract.cases.length&&contract.cases.every(c=>review.caseIds.includes(c.id)),'REVIEW_COVERAGE');
    b(Array.isArray(review.visualEvidence),'REVIEW_IMAGES');
    for(const c of contract.cases.filter(c=>c.dimension==='visual')) {
      for(const e of report.cases.find(r=>r.id===c.id)?.evidence??[])if(e?.kind==='screenshot')
        b(review.visualEvidence?.some(v=>v.caseId===c.id&&v.path===e.path&&v.sha256===e.sha256),'REVIEW_IMAGE_HASH');
    }
  }catch{blocked.push('REVIEW_INVALID');}

  if(config) {
    const ctx={contract,config,configSha256:contract.configSha256,contractSha256:contractHash};
    if(contract.requireLiveJev)try{
      const ledger=inspectLedger((await readArtifact('jev.jsonl',10*1024*1024)).toString('utf8'),ctx);
      b(ledger.results>0&&ledger.errors===0,'JEV_NOT_VERIFIED');
      b(report.tools?.jev?.mode==='live'&&report.tools.jev.requests===ledger.results&&report.tools.jev.model===MODEL,'JEV_REPORT_MISMATCH');
    }catch(e){blocked.push(e.code??'JEV_LEDGER_MISSING_OR_INVALID');}
    else {
      b(report.tools?.jev?.mode==='off'&&report.tools.jev.requests===0,'JEV_OFF_REPORT');
      try {await readArtifact('jev.jsonl',10*1024*1024);blocked.push('JEV_UNEXPECTED_LEDGER');}
      catch(e){if(e.code!=='ENOENT')blocked.push('JEV_LEDGER_UNSAFE');}
    }
  }
  b(Array.isArray(report.defects),'DEFECTS');
  for(const d of Array.isArray(report.defects)?report.defects:[]) {
    if(!b(object(d)&&CASE_ID.test(d.id??'')&&['P0','P1','P2','P3'].includes(d.severity)&&
      ['open','fixed'].includes(d.status)&&typeof d.inChangedSurface==='boolean','DEFECT_SCHEMA'))continue;
    if(d.status==='open'&&(d.severity==='P0'||(d.severity==='P1'&&d.inChangedSurface)||d.blocksContract===true))failed.push(`${d.id}:BLOCKING_DEFECT`);
    if(d.status==='fixed')b(Array.isArray(d.retestCaseIds)&&d.retestCaseIds.length>0&&
      d.retestCaseIds.every(id=>report.cases.some(c=>c.id===id&&c.status==='passed')),`${d.id}:NO_RETEST`);
  }
  return result();
}
async function cli() {
  const args=process.argv.slice(2);
  if(args.includes('--help')||args.length!==6||args[4]!=='--approved-contract-sha256') {
    console.log('node qa-gate.mjs CONTRACT.json RESULT.json RUN_DIR SUBJECT_CURRENT.json --approved-contract-sha256 HOST_APPROVED_SHA\nObtain the approved digest from the supervising host/reviewer, never recompute it to accept a changed contract.');
    process.exitCode=args.includes('--help')?0:2;return;
  }
  const readJson=async p=>JSON.parse((await readFile(p,'utf8')).replace(/^\uFEFF/,''));
  const raw=await readFile(args[0],'utf8');
  const output=await evaluateGate(JSON.parse(raw.replace(/^\uFEFF/,'')),await readJson(args[1]),{
    contractHash:hash(raw),approvedContractHash:args[5],artifactRoot:args[2],expectedSubject:await readJson(args[3])});
  console.log(JSON.stringify(output,null,2));process.exitCode=output.status==='PASSED'?0:output.status==='FAILED'?1:2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(()=>{console.error(JSON.stringify({status:'BLOCKED',code:'INVALID_INPUT_OR_LOCAL_IO',approvesDeployment:false}));process.exitCode=2;});
}
