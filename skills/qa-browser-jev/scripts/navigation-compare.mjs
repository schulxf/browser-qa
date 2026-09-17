#!/usr/bin/env node
/** Descriptive comparison of paired, host-measured runs. Does not run a benchmark or attest measurements. */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { demand, hash, QaError } from './jev-core.mjs';
const unique = value => Array.isArray(value) && value.every(x=>typeof x==='string' && x.length>0) && new Set(value).size===value.length;
const count = value => Number.isSafeInteger(value) && value>=0;
const finite = value => typeof value==='number' && Number.isFinite(value) && value>=0;

function validate(sample) {
  demand(sample?.schemaVersion===1 && ['baseline','hybrid'].includes(sample.arm),'COMPARE_SCHEMA');
  for (const key of ['runId','pairId','fixtureId','actor','viewport','supervisorModel','hostVersion','browserVersion','reviewedBy'])
    demand(typeof sample[key]==='string' && sample[key].trim().length>0,'COMPARE_IDENTITY');
  demand(/^[a-f0-9]{64}$/.test(sample.protocolSha256 ?? '') && /^[a-f0-9]{64}$/.test(sample.sourceDigest ?? '') &&
    typeof sample.buildId==='string' && sample.buildId.length>0,'COMPARE_BUILD');
  demand(sample.independentlyVerified===true && sample.simulated===false,'COMPARE_UNVERIFIED');
  for (const key of ['requiredCases','executedCases','referenceDefects','detectedDefects']) demand(unique(sample[key]),'COMPARE_DUPLICATE_OR_MISSING_IDS');
  demand(sample.requiredCases.length>0 && sample.executedCases.every(x=>sample.requiredCases.includes(x)),'COMPARE_CASES');
  demand(finite(sample.wallMs) && sample.wallMs>0 && count(sample.supervisorCalls) && count(sample.falseApprovals) &&
    count(sample.jevRequests) && count(sample.jevNavigationActions),'COMPARE_METRICS');
  demand(sample.totalCostUsd===null || finite(sample.totalCostUsd),'COMPARE_COST');
  if (sample.arm==='baseline') demand(sample.jevRequests===0 && sample.jevNavigationActions===0,'COMPARE_BASELINE_USED_JEV');
  demand(sample.jevNavigationActions<=sample.jevRequests,'COMPARE_NAVIGATION_COUNT');
  return sample;
}

export function compareRuns(left,right) {
  validate(left); validate(right);
  demand(left.arm!==right.arm && left.runId!==right.runId,'COMPARE_DISTINCT_RUNS');
  const a=left.arm==='baseline'?left:right, b=left.arm==='hybrid'?left:right;
  const keys=['pairId','fixtureId','actor','viewport','supervisorModel','hostVersion','browserVersion','protocolSha256','sourceDigest','buildId'];
  demand(keys.every(k=>a[k]===b[k]),'COMPARE_UNMATCHED_CONTEXT');
  for(const key of ['requiredCases','referenceDefects']) demand(hash([...a[key]].sort())===hash([...b[key]].sort()),'COMPARE_UNMATCHED_SCOPE');
  const quality = sample => ({
    missedCases:sample.requiredCases.filter(id=>!sample.executedCases.includes(id)),
    detected:sample.referenceDefects.filter(id=>sample.detectedDefects.includes(id)),
    missed:sample.referenceDefects.filter(id=>!sample.detectedDefects.includes(id)),
    falsePositives:sample.detectedDefects.filter(id=>!sample.referenceDefects.includes(id)),
    falseApprovals:sample.falseApprovals
  });
  const aq=quality(a),bq=quality(b);
  const regression=bq.falseApprovals>aq.falseApprovals || bq.falsePositives.length>aq.falsePositives.length ||
    aq.detected.some(id=>!bq.detected.includes(id));
  return {
    schemaVersion:1,pairId:a.pairId,
    status:aq.missedCases.length || bq.missedCases.length ? 'INCOMPLETE' :
      b.jevNavigationActions===0 ? 'NO_NAVIGATION_EXERCISED' : regression ? 'QUALITY_REGRESSION' : 'COMPARABLE',
    baselineQuality:aq,hybridQuality:bq,
    differences:{wallMs:b.wallMs-a.wallMs,wallPercent:(b.wallMs/a.wallMs-1)*100,
      supervisorCalls:b.supervisorCalls-a.supervisorCalls,
      totalCostUsd:a.totalCostUsd===null || b.totalCostUsd===null ? null : b.totalCostUsd-a.totalCostUsd},
    measurementSource:'host-reported; verify receipts independently',samplePairs:1,
    conclusion:'Descriptive paired observation only; repeat with alternating order. No general speed or reliability claim.',
    approvesQa:false
  };
}
async function main() {
  const a=process.argv.slice(2);
  if(a.includes('--help')) {console.log('node scripts/navigation-compare.mjs baseline.json hybrid.json\nSee references/navigation.md for paired measurement boundaries.');return;}
  demand(a.length===2,'COMPARE_ARGUMENTS');
  const samples=await Promise.all(a.map(async file=>{const s=await readFile(file,'utf8');demand(Buffer.byteLength(s)<=48000,'COMPARE_SIZE');return JSON.parse(s);}));
  const result=compareRuns(...samples);console.log(JSON.stringify(result,null,2));
  process.exitCode=result.status==='QUALITY_REGRESSION'?1:result.status==='COMPARABLE'?0:2;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(e=>{console.error(JSON.stringify({status:'BLOCKED',code:e instanceof QaError?e.code:'COMPARE_INVALID_INPUT'}));process.exitCode=2;});
}
