#!/usr/bin/env node
/** Associate an existing file with measured metadata. Never fabricates a verdict. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { safeRelative, inside, validateConfig } from './project.mjs';
import { validatePng, validateCapture } from './png-evidence.mjs';
const [rootArg,path,kind,...rest]=process.argv.slice(2);
try {
  if(!rootArg||!safeRelative(path)||!['screenshot','snapshot','assertion','visual-review','independent-review','trace','log'].includes(kind))throw new Error();
  if(kind==='screenshot' ? rest.length!==2||rest[0]!=='--capture' : rest.length)throw new Error();
  const root=await realpath(rootArg),target=await realpath(resolve(root,path));
  if(!inside(root,target))throw new Error();const info=await stat(target);
  if(!info.isFile()||info.size<=0||info.size>50*1024*1024)throw new Error();
  const bytes=await readFile(target);const out={kind,path,sha256:createHash('sha256').update(bytes).digest('hex')};
  if(kind==='screenshot') {
    const captureRaw=await readFile(rest[1],'utf8');if(Buffer.byteLength(captureRaw)>16000)throw new Error();
    const capture=JSON.parse(captureRaw);
    const contract=JSON.parse(await readFile(resolve(root,'contract.json'),'utf8'));
    const config=validateConfig(JSON.parse(await readFile(resolve(root,'config.snapshot.json'),'utf8')));
    const caseSpec=contract.cases.find(c=>c.id===capture.caseId);if(!caseSpec)throw new Error();
    validateCapture(capture,validatePng(bytes),{contract,caseSpec,config});out.capture=capture;
  }
  console.log(JSON.stringify(out,null,2));
} catch {
  console.error(JSON.stringify({status:'BLOCKED',code:'INVALID_EVIDENCE',usage:'node evidence.mjs RUN_DIR RELATIVE_FILE KIND [--capture CAPTURE.json]'}));process.exitCode=2;
}
