#!/usr/bin/env node
/** Offline prerequisite check. Never prints key values or browser output. */
import { diagnose } from './diagnostics.mjs';
const args=process.argv.slice(2);
if(args.includes('--help')){console.log('node scripts/doctor.mjs [--project APP]');process.exit(0);}
try {
  if(args.length&&!(args.length===2&&args[0]==='--project'))throw new Error('ARGUMENTS');
  const report=await diagnose({project:args[1]});
  console.log(JSON.stringify(report,null,2));process.exitCode=report.status==='READY'?0:2;
}catch{console.error(JSON.stringify({status:'BLOCKED',code:'CONFIG_OR_ARGUMENT_ERROR'}));process.exitCode=2;}
