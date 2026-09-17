#!/usr/bin/env node
/** Verifica integridade/completude do pacote. Não prova a veracidade das declarações do revisor. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from './jev-core.mjs';
const STATUSES = new Set(['passed', 'failed', 'blocked', 'not_executed']);
const DIGEST = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,80}$/;
const nonempty = x => typeof x === 'string' && x.trim().length > 0;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export async function evaluateGate(contract, report, { contractHash, artifactRoot, expectedSubject } = {}) {
  const blocked = [], failed = [];
  const b = (ok, code) => { if (!ok) blocked.push(code); return ok; };
  if (!b(object(contract) && object(report), 'SCHEMA')) return result();
  b(contract.schemaVersion === 2 && report.schemaVersion === 2, 'SCHEMA_VERSION');
  b(ID.test(contract.runId ?? '') && report.runId === contract.runId, 'RUN_ID');
  b(DIGEST.test(contractHash ?? '') && report.contractSha256 === contractHash, 'CONTRACT_HASH');
  b(['local', 'test', 'preview', 'staging'].includes(contract.environment) && report.environment === contract.environment, 'ENVIRONMENT');
  for (const k of ['revision', 'sourceDigest', 'buildId']) {
    const value = contract.subject?.[k];
    b(nonempty(value) && value === report.subject?.[k] && value === expectedSubject?.[k], `SUBJECT_${k}`);
  }
  b(nonempty(contract.subject?.revision) && contract.subject.revision.length <= 200, 'REVISION_FORMAT');
  b(DIGEST.test(contract.subject?.sourceDigest ?? ''), 'SOURCE_DIGEST_FORMAT');
  b(DIGEST.test(contract.configSha256 ?? '') && report.configSha256 === contract.configSha256, 'CONFIG_HASH');
  b(report.simulated === false, 'SIMULATED_REPORT');
  b(nonempty(report.executorId), 'EXECUTOR');
  b(nonempty(report.reviewer?.id) && report.reviewer.id !== report.executorId &&
    report.reviewer.independent === true && report.reviewer.verdict === 'accepted', 'INDEPENDENT_REVIEW');
  b(report.tools?.agentBrowser?.ready === true && nonempty(report.tools?.agentBrowser?.version) &&
    DIGEST.test(report.tools?.agentBrowser?.skillSha256 ?? ''), 'AGENT_BROWSER');
  if (contract.requireLiveJev !== false) {
    b(report.tools?.jev?.mode === 'live' && report.tools?.jev?.smokePassed === true &&
      Number.isSafeInteger(report.tools?.jev?.requests) && report.tools.jev.requests > 0 &&
      nonempty(report.tools?.jev?.model), 'JEV_NOT_LIVE');
  }
  if (!b(Array.isArray(contract.cases) && contract.cases.length > 0, 'EMPTY_CONTRACT')) return result();
  if (!b(Array.isArray(report.cases), 'MISSING_CASES')) return result();
  if (!b(contract.cases.every(object) && report.cases.every(object), 'INVALID_CASE_OBJECT')) return result();
  b(new Set(contract.cases.map(c => c.id)).size === contract.cases.length, 'DUPLICATE_CONTRACT_CASE');
  b(new Set(report.cases.map(c => c.id)).size === report.cases.length, 'DUPLICATE_RESULT_CASE');
  b(report.cases.every(c => contract.cases.some(r => r.id === c.id)), 'UNDECLARED_CASE');
  let root;
  try { root = await realpath(artifactRoot); } catch { blocked.push('ARTIFACT_ROOT'); return result(); }
  try {
    const configPath = await realpath(resolve(root, 'config.snapshot.json'));
    const configRel = relative(root, configPath);
    b(configRel !== '..' && !configRel.startsWith(`..${sep}`) && !isAbsolute(configRel), 'CONFIG_SNAPSHOT_ESCAPE');
    const configRaw = await readFile(configPath, 'utf8');
    b(hash(configRaw) === contract.configSha256, 'CONFIG_SNAPSHOT_HASH');
  } catch { blocked.push('CONFIG_SNAPSHOT_MISSING'); }
  const matchesImage = bytes => bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
    (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP');
  async function evidenceCheck(e, caseId) {
    if (!b(object(e) && nonempty(e.path) && DIGEST.test(e.sha256 ?? '') && nonempty(e.kind), `${caseId}:EVIDENCE_SCHEMA`)) return;
    const normalized = e.path.replaceAll('\\', '/');
    if (!b(!isAbsolute(e.path) && !/^[a-zA-Z]:/.test(e.path) &&
      !normalized.split('/').some(s => s === '..') && !normalized.startsWith('/'), `${caseId}:EVIDENCE_PATH`)) return;
    try {
      const target = await realpath(resolve(root, e.path));
      const rel = relative(root, target);
      if (!b(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), `${caseId}:EVIDENCE_ESCAPE`)) return;
      const metadata = await stat(target);
      if (!b(metadata.isFile() && metadata.size > 0 && metadata.size <= 50 * 1024 * 1024, `${caseId}:EVIDENCE_SIZE`)) return;
      const content = await readFile(target);
      // hash(Buffer) precisa representar os bytes, não serialização do Buffer.
      const { createHash } = await import('node:crypto');
      b(createHash('sha256').update(content).digest('hex') === e.sha256, `${caseId}:EVIDENCE_HASH`);
      if (e.kind === 'screenshot') b(matchesImage(content), `${caseId}:NOT_IMAGE`);
    } catch { blocked.push(`${caseId}:EVIDENCE_MISSING`); }
  }
  for (const c of contract.cases) {
    if (!b(object(c) && ID.test(c.id ?? '') && ['visual', 'flow', 'data', 'a11y', 'performance'].includes(c.dimension) &&
      nonempty(c.criterion) && Array.isArray(c.requiredEvidence) && c.requiredEvidence.length > 0, 'CASE_CONTRACT')) continue;
    const r = report.cases.find(x => x.id === c.id);
    if (!b(object(r), `${c.id}:NOT_EXECUTED`)) continue;
    if (!b(STATUSES.has(r.status), `${c.id}:STATUS`)) continue;
    if (r.status === 'failed') failed.push(`${c.id}:FAILED`);
    else if (r.status !== 'passed') blocked.push(`${c.id}:${r.status.toUpperCase()}`);
    b(nonempty(r.observed) && nonempty(r.verifier), `${c.id}:OBSERVATION_OR_VERIFIER`);
    b(nonempty(c.viewport) && nonempty(c.actor) && r.viewport === c.viewport && r.actor === c.actor, `${c.id}:CONFIGURATION`);
    if (!b(Array.isArray(r.evidence), `${c.id}:EVIDENCE`)) continue;
    for (const kind of c.requiredEvidence) b(r.evidence.some(e => object(e) && e.kind === kind), `${c.id}:MISSING_${kind}`);
    for (const e of r.evidence) await evidenceCheck(e, c.id);
    if (c.dimension === 'visual') {
      b(c.requiredEvidence.includes('screenshot') && c.requiredEvidence.includes('visual-review'), `${c.id}:VISUAL_CONTRACT`);
      b(nonempty(r.visualInspectedBy) && r.visualInspectedBy !== 'jev' && r.visualInspectedBy !== report.executorId,
        `${c.id}:VISUAL_NOT_INDEPENDENTLY_INSPECTED`);
    }
    if (['flow', 'data', 'performance'].includes(c.dimension)) {
      b(c.requiredEvidence.includes('assertion'), `${c.id}:ASSERTION_CONTRACT`);
    }
    // Recuperação não pode transformar caminho defeituoso em sucesso.
    b(typeof r.pathViolation === 'boolean', `${c.id}:PATH_VIOLATION_MISSING`);
    if (r.pathViolation === true && r.status === 'passed') failed.push(`${c.id}:RECOVERED_PATH_NOT_PASS`);
  }
  b(Array.isArray(report.defects), 'DEFECTS');
  for (const d of Array.isArray(report.defects) ? report.defects : []) {
    if (!b(object(d) && ID.test(d.id ?? '') && ['P0','P1','P2','P3'].includes(d.severity) &&
      ['open','fixed'].includes(d.status) && typeof d.inChangedSurface === 'boolean', 'DEFECT_SCHEMA')) continue;
    if (d.status === 'open' && (d.severity === 'P0' || (d.severity === 'P1' && d.inChangedSurface) || d.blocksContract === true)) {
      failed.push(`${d.id}:BLOCKING_DEFECT`);
    }
    if (d.status === 'fixed') {
      b(Array.isArray(d.retestCaseIds) && d.retestCaseIds.length > 0 &&
        d.retestCaseIds.every(id => report.cases.some(c => c.id === id && c.status === 'passed')), `${d.id}:NO_RETEST`);
    }
  }
  return result();
  function result() {
    return { status: failed.length ? 'FAILED' : blocked.length ? 'BLOCKED' : 'PASSED',
      failed: [...new Set(failed)], blocked: [...new Set(blocked)],
      approvesDeployment: false, integrityCheckOnly: true };
  }
}
async function cli() {
  const a = process.argv.slice(2);
  if (a.includes('--help') || a.length !== 4) {
    console.log('Uso: node scripts/qa-gate.mjs contrato.json resultado.json pasta-de-evidencias sujeito-atual.json\nA identidade atual deve ser coletada novamente do código/build, não copiada do relatório.');
    process.exitCode = a.includes('--help') ? 0 : 2; return;
  }
  const readJson = async p => JSON.parse((await readFile(p, 'utf8')).replace(/^\uFEFF/, ''));
  const raw = await readFile(a[0], 'utf8');
  const output = await evaluateGate(JSON.parse(raw.replace(/^\uFEFF/, '')), await readJson(a[1]), {
    contractHash: hash(raw), artifactRoot: a[2], expectedSubject: await readJson(a[3])
  });
  console.log(JSON.stringify(output, null, 2));
  process.exitCode = output.status === 'PASSED' ? 0 : output.status === 'FAILED' ? 1 : 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cli().catch(() => { console.error(JSON.stringify({ status: 'BLOCKED', code: 'INVALID_INPUT_OR_LOCAL_IO', approvesDeployment: false })); process.exitCode = 2; });
}
