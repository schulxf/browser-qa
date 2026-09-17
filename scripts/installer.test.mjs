import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import {
  configDir, credentialsPath, discoverInstalledSkillDirs, main, parseArgs,
  parseCredentialInput, runConfigure, runInstall, skillsCommandArgs, writeCredentials,
} from '../bin/browser-qa.mjs';

test('parseArgs rejects API keys on the command line',()=>{
  assert.throws(()=>parseArgs(['configure','--api-key','secret']),/never as command-line arguments/);
});
test('skillsCommandArgs delegates installation to the pinned skills CLI',()=>{
  assert.deepEqual(skillsCommandArgs('add',{source:'D:/repo',scope:'project',agents:['codex','claude']}),
    ['skills@1.7.0','add','D:/repo','--skill','qa-browser-jev','--agent','codex','--agent','claude']);
  assert.deepEqual(skillsCommandArgs('list'),['skills@1.7.0','list','--json']);
  assert.deepEqual(skillsCommandArgs('list',{scope:'global'}),['skills@1.7.0','list','--json','--global']);
});
test('parseCredentialInput accepts stdin-friendly formats',()=>{
  assert.equal(parseCredentialInput('plain-key\n'),'plain-key');
  assert.equal(parseCredentialInput('AI_GATEWAY_API_KEY="env-key"\n'),'env-key');
  assert.equal(parseCredentialInput('{"AI_GATEWAY_API_KEY":"json-key"}'),'json-key');
  assert.equal(parseCredentialInput('{"aiGatewayApiKey":"camel-key"}'),'camel-key');
});
test('configDir follows platform conventions',()=>{
  const portable=v=>v.replaceAll('\\','/');
  assert.equal(portable(configDir({APPDATA:'C:/Users/A/AppData/Roaming'},'win32')),'C:/Users/A/AppData/Roaming/browser-qa');
  assert.ok(portable(configDir({XDG_CONFIG_HOME:'/tmp/config'},'linux')).endsWith('/tmp/config/browser-qa'));
  assert.ok(portable(configDir({HOME:'/home/me'},'linux')).endsWith('/home/me/.config/browser-qa'));
});
test('discoverInstalledSkillDirs tolerates common skills list shapes',async()=>{
  assert.deepEqual(await discoverInstalledSkillDirs(JSON.stringify({skills:[{name:'other',path:'/tmp/other'},{name:'qa-browser-jev',path:'/tmp/qa-browser-jev'}]})),[resolve('/tmp/qa-browser-jev')]);
  assert.deepEqual(await discoverInstalledSkillDirs(JSON.stringify([{id:'qa-browser-jev',directory:'/tmp/installed/qa-browser-jev'}])),[resolve('/tmp/installed/qa-browser-jev')]);
});
test('writeCredentials creates a private credentials file outside the skill',async()=>{
  const calls=[],directory=resolve('/tmp/browser-qa');
  const fs={mkdir:async(...a)=>calls.push(['mkdir',...a]),writeFile:async(...a)=>calls.push(['writeFile',...a]),chmod:async(...a)=>calls.push(['chmod',...a])};
  const file=await writeCredentials('secret-key',{directory,fs});
  assert.equal(file,credentialsPath(directory));assert.deepEqual(calls[0],['mkdir',directory,{recursive:true,mode:0o700}]);
  assert.equal(calls[1][0],'writeFile');assert.equal(calls[1][1],credentialsPath(directory));
  assert.equal(calls[1][2],'AI_GATEWAY_API_KEY=secret-key\n');assert.deepEqual(calls[1][3],{mode:0o600,flag:'w'});
  assert.deepEqual(calls[2],['chmod',credentialsPath(directory),0o600]);
});
test('runConfigure reads credentials from stdin without echoing them',async()=>{
  const logs=[],writes=[],directory=resolve('/tmp/browser-qa');
  const fs={mkdir:async()=>{},writeFile:async(...a)=>writes.push(a),chmod:async()=>{}};
  const file=await runConfigure({fromStdin:true,configDir:directory},{fs,isTty:false,log:v=>logs.push(v),readStdin:async()=>'AI_GATEWAY_API_KEY=stdin-key\n'});
  assert.equal(file,credentialsPath(directory));assert.equal(writes[0][1],'AI_GATEWAY_API_KEY=stdin-key\n');
  assert.ok(logs.every(v=>!v.includes('stdin-key')));
});
test('runInstall calls skills add, skills list, then npm ci in discovered copies',async()=>{
  const calls=[];
  const io={fs:{stat:async path=>{if(!path.endsWith('package.json'))throw Object.assign(new Error('missing'),{code:'ENOENT'});}},log:()=>{},
    run:async(command,args,options)=>{calls.push({command,args,options});const i=args.indexOf('skills@1.7.0');
      return {stdout:i>=0&&args[i+1]==='list'?JSON.stringify({skills:[{name:'qa-browser-jev',path:'/tmp/qa-browser-jev'}]}):''};}};
  const r=await runInstall({scope:'global',agents:['codex'],skipDeps:false},io);
  const a=calls[0].args.indexOf('skills@1.7.0'),l=calls[1].args.indexOf('skills@1.7.0'),n=calls[2].args.indexOf('ci');
  assert.deepEqual(calls[0].args.slice(a,a+5),['skills@1.7.0','add',calls[0].args[a+2],'--skill','qa-browser-jev']);
  assert.equal(calls[0].args.includes('--global'),true);assert.equal(calls[0].args.includes('--agent'),true);
  assert.deepEqual(calls[1].args.slice(l),['skills@1.7.0','list','--json','--global']);
  assert.deepEqual(calls[2].args.slice(n),['ci','--omit=dev','--ignore-scripts','--workspaces=false']);
  assert.deepEqual(r.installedDirs,[resolve('/tmp/qa-browser-jev')]);assert.deepEqual(r.dependencyDirs,[resolve('/tmp/qa-browser-jev')]);
});
test('main prints help without running external commands',async()=>{
  const logs=[];await main(['--help'],{log:v=>logs.push(v),run:async()=>assert.fail('should not run commands')});
  assert.match(logs.join('\n'),/Browser QA skill installer/);
});
