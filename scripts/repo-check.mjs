/** Validação offline da distribuição, não QA do app consumidor. */
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function walk(dir){const out=[];for(const e of await readdir(dir,{withFileTypes:true})){if(['node_modules','.git','.qa-browser-jev'].includes(e.name))continue;const p=resolve(dir,e.name);if(e.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
let errors=0;const fail=x=>{console.error(x);errors++;};
const files=await walk(root);
for(const p of files){
  if(p.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});if(r.status!==0)fail(`SYNTAX ${p}\n${r.stderr}`);}
  if(p.endsWith('.json'))try{JSON.parse(await readFile(p,'utf8'));}catch{fail(`JSON ${p}`);}
  if(p.endsWith('.md')){
    const text=await readFile(p,'utf8');
    for(const m of text.matchAll(/\]\(([^\s)]+)\)/g)){
      const link=m[1];if(/^(https?:|#|mailto:)/.test(link))continue;
      const target=resolve(dirname(p),decodeURIComponent(link.split('#')[0]));
      try{await stat(target);}catch{fail(`LINK ${p} -> ${link}`);}
    }
  }
}
const skill=await readFile(resolve(root,'skills/qa-browser-jev/SKILL.md'),'utf8');
if(!skill.startsWith('---\n')||!/^name: qa-browser-jev$/m.test(skill)||!/^description: .+/m.test(skill)||skill.split('\n').length>500)fail('SKILL_METADATA');
const pkg=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const skillPkg=JSON.parse(await readFile(resolve(root,'skills/qa-browser-jev/package.json'),'utf8'));
if(pkg.name!=='browser-qa'||pkg.private===true||pkg.bin?.['browser-qa']?.replace(/^\.\//,'')!=='bin/browser-qa.mjs'||!pkg.files?.includes('skills/qa-browser-jev/')||pkg.repository?.url!=='git+https://github.com/schulxf/browser-qa.git')fail('ROOT_PACKAGE_NPX_METADATA');
if(pkg.version!==skillPkg.version||!skill.includes(`version: "${pkg.version}"`))fail('VERSION_MISMATCH');
for(const p of files.filter(p=>p.replaceAll('\\','/').includes('/skills/qa-browser-jev/'))){
  const t=await readFile(p,'utf8');
  if(/(?:[A-Z]:\\Users\\|\/mnt\/data\/|\/home\/oai\/)/.test(t))fail(`ABSOLUTE_LOCAL_PATH ${p}`);
}
const installer=spawnSync(process.execPath,[resolve(root,'bin/browser-qa.mjs'),'--help'],{encoding:'utf8',shell:false});
if(installer.status!==0)fail('INSTALLER_HELP');
if(errors){process.exitCode=1;}else{
  console.log(`Distribuição: ${files.length} arquivos; sintaxe, JSON, links e neutralidade conferidos.`);
  const testFiles=(await readdir(resolve(root,'scripts'))).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>resolve(root,'scripts',n));
  const installerTests=spawnSync(process.execPath,['--test',...testFiles],{stdio:'inherit',shell:false});
  if(installerTests.status!==0)process.exit(installerTests.status??1);
  const r=spawnSync(process.execPath,[resolve(root,'skills/qa-browser-jev/scripts/test.mjs')],{stdio:'inherit',shell:false});
  process.exitCode=r.status??1;
}
