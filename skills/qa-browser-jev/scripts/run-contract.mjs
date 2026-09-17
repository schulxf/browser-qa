/** Reconcile the frozen run with host-approved intent. Hashes are not signatures. */
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve } from 'node:path';
import { demand, hash } from './jev-core.mjs';
import { readConfig, validateConfig, validateSubject, inside, minimumCases } from './project.mjs';

export const DIGEST = /^[a-f0-9]{64}$/;
export const CASE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
export const RUN_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
export const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
export const nonempty = v => typeof v === 'string' && v.trim().length > 0 && v.length <= 4000;
export const sameSubject = (a, b) => ['revision','sourceDigest','buildId'].every(k => a?.[k] === b?.[k]);
export const timestamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function assertContractConsistency(contract, config) {
  validateConfig(config);
  demand(record(contract) && contract.schemaVersion === 2 && RUN_ID.test(contract.runId ?? ''), 'CONTRACT_SCHEMA');
  validateSubject(contract.subject);
  demand(contract.environment === config.target.environment &&
    contract.requireLiveJev === (config.jev.mode === 'required'), 'CONTRACT_POLICY_MISMATCH');
  demand(DIGEST.test(contract.configSha256 ?? ''), 'CONTRACT_CONFIG_HASH');
  demand(Array.isArray(contract.cases) && contract.cases.length > 0 && contract.cases.length <= 5000, 'EMPTY_CONTRACT');
  const cases = new Map();
  for (const c of contract.cases) {
    demand(record(c) && CASE_ID.test(c.id ?? '') && !cases.has(c.id), 'DUPLICATE_OR_INVALID_CASE');
    demand(['flow','visual','data','a11y','performance'].includes(c.dimension) && nonempty(c.criterion) && nonempty(c.actor) &&
      config.browser.viewports.some(v => v.id === c.viewport) && Array.isArray(c.requiredEvidence) &&
      c.requiredEvidence.length > 0 && c.requiredEvidence.every(nonempty), 'CASE_CONTRACT');
    cases.set(c.id, c);
  }
  const baseline = minimumCases(config);
  const excluded = new Set();
  demand(Array.isArray(contract.scopeExclusions), 'EXCLUSIONS_REQUIRED');
  for (const e of contract.scopeExclusions) {
    demand(record(e) && baseline.some(c => c.id === e.caseId) && !excluded.has(e.caseId) && !cases.has(e.caseId) &&
      nonempty(e.reason) && nonempty(e.approvedBy) && timestamp(e.approvedAt), 'INVALID_SCOPE_EXCLUSION');
    excluded.add(e.caseId);
  }
  for (const expected of baseline) {
    if (excluded.has(expected.id)) continue;
    const actual = cases.get(expected.id);
    demand(actual, 'REQUIRED_COVERAGE_MISSING');
    for (const key of ['dimension','journeyId','actor','viewport','criterion','requiredPath','forbiddenRecovery','verifierPlan']) {
      demand(same(actual[key], expected[key]), 'REQUIRED_CASE_CHANGED');
    }
    demand(expected.requiredEvidence.every(k => actual.requiredEvidence.includes(k)), 'REQUIRED_EVIDENCE_REMOVED');
  }
  return contract;
}

export async function readRunFile(root, name, limit = 1024 * 1024) {
  const path = resolve(root, name);
  demand(inside(root, path), 'RUN_PATH_ESCAPE');
  const info = await lstat(path);
  demand(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limit &&
    inside(root, await realpath(path)), 'RUN_FILE_INVALID');
  return readFile(path);
}

/** No implicit creation, SDK import, browser action, or policy change here. */
export async function loadApprovedRun(project, runId, approvedContractSha256, caseId) {
  demand(RUN_ID.test(runId ?? '') && DIGEST.test(approvedContractSha256 ?? ''), 'APPROVED_CONTRACT_REQUIRED');
  const loaded = await readConfig(project);
  const runDir = resolve(loaded.root, loaded.config.artifacts.directory, 'runs', runId);
  demand(inside(loaded.root, runDir) && (await lstat(runDir)).isDirectory() &&
    await realpath(runDir) === runDir, 'RUN_DIRECTORY_INVALID');
  const raw = (await readRunFile(runDir, 'contract.json')).toString('utf8');
  demand(hash(raw) === approvedContractSha256, 'APPROVED_CONTRACT_CHANGED');
  const contract = JSON.parse(raw.replace(/^\uFEFF/, ''));
  const snapshot = (await readRunFile(runDir, 'config.snapshot.json', 48000)).toString('utf8');
  demand(contract.runId === runId && hash(snapshot) === contract.configSha256 &&
    loaded.configSha256 === contract.configSha256, 'FROZEN_CONFIG_CHANGED');
  const frozen = validateConfig(JSON.parse(snapshot.replace(/^\uFEFF/, '')));
  assertContractConsistency(contract, frozen);
  const caseSpec = caseId === undefined ? null : contract.cases.find(c => c.id === caseId);
  if (caseId !== undefined) demand(caseSpec, 'SCENARIO_NOT_IN_CONTRACT');
  return { ...loaded, config: frozen, runDir, contract, caseSpec, contractSha256: approvedContractSha256 };
}
