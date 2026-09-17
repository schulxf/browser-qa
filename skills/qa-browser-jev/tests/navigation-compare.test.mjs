import test from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns } from '../scripts/navigation-compare.mjs';
import { hash } from '../scripts/jev-core.mjs';
function pair() {
  const common={schemaVersion:1,pairId:'pair-1',fixtureId:'catalog-broken-state',actor:'synthetic',viewport:'390x844',
    supervisorModel:'same-supervisor',hostVersion:'host-1',browserVersion:'test-1',protocolSha256:hash('same procedure'),
    sourceDigest:hash('same fixture'),buildId:'same-build',reviewedBy:'independent-human',independentlyVerified:true,simulated:false,
    requiredCases:['flow','visual'],executedCases:['flow','visual'],referenceDefects:['lost-filter'],detectedDefects:['lost-filter'],
    wallMs:10000,supervisorCalls:10,falseApprovals:0,jevRequests:0,jevNavigationActions:0,totalCostUsd:0.02};
  // Synthetic unit inputs, not measured benchmark results.
  return [{...common,arm:'baseline',runId:'A'},{...common,arm:'hybrid',runId:'B',wallMs:8000,supervisorCalls:5,jevRequests:3,jevNavigationActions:2,totalCostUsd:0.01}];
}
test('same detected bugs can still show lower measured time and fewer supervisor calls',()=>{
  const r=compareRuns(...pair());assert.equal(r.status,'COMPARABLE');assert.equal(r.differences.wallMs,-2000);assert.equal(r.differences.supervisorCalls,-5);assert.equal(r.approvesQa,false);
});
test('an assessment-only hybrid is not evidence for navigation benefit',()=>{
  const p=pair();p[1].jevNavigationActions=0;assert.equal(compareRuns(...p).status,'NO_NAVIGATION_EXERCISED');
});
test('faster but missing a previously detected defect is a quality regression',()=>{
  const p=pair();p[1].detectedDefects=[];assert.equal(compareRuns(...p).status,'QUALITY_REGRESSION');
});
test('false approvals prevent interpreting a faster run as improvement',()=>{
  const p=pair();p[1].falseApprovals=1;assert.equal(compareRuns(...p).status,'QUALITY_REGRESSION');
});
test('missing required cases is incomplete, not faster coverage',()=>{
  const p=pair();p[1].executedCases=['flow'];assert.equal(compareRuns(...p).status,'INCOMPLETE');
});
test('unknown total cost remains null rather than zero or token-only pricing',()=>{
  const p=pair();p[1].totalCostUsd=null;assert.equal(compareRuns(...p).differences.totalCostUsd,null);
});
for(const [label,change] of [
 ['build',p=>p[1].buildId='other'],['viewport',p=>p[1].viewport='other'],['host',p=>p[1].hostVersion='other'],
 ['model',p=>p[1].supervisorModel='other'],['ground truth',p=>p[1].referenceDefects=[]],
 ['protocol',p=>p[1].protocolSha256=hash('changed')],['simulation',p=>p[1].simulated=true],
 ['duplicate evidence',p=>p[1].detectedDefects.push('lost-filter')],['unverified',p=>p[1].independentlyVerified=false],
 ['same run',p=>p[1].runId='A'],['baseline uses Jev',p=>p[0].jevRequests=1],['impossible action count',p=>p[1].jevNavigationActions=4]
])test(`rejects incomparable or invalid ${label}`,()=>{const p=pair();change(p);assert.throws(()=>compareRuns(...p));});
