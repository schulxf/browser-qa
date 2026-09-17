#!/usr/bin/env node
/** Fixture de conectividade textual, adaptada à configuração; não é observação do app. */
import { readConfig } from './project.mjs';
const args=process.argv.slice(2);
try{
  if(args.length!==2||args[0]!=='--project')throw new Error('USAGE');
  const {config}=await readConfig(args[1]);
  console.log(JSON.stringify({schemaVersion:1,mode:'assess',runId:'QA-CONNECTIVITY',scenarioId:'API-SMOKE',
    goal:'Verificar somente o contrato da API com evidência sintética.',environment:config.target.environment,
    dataClass:'synthetic',approvedBySupervisor:true,approvedOrigins:[new URL(config.target.baseUrl).origin],
    observation:{id:'fixture-1',url:config.target.baseUrl,capturedAt:new Date().toISOString(),
      snapshot:'FIXTURE SINTÉTICA. Nenhum navegador foi aberto.',refs:{}},
    criterion:'O exemplo fornecido informa explicitamente que o filtro escolhido é Categoria A.',
    evidence:'Resultado sintético: filtro escolhido = Categoria A.'},null,2));
}catch{console.error('Uso: node scripts/example-request.mjs --project <pasta-app>');process.exitCode=2;}
