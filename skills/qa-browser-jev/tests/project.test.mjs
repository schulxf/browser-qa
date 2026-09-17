import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, readdir, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { hash } from '../scripts/jev-core.mjs';
import { validateConfig, makeConfig, initProject, readConfig, createRun, validateSubject, SKILL_DIR, safeRelative } from '../scripts/project.mjs';
import { evaluateGate } from '../scripts/qa-gate.mjs';
const example=JSON.parse(await readFile(resolve(SKILL_DIR,'templates/qa.config.example.json'),'utf8'));
const subject={revision:'artifact-release-001',sourceDigest:hash('real-fixture-source'),buildId:'fixture-build-001'};
const cfg=()=>structuredClone(example);
async function project(callback){const d=await mkdtemp(join(tmpdir(),'qa-independent-'));try{return await callback(d);}finally{await rm(d,{recursive:true,force:true});}}
const call=(file,args,env={})=>spawnSync(process.execPath,[file,...args],{encoding:'utf8',shell:false,env:{...process.env,AI_GATEWAY_API_KEY:'',...env}});
test('configuração de exemplo válida sem framework, Git ou AGENTS.md',()=>assert.equal(validateConfig(cfg()).name,'catalog-demo'));
test('URL local não impõe a porta 3000',()=>assert.equal(makeConfig({url:'http://127.0.0.1:8181'}).target.baseUrl,'http://127.0.0.1:8181/'));
for(const environment of ['test','preview','staging'])test(`ambiente ${environment} explícito é aceito`,()=>assert.equal(makeConfig({url:'https://demo.example.test',environment}).target.environment,environment));
for(const [name,change] of [
 ['produção',c=>c.target.environment='production'],['local remoto',c=>c.target.baseUrl='https://demo.example.test'],
 ['origem ausente',c=>c.target.allowedOrigins=['https://other.example.test']],['origem com caminho',c=>c.target.allowedOrigins.push('https://example.test/path')],
 ['senha na URL',c=>c.target.baseUrl='http://user:secret@127.0.0.1:4173'],['query de sessão',c=>c.target.baseUrl+='?session=abcdefghi'],
 ['campo desconhecido',c=>c.customShell='echo hi'],['segredo top-level',c=>c.apiKey='something'],
 ['path traversal',c=>c.artifacts.directory='../private'],['contexto fora do projeto',c=>c.contextFiles=['../../x']],
 ['shell no browser',c=>c.browser.command='agent-browser; echo surprise'],['viewport repetido',c=>c.browser.viewports.push(c.browser.viewports[0])],
 ['viewport inválido',c=>c.browser.viewports[0].width=0],['viewport desconhecido',c=>c.journeys[0].viewports=['tablet']],
 ['jornada repetida',c=>c.journeys.push(c.journeys[0])],['orçamento infinito',c=>c.jev.maxCalls=Infinity],
 ['timeout negativo',c=>c.jev.timeoutMs=-1],['modelo diferente',c=>c.jev.model='other'],
 ['credenciais em auth',c=>c.auth.password='nope']
])test(`config rejeita ${name}`,()=>{const c=cfg();change(c);assert.throws(()=>validateConfig(c));});
test('paths portáveis recusam Windows e traversal',()=>{for(const p of ['../x','C:/secrets','/tmp/x','a\\b','a//b','./x'])assert.equal(safeRelative(p),false,p);});
test('init cria só a configuração e não altera o app',()=>project(async d=>{await writeFile(join(d,'package.json'),'{}');await initProject(d,{url:'http://127.0.0.1:8080'});assert.deepEqual((await readdir(d)).sort(),['package.json','qa.config.json']);assert.equal(await readFile(join(d,'package.json'),'utf8'),'{}');}));
test('init nunca sobrescreve',()=>project(async d=>{await initProject(d,{url:'http://127.0.0.1:8080'});await assert.rejects(()=>initProject(d,{url:'http://127.0.0.1:9000'}),{code:'EEXIST'});}));
test('projetos diferentes têm configuração e hash separados',()=>project(async a=>project(async b=>{await initProject(a,{url:'http://127.0.0.1:8001',name:'one'});await initProject(b,{url:'http://127.0.0.1:8002',name:'two'});const x=await readConfig(a),y=await readConfig(b);assert.notEqual(x.configSha256,y.configSha256);assert.notEqual(x.config.target.baseUrl,y.config.target.baseUrl);}))); 
test('identidade aceita artefato não-Git',()=>assert.equal(validateSubject({...subject}).revision,'artifact-release-001'));
test('identidade não aceita hash inventado em placeholder',()=>assert.throws(()=>validateSubject({...subject,sourceDigest:'PREENCHER'})));
test('rascunho de jornada não prepara run',()=>project(async d=>{await initProject(d,{url:'http://127.0.0.1:8080'});await assert.rejects(()=>createRun(d,'QA-ONE',subject),/JOURNEYS_NEED_REVIEW/);}));
test('run nasce não executada e não passa no gate',()=>project(async d=>{await writeFile(join(d,'qa.config.json'),JSON.stringify(example));const run=await createRun(d,'QA-ONE',subject);const c=JSON.parse(await readFile(join(run.runDir,'contract.json'),'utf8')),r=JSON.parse(await readFile(join(run.runDir,'result.json'),'utf8'));assert.equal(c.cases.length,4);assert.ok(r.cases.every(x=>x.status==='not_executed'));const result=await evaluateGate(c,r,{contractHash:run.contractSha256,artifactRoot:run.runDir,expectedSubject:subject});assert.equal(result.status,'BLOCKED');assert.equal(result.approvesDeployment,false);}));
test('run existente é preservada',()=>project(async d=>{await writeFile(join(d,'qa.config.json'),JSON.stringify(example));await createRun(d,'QA-ONE',subject);await assert.rejects(()=>createRun(d,'QA-ONE',subject),{code:'EEXIST'});}));
test('symlink de artefatos não escapa do projeto',t=>project(async a=>project(async b=>{await writeFile(join(a,'qa.config.json'),JSON.stringify(example));try{await symlink(b,join(a,'.qa-browser-jev'),'dir');}catch(e){if(e.code==='EPERM'){t.skip('host não permite criar symlink');return;}throw e;}await assert.rejects(()=>createRun(a,'QA-ONE',subject),/SYMLINK/);}))); 
test('skill copiada funciona sem arquivos da raiz e em pasta com espaços',()=>project(async d=>{const isolated=join(d,'skill instalada');await cp(SKILL_DIR,isolated,{recursive:true,filter:src=>!src.includes('node_modules')});const app=join(d,'app separado');const {mkdir}=await import('node:fs/promises');await mkdir(app);const r=call(join(isolated,'scripts/qa.mjs'),['init','--project',app,'--url','http://127.0.0.1:9191']);assert.equal(r.status,0,r.stderr);const c=call(join(isolated,'scripts/qa.mjs'),['config','--project',app]);assert.equal(c.status,0,c.stderr);assert.equal(JSON.parse(c.stdout).config.target.baseUrl,'http://127.0.0.1:9191/');}));
test('dry-run configurado funciona sem SDK nem chave',()=>project(async d=>{await writeFile(join(d,'qa.config.json'),JSON.stringify(example));const p=call(resolve(SKILL_DIR,'scripts/example-request.mjs'),['--project',d]);assert.equal(p.status,0,p.stderr);const file=join(d,'request.json');await writeFile(file,p.stdout);const r=call(resolve(SKILL_DIR,'scripts/jev.mjs'),[file,'--project',d,'--smoke','--dry-run']);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'DRY_RUN_ONLY');assert.equal((await readdir(d)).includes('.qa-browser-jev'),false);}));
test('ponte recusa origem aprovada no pedido mas não no projeto',()=>project(async d=>{await writeFile(join(d,'qa.config.json'),JSON.stringify(example));const p=call(resolve(SKILL_DIR,'scripts/example-request.mjs'),['--project',d]);const i=JSON.parse(p.stdout);i.approvedOrigins=['http://localhost:9000'];i.observation.url='http://localhost:9000/';const file=join(d,'request.json');await writeFile(file,JSON.stringify(i));const r=call(resolve(SKILL_DIR,'scripts/jev.mjs'),[file,'--project',d,'--smoke','--dry-run']);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).code,'PROJECT_ORIGIN_MISMATCH');}));
test('execução sem chave é bloqueada antes de importar SDK',()=>project(async d=>{await writeFile(join(d,'qa.config.json'),JSON.stringify(example));const p=call(resolve(SKILL_DIR,'scripts/example-request.mjs'),['--project',d]);const file=join(d,'request.json');await writeFile(file,p.stdout);const r=call(resolve(SKILL_DIR,'scripts/jev.mjs'),[file,'--project',d,'--smoke']);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).code,'MISSING_AI_GATEWAY_API_KEY');}));
test('modo off não é usado silenciosamente como híbrido',()=>project(async d=>{const c=cfg();c.jev.mode='off';await writeFile(join(d,'qa.config.json'),JSON.stringify(c));const r=call(resolve(SKILL_DIR,'scripts/jev.mjs'),['not-read.json','--project',d,'--dry-run']);assert.equal(r.status,2);assert.equal(JSON.parse(r.stderr).code,'JEV_DISABLED_BY_PROJECT');}));
