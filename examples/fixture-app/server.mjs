/** Servidor sintético sem dependências, sem segredos e sem acesso externo. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export async function createFixtureServer(){
  const html=await readFile(new URL('./index.html',import.meta.url));
  const source=await readFile(fileURLToPath(import.meta.url));
  const sourceDigest=createHash('sha256').update(html).update(source).digest('hex');
  const identity={revision:'synthetic-fixture-v2',sourceDigest,buildId:'fixture-'+sourceDigest.slice(0,16)};
  const server=createServer((req,res)=>{
    const path=new URL(req.url,'http://127.0.0.1').pathname;
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(req.method!=='GET'){res.writeHead(405);res.end('Method not allowed');return;}
    if(path==='/__qa/build'){res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(identity));return;}
    if(['/','/broken-state','/broken-layout'].includes(path)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;}
    res.writeHead(404);res.end('Not found');
  });
  return {server,identity};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const port=Number(process.env.PORT??4173);
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT inválida');
  const {server}=await createFixtureServer();
  server.listen(port,'127.0.0.1',()=>console.log('Fixture local: http://127.0.0.1:'+server.address().port));
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
}
