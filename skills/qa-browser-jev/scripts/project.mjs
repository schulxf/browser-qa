/** Configuração do consumidor. JSON puro: nunca executa hooks ou código do projeto. */
import { readFile, mkdir, writeFile, lstat, realpath, rm } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demand, hash, guardSensitive } from './jev-core.mjs';
export const CONFIG_NAME = 'qa.config.json';
export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const string = (x, max = 1000) => typeof x === 'string' && x.trim() && x.length <= max;
const ID = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
function keys(obj, allowed, label) {
  demand(object(obj) && Object.keys(obj).every(k => allowed.includes(k)), label);
}
export function safeRelative(path) {
  return typeof path === 'string' && path.length > 0 && !isAbsolute(path) &&
    !/^[A-Za-z]:/.test(path) && !path.includes('\\') &&
    path.split('/').every(part => part && part !== '.' && part !== '..' && !part.includes(':'));
}
export function inside(parent, child) {
  const rel = relative(parent, child);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}
function parseUrl(value) {
  let url; try { url = new URL(value); } catch { demand(false, 'INVALID_URL'); }
  demand(['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash,
    'URL_REQUIRES_MINIMIZATION');
  return url;
}
export function validateConfig(c) {
  keys(c, ['schemaVersion','name','target','contextFiles','browser','jev','artifacts','auth','journeys'], 'CONFIG_FIELDS');
  demand(c.schemaVersion === 2 && string(c.name,120), 'CONFIG_VERSION_OR_NAME');
  keys(c.target, ['baseUrl','environment','allowedOrigins'], 'TARGET_FIELDS');
  const u = parseUrl(c.target.baseUrl);
  demand(['local','test','preview','staging'].includes(c.target.environment), 'UNSAFE_ENVIRONMENT');
  if (c.target.environment === 'local') demand(['localhost','127.0.0.1','[::1]'].includes(u.hostname), 'LOCAL_REQUIRES_LOOPBACK');
  demand(Array.isArray(c.target.allowedOrigins) && c.target.allowedOrigins.length > 0 && c.target.allowedOrigins.length <= 20,
    'ALLOWED_ORIGINS');
  for (const origin of c.target.allowedOrigins) demand(parseUrl(origin).origin === origin, 'EXACT_ORIGIN_REQUIRED');
  demand(c.target.allowedOrigins.includes(u.origin), 'BASE_ORIGIN_NOT_ALLOWED');
  demand(Array.isArray(c.contextFiles) && c.contextFiles.every(safeRelative), 'CONTEXT_FILES');
  keys(c.browser, ['command','viewports'], 'BROWSER_FIELDS');
  // Executável ou caminho revisado, nunca linha de shell ou array de comandos.
  demand(string(c.browser.command,500) && !/[\r\n\x00;&|`<>]/.test(c.browser.command), 'BROWSER_COMMAND');
  demand(Array.isArray(c.browser.viewports) && c.browser.viewports.length > 0 && c.browser.viewports.length <= 12,
    'VIEWPORTS');
  const views = new Set();
  for (const v of c.browser.viewports) {
    keys(v,['id','width','height'], 'VIEWPORT_FIELDS');
    demand(ID.test(v.id ?? '') && !views.has(v.id) && ['width','height'].every(k => Number.isInteger(v[k]) && v[k]>=240 && v[k]<=8000), 'VIEWPORT');
    views.add(v.id);
  }
  keys(c.jev,['mode','model','maxCalls','timeoutMs'], 'JEV_FIELDS');
  demand(['required','off'].includes(c.jev.mode) && c.jev.model === 'typesafe-ai/jev', 'JEV_CONFIGURATION');
  demand(Number.isInteger(c.jev.maxCalls) && c.jev.maxCalls>=1 && c.jev.maxCalls<=100, 'JEV_CALL_BUDGET');
  demand(Number.isInteger(c.jev.timeoutMs) && c.jev.timeoutMs>=250 && c.jev.timeoutMs<=15000, 'JEV_TIMEOUT');
  keys(c.artifacts,['directory'], 'ARTIFACT_FIELDS');
  demand(safeRelative(c.artifacts.directory) && !c.artifacts.directory.startsWith('.git/'), 'ARTIFACT_DIRECTORY');
  keys(c.auth,['mode','instructions'], 'AUTH_FIELDS');
  demand(['anonymous','prepared-session'].includes(c.auth.mode) && string(c.auth.instructions,3000), 'AUTH_CONFIGURATION');
  demand(Array.isArray(c.journeys) && c.journeys.length>0 && c.journeys.length<=100, 'JOURNEYS');
  const journeys = new Set();
  for (const j of c.journeys) {
    keys(j,['id','goal','actor','requiredPath','forbiddenRecovery','expected','verification','viewports'], 'JOURNEY_FIELDS');
    demand(ID.test(j.id ?? '') && !journeys.has(j.id) && string(j.goal,3000) && string(j.actor,120) &&
      string(j.expected,4000) && string(j.verification,3000), 'JOURNEY');
    for (const k of ['requiredPath','forbiddenRecovery']) demand(Array.isArray(j[k]) && j[k].every(x=>string(x,1000)), 'JOURNEY_PATH');
    demand(Array.isArray(j.viewports) && j.viewports.length>0 && new Set(j.viewports).size===j.viewports.length &&
      j.viewports.every(v=>views.has(v)), 'JOURNEY_VIEWPORTS');
    journeys.add(j.id);
  }
  guardSensitive(c);
  return c;
}
export function makeConfig({ name='web-app', url, environment='local' }) {
  const u = parseUrl(url);
  return validateConfig({
    schemaVersion:2, name,
    target:{baseUrl:u.toString(),environment,allowedOrigins:[u.origin]},
    contextFiles:[],
    browser:{command:'agent-browser',viewports:[{id:'desktop',width:1440,height:900},{id:'mobile',width:390,height:844}]},
    jev:{mode:'required',model:'typesafe-ai/jev',maxCalls:30,timeoutMs:8000},
    artifacts:{directory:'.qa-browser-jev'},
    auth:{mode:'anonymous',instructions:'Usar sessão isolada e dados sintéticos. Adaptar antes da primeira execução.'},
    journeys:[{id:'NAV-01',goal:'REVISAR: percorrer uma jornada representativa do projeto.',actor:'synthetic-user',
      requiredPath:['REVISAR: definir a tela inicial e as ações obrigatórias.'],
      forbiddenRecovery:['Não recarregar nem reaplicar estado para esconder uma falha.'],
      expected:'REVISAR: definir resultado observável a partir do requisito.',
      verification:'REVISAR: definir assert independente e checkpoints visuais.',viewports:['desktop','mobile']}]
  });
}
export async function readConfig(project) {
  const root=await realpath(resolve(project));
  demand((await lstat(root)).isDirectory(), 'PROJECT_DIRECTORY');
  const path=resolve(root,CONFIG_NAME);
  demand((await lstat(path)).isFile(), 'CONFIG_NOT_REGULAR_FILE');
  const raw=await readFile(path,'utf8');
  demand(Buffer.byteLength(raw)<=48000,'CONFIG_TOO_LARGE');
  const config=validateConfig(JSON.parse(raw.replace(/^\uFEFF/,'')));
  return { root,config,raw,configSha256:hash(raw) };
}
export async function initProject(project, options) {
  const root=await realpath(resolve(project));
  const path=resolve(root,CONFIG_NAME), config=makeConfig(options);
  // 'wx' não sobrescreve um arquivo nem segue symlink existente.
  await writeFile(path,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});
  return {path,config};
}
export async function privateDirectory(root, relativePath) {
  demand(safeRelative(relativePath), 'PRIVATE_PATH');
  let current=await realpath(root);
  for (const part of relativePath.split('/')) {
    current=resolve(current,part);
    try { await mkdir(current,{mode:0o700}); } catch(e) { if(e.code!=='EEXIST') throw e; }
    const info=await lstat(current);
    demand(info.isDirectory() && !info.isSymbolicLink(), 'ARTIFACT_SYMLINK_OR_NOT_DIRECTORY');
    demand(inside(root,await realpath(current)), 'ARTIFACT_ESCAPE');
  }
  return current;
}
export function validateSubject(s) {
  keys(s,['revision','sourceDigest','buildId'],'SUBJECT_FIELDS');
  demand(string(s.revision,200) && string(s.buildId,200) && /^[a-f0-9]{64}$/.test(s.sourceDigest ?? ''),'SUBJECT_IDENTITY');
  demand(!/PREENCHER|REVISAR|TODO/i.test(`${s.revision} ${s.buildId}`),'SUBJECT_PLACEHOLDER');
  return s;
}
export function minimumCases(config) {
  const cases=[];
    for (const j of config.journeys) for (const viewport of j.viewports) {
      for (const dimension of ['flow','visual']) {
        cases.push({id:`${j.id}-${viewport}-${dimension}`,dimension,journeyId:j.id,actor:j.actor,viewport,
          criterion:dimension==='flow'?j.expected:'Revisar hierarquia, legibilidade, cortes, sobreposições e estados conforme referência aprovada.',
          requiredPath:j.requiredPath,forbiddenRecovery:j.forbiddenRecovery,
          verifierPlan:dimension==='flow'?j.verification:'Inspeção real das screenshots por supervisor e revisor independente.',
          requiredEvidence:dimension==='flow'?['snapshot','screenshot','assertion']:['snapshot','screenshot','visual-review']});
      }
    }
  return cases;
}

export async function createRun(project, runId, subject) {
  const loaded=await readConfig(project), {root,config}=loaded;
  demand(ID.test(runId ?? ''),'RUN_ID');
  validateSubject(subject);
  demand(!/REVISAR:/.test(JSON.stringify(config.journeys)), 'JOURNEYS_NEED_REVIEW');
  const parent=await privateDirectory(root,`${config.artifacts.directory}/runs`);
  const runDir=resolve(parent,runId);
  await mkdir(runDir,{mode:0o700}); // Sem recursive: uma run existente nunca é apagada/reusada.
  try {
    const cases=minimumCases(config);
    demand(cases.every(c=>c.id.length<=81),'GENERATED_CASE_ID_TOO_LONG');
    const contract={schemaVersion:2,runId,environment:config.target.environment,subject,
      configSha256:loaded.configSha256,requireLiveJev:config.jev.mode==='required',
      scope:config.name,scopeExclusions:[],cases};
    const raw=JSON.stringify(contract,null,2)+'\n';
    const result={schemaVersion:2,runId,environment:contract.environment,subject:{...subject},
      configSha256:loaded.configSha256,contractSha256:hash(raw),simulated:false,executorId:'',
      reviewer:{id:'',independent:false,verdict:'pending'},
      tools:{agentBrowser:{ready:false,version:'',skillSha256:''},jev:{mode:config.jev.mode==='off'?'off':'not_executed',smokePassed:false,requests:0,model:'typesafe-ai/jev'}},
      cases:cases.map(c=>({id:c.id,status:'not_executed',observed:'Não executado.',verifier:'',actor:c.actor,
        viewport:c.viewport,pathViolation:false,...(c.dimension==='visual'?{visualInspectedBy:''}:{}),evidence:[]})),defects:[]};
    const files={'config.snapshot.json':loaded.raw,'contract.json':raw,'result.json':JSON.stringify(result,null,2)+'\n',
      'subject.initial.json':JSON.stringify(subject,null,2)+'\n'};
    for(const [name,body] of Object.entries(files)) await writeFile(resolve(runDir,name),body,{flag:'wx',mode:0o600});
    return {runDir,cases:cases.length,contractSha256:hash(raw)};
  } catch(e) { await rm(runDir,{recursive:true,force:true}); throw e; }
}
