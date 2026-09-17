/** Bounded navigation, not a QA approver. All effects go through an injected agent-browser adapter. */
import { demand, hash, guardSensitive } from './jev-core.mjs';

const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REF = /^@e\d+$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max = 1000) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const fields = (value, names, code) => demand(object(value) && Object.keys(value).every(k => names.includes(k)), code);
const sensitiveName = /password|senha|token|secret|cookie|authorization|api.?key/i;
// Defense in depth, not a semantic authorization mechanism. The supervisor must review each capability.
const sensitiveClick = /\b(delete|remove|pay|purchase|buy|submit|save|send|publish|deploy|grant|transfer|excluir|apagar|pagar|comprar|salvar|enviar|publicar|transferir)\b/i;

export function minimizedUrl(raw, origins) {
  let url;
  try { url = new URL(raw); } catch { demand(false, 'NAV_URL'); }
  demand(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && origins.includes(url.origin), 'NAV_ORIGIN');
  return url.origin + url.pathname;
}

/** Values in query/fragment stay local. A digest preserves freshness without sending them to Jev. */
export function normalizeObservation(raw, origins, now = Date.now()) {
  demand(object(raw) && object(raw.refs) && text(raw.snapshot, 16000), 'NAV_SNAPSHOT');
  const url = minimizedUrl(raw.url, origins);
  const refs = {};
  for (const [key, value] of Object.entries(raw.refs)) {
    const ref = key.startsWith('@') ? key : `@${key}`;
    demand(REF.test(ref) && !Object.hasOwn(refs, ref) && object(value) && text(value.role, 80) &&
      typeof value.name === 'string' && value.name.length <= 500, 'NAV_REFS');
    refs[ref] = { role: value.role, name: value.name };
  }
  demand(Object.keys(refs).length <= 500, 'NAV_TOO_MANY_REFS');
  const semanticHash = hash({ urlDigest: hash(raw.url), snapshot: raw.snapshot });
  const stateHash = hash({ semanticHash, refs });
  return { id: `obs-${stateHash.slice(0,24)}`, url, snapshot: raw.snapshot, refs,
    capturedAt: new Date(now).toISOString(), stateHash, semanticHash };
}

export function validatePlan(plan, { contract, config, contractSha256 }) {
  fields(plan, ['schemaVersion','id','runId','caseId','contractSha256','approvedBySupervisor','dataClass','review','steps'], 'NAV_PLAN_FIELDS');
  demand(plan.schemaVersion === 1 && ID.test(plan.id ?? '') && plan.runId === contract.runId &&
    DIGEST.test(plan.contractSha256 ?? '') && plan.contractSha256 === contractSha256, 'NAV_PLAN_IDENTITY');
  const caseSpec = contract.cases.find(c => c.id === plan.caseId && c.dimension === 'flow');
  demand(caseSpec, 'NAV_FLOW_CASE_REQUIRED');
  demand(plan.approvedBySupervisor === true && plan.dataClass === 'synthetic', 'NAV_NOT_APPROVED');
  fields(plan.review, ['checkpointId','observationHash','screenshotSha256','reviewedBy','accepted'], 'NAV_REVIEW_FIELDS');
  demand(ID.test(plan.review.checkpointId ?? '') && DIGEST.test(plan.review.observationHash ?? '') &&
    DIGEST.test(plan.review.screenshotSha256 ?? '') && text(plan.review.reviewedBy,120) &&
    plan.review.reviewedBy.toLowerCase() !== 'jev' && plan.review.accepted === true, 'NAV_VISUAL_REVIEW_REQUIRED');
  demand(Array.isArray(plan.steps) && plan.steps.length >= 1 && plan.steps.length <= 3, 'NAV_CHECKPOINT_BUDGET');
  const ids = new Set();
  for (const step of plan.steps) {
    fields(step, ['id','goal','at','options','expectedAfter','settleTimeoutMs'], 'NAV_STEP_FIELDS');
    demand(ID.test(step.id ?? '') && !ids.has(step.id) && text(step.goal,2000), 'NAV_STEP_ID');
    ids.add(step.id);
    demand(step.settleTimeoutMs === undefined || (Number.isInteger(step.settleTimeoutMs) && step.settleTimeoutMs >= 0 && step.settleTimeoutMs <= 5000), 'NAV_SETTLE_BUDGET');
    demand(minimizedUrl(step.at, config.target.allowedOrigins) === step.at, 'NAV_EXACT_ROUTE_REQUIRED');
    fields(step.expectedAfter, ['url','textIncludes'], 'NAV_EXPECTATION_FIELDS');
    const expected = step.expectedAfter;
    demand(expected.url !== undefined || expected.textIncludes !== undefined, 'NAV_EXPECTATION_REQUIRED');
    if (expected.url !== undefined) demand(minimizedUrl(expected.url, config.target.allowedOrigins) === expected.url, 'NAV_EXPECTED_URL');
    if (expected.textIncludes !== undefined) demand(Array.isArray(expected.textIncludes) && expected.textIncludes.length > 0 &&
      expected.textIncludes.length <= 10 && expected.textIncludes.every(t => text(t,500)), 'NAV_EXPECTED_TEXT');
    demand(Array.isArray(step.options) && step.options.length > 0 && step.options.length <= 16, 'NAV_OPTIONS');
    const selectors = new Set();
    for (const option of step.options) {
      fields(option, ['kind','role','name','effect','value'], 'NAV_OPTION_FIELDS');
      demand(['click','fill'].includes(option.kind) && text(option.name,500) && !sensitiveName.test(option.name), 'NAV_OPTION');
      const selector = `${option.role}\0${option.name}`;
      demand(!selectors.has(selector), 'NAV_DUPLICATE_OPTION'); selectors.add(selector);
      if (option.kind === 'click') {
        demand(['button','link','tab'].includes(option.role) && option.effect === 'read-only' &&
          option.value === undefined && !sensitiveClick.test(option.name), 'NAV_SENSITIVE_ACTION');
      } else {
        demand(['textbox','searchbox'].includes(option.role) && option.effect === 'synthetic-input' && text(option.value,1000) && !option.value.startsWith('-'), 'NAV_FILL');
      }
    }
  }
  guardSensitive(plan);
  return plan;
}

/** Only exact, unique role/name matches are eligible. No model-created selectors or JS. */
export function candidatesFor(step, observation) {
  demand(observation.url === step.at, 'NAV_UNEXPECTED_ROUTE');
  const candidates = [];
  step.options.forEach((option, index) => {
    const matches = Object.entries(observation.refs).filter(([,v]) => v.role === option.role && v.name === option.name);
    demand(matches.length <= 1, 'NAV_AMBIGUOUS_TARGET');
    if (matches.length === 1) candidates.push({ id: `option-${index+1}`, kind: option.kind, ref: matches[0][0],
      description: `${option.kind} ${option.role}: ${option.name}`, risk: 'low', approved: true });
  });
  demand(candidates.length > 0, 'NAV_NO_APPROVED_TARGET');
  return candidates;
}

export function decisionInput(plan, step, observation, candidates, config) {
  return { schemaVersion:1, mode:'decide', runId:plan.runId, scenarioId:step.id,
    goal:step.goal, environment:config.target.environment, dataClass:'synthetic', approvedBySupervisor:true,
    approvedOrigins:config.target.allowedOrigins,
    observation:Object.fromEntries(['id','url','snapshot','refs','capturedAt'].map(k=>[k,observation[k]])), candidates };
}

export function commandFor(step, candidate) {
  const index = Number(candidate.id.slice('option-'.length))-1;
  const option = step.options[index];
  demand(option && candidate.kind === option.kind && REF.test(candidate.ref), 'NAV_INVALID_SELECTION');
  return option.kind === 'fill' ? ['fill',candidate.ref,option.value] : ['click',candidate.ref];
}

/** A segment always hands back to vision + independent assertions; CHECKPOINT is not PASS. */
export async function executeSegment(plan, { config, observe, act, decide, checkpoint, emit = async()=>{} }) {
  const started = performance.now();
  const metrics = { actions:0, directActions:0, jevDecisions:0, jevDecisionAttempts:0, jevSelectedActions:0,
    assessmentCalls:0, jevLatencyMs:0, inputTokens:0, outputTokens:0, tokenUsageComplete:true };
  const finish = (status, reason) => ({ schemaVersion:1, status, reason, purpose:'navigation',
    runId:plan.runId, caseId:plan.caseId, segmentId:plan.id, metrics:{...metrics,loopMs:Math.round(performance.now()-started)},
    approvesQa:false, newBugsDiscovered:null, avoidedIncorrectApproval:null });
  let current;
  try {
    current = await observe();
    demand(current.stateHash === plan.review.observationHash, 'NAV_REVIEW_STALE');
    for (const step of plan.steps) {
      const candidates = candidatesFor(step,current);
      let selected;
      if (candidates.length === 1) selected = candidates[0];
      else {
        demand(config.jev.mode === 'required', 'NAV_JEV_DISABLED');
        metrics.jevDecisionAttempts++;
        let result;
        try { result = await decide(decisionInput(plan,step,current,candidates,config)); }
        catch (error) { metrics.tokenUsageComplete = false; throw error; }
        metrics.jevDecisions++;
        metrics.jevLatencyMs += result.latencyMs ?? 0;
        for (const key of ['inputTokens','outputTokens']) {
          if (Number.isSafeInteger(result.usage?.[key])) metrics[key] += result.usage[key];
          else metrics.tokenUsageComplete = false;
        }
        await emit({event:'decision',stepId:step.id,status:result.status,selectedCandidate:result.selectedCandidate ?? null});
        if (result.status !== 'PROPOSED') return finish(result.status === 'CHECKPOINT' ? 'CHECKPOINT' : 'ESCALATE',result.reason);
        selected = candidates.find(c=>c.id === result.selectedCandidate);
        demand(selected, 'NAV_UNOBSERVED_SELECTION');
      }
      // Re-read after inference. A changed page is a handoff, never an automatic retry.
      const fresh = await observe();
      demand(fresh.stateHash === current.stateHash, 'NAV_STALE_BEFORE_ACTION');
      const command = commandFor(step, selected);
      await emit({event:'action-intent',stepId:step.id,kind:selected.kind,ref:selected.ref,source:candidates.length === 1?'direct':'jev'});
      await act(command); // At most once. A timeout is an unknown outcome, not permission to replay.
      metrics.actions++;
      if (candidates.length === 1) metrics.directActions++; else metrics.jevSelectedActions++;
      await emit({event:'action-completed',stepId:step.id,kind:selected.kind,ref:selected.ref});
      const expected = step.expectedAfter;
      const matches = o => (!expected.url || o.url === expected.url) && (!expected.textIncludes || expected.textIncludes.every(t=>o.snapshot.includes(t)));
      const deadline = performance.now() + (step.settleTimeoutMs ?? 1500);
      let after = await observe();
      // Read-only readiness wait; never replay input or use Jev to excuse a failed postcondition.
      while ((!matches(after) || after.semanticHash === current.semanticHash) && performance.now() < deadline) {
        await new Promise(done=>setTimeout(done,Math.min(100,Math.max(1,deadline-performance.now()))));
        after = await observe();
      }
      await checkpoint(after,step.id);
      demand(after.semanticHash !== current.semanticHash, 'NAV_NO_PROGRESS');
      if (!matches(after)) {
        await emit({event:'postcondition-failed',stepId:step.id});
        return finish('FAILED','NAV_POSTCONDITION_FAILED');
      }
      await emit({event:'postcondition-observed',stepId:step.id,observationHash:after.stateHash});
      current = after;
    }
    return finish('CHECKPOINT','VISUAL_AND_INDEPENDENT_VERIFICATION_REQUIRED');
  } catch (error) {
    const code = typeof error?.code === 'string' && /^[A-Z][A-Z0-9_]+$/.test(error.code) ? error.code : 'NAV_LOCAL_OR_TRANSPORT_ERROR';
    await emit({event:'stopped',code});
    return finish('BLOCKED',code);
  }
}
