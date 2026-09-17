#!/usr/bin/env node
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { SKILL_DIR } from './project.mjs';
const files=(await readdir(resolve(SKILL_DIR,'tests'))).filter(x=>x.endsWith('.test.mjs')).sort().map(x=>resolve(SKILL_DIR,'tests',x));
const r=spawnSync(process.execPath,['--test',...files],{stdio:'inherit',shell:false});
process.exitCode=r.status??1;
