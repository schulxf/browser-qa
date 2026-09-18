/** Sole browser controller: documented agent-browser CLI, argv arrays, no shell or second CDP client. */
import { execFile } from 'node:child_process';
import { demand, QaError } from './jev-core.mjs';
import { normalizeObservation } from './navigation-core.mjs';

export function browserEnvironment(env = process.env) {
  // Do not inherit Gateway keys, attach/profile flags, plugins, or application secrets.
  const allowed = ['PATH','Path','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SYSTEMROOT','SystemRoot',
    'WINDIR','COMSPEC','TEMP','TMP','TMPDIR','LANG','LC_ALL','DISPLAY','WAYLAND_DISPLAY','XDG_RUNTIME_DIR'];
  return Object.fromEntries(allowed.filter(k=>typeof env[k] === 'string').map(k=>[k,env[k]]));
}

export function runBrowserProcess(command, args, { cwd, env = browserEnvironment(), timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command,args,{cwd,env,encoding:'utf8',shell:false,windowsHide:true,timeout,maxBuffer:256*1024},(error,stdout)=> {
      if (error) return reject(new QaError(error.killed ? 'NAV_BROWSER_TIMEOUT_OUTCOME_UNKNOWN' : 'NAV_BROWSER_COMMAND_FAILED'));
      resolve(stdout);
    });
  });
}

export class NavigationBrowser {
  constructor({command,session,configPath,cwd,origins,run = runBrowserProcess}) {
    this.command = command; this.session = session; this.cwd = cwd; this.origins = origins; this.run = run;
    this.prefix = ['--config',configPath,'--session',session,'--json'];
    this.calls = 0;
  }
  async checkVersion() {
    const version = await this.run(this.command,['--version'],{cwd:this.cwd});
    const help = await this.run(this.command,['--help'],{cwd:this.cwd});
    demand(['--config','--session','--json','--allowed-domains','--action-policy'].every(flag=>help.includes(flag)), 'NAV_BROWSER_CAPABILITIES');
    const parsed = version.match(/\b\d+\.\d+\.\d+(?:-[\w.-]+)?\b/)?.[0];
    demand(parsed,'NAV_BROWSER_VERSION');
    return parsed;
  }
  async call(args) {
    this.calls++;
    let reply;
    try { reply = JSON.parse(await this.run(this.command,[...this.prefix,...args],{cwd:this.cwd})); }
    catch (e) { throw e instanceof QaError ? e : new QaError('NAV_BROWSER_PROTOCOL'); }
    demand(reply?.success === true && reply.data !== undefined,'NAV_BROWSER_REJECTED');
    return reply.data;
  }
  async url() {
    const data = await this.call(['get','url']);
    const value = typeof data === 'string' ? data : data?.url;
    demand(typeof value === 'string','NAV_BROWSER_URL_PROTOCOL');
    return value;
  }
  async observe() {
    const before = await this.url();
    const data = await this.call(['snapshot']);
    const after = await this.url();
    demand(before === after,'NAV_PAGE_CHANGED_DURING_SNAPSHOT');
    return normalizeObservation({url:after,snapshot:data.snapshot,refs:data.refs},this.origins);
  }
  async act(args) {
    demand(['click','fill'].includes(args[0]) && /^@e\d+$/.test(args[1]) &&
      args.length === (args[0] === 'fill' ? 3 : 2), 'NAV_COMMAND_NOT_ALLOWED');
    for (const check of ['visible','enabled']) {
      const data = await this.call(['is',check,args[1]]);
      const value = typeof data === 'boolean' ? data : Object.hasOwn(data ?? {},check) ? data[check] : data?.result;
      demand(value === true, 'NAV_TARGET_NOT_ACTIONABLE');
    }
    await this.call(args);
  }
  async screenshot(file) { await this.call(['screenshot',file]); }
}
