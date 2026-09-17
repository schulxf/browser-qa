#!/usr/bin/env node
/** Emite metadados de UM arquivo existente. Não inventa assertions nem inspeção visual. */
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { safeRelative, inside } from './project.mjs';
const [rootArg,path,kind,...rest]=process.argv.slice(2);
try{
  if(rest.length||!rootArg||!safeRelative(path)||!['screenshot','snapshot','assertion','visual-review','trace','log'].includes(kind))throw new Error();
  const root=await realpath(rootArg),target=await realpath(resolve(root,path));
  if(!inside(root,target))throw new Error();const s=await stat(target);
  if(!s.isFile()||s.size<=0||s.size>50*1024*1024)throw new Error();
  const sha256=createHash('sha256').update(await readFile(target)).digest('hex');
  console.log(JSON.stringify({kind,path,sha256},null,2));
}catch{console.error(JSON.stringify({status:'BLOCKED',code:'INVALID_EVIDENCE',usage:'node evidence.mjs <run-dir> <relative-file> <kind>'}));process.exitCode=2;}
