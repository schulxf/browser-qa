#!/usr/bin/env node
import { chmod, lstat, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import process from 'node:process';
import { defaultCredentialsFile } from '../skills/qa-browser-jev/scripts/credentials.mjs';
import { diagnose } from '../skills/qa-browser-jev/scripts/diagnostics.mjs';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_NAME = 'qa-browser-jev';
const SKILLS_CLI = 'skills@1.7.0';
const PACKAGE_JSON = join(PACKAGE_ROOT, 'package.json');

const HELP = `Browser QA skill installer

Usage:
  browser-qa [install]
  browser-qa configure
  browser-qa doctor
  browser-qa --help
  browser-qa --version

Install options:
  --scope <project|global>     Select project or user-global installation
  --agent <name>               Agent target; repeat or comma-separate values
  --agents <names>             Alias for --agent with comma-separated values
  --skip-deps                  Skip npm install inside installed skill copies
  --skip-config                Do not offer Gateway credential configuration
  --copy                       Copy instead of symlinking through the skills CLI
  --yes                        Skip installer confirmations (requires --agent)
  --dry-run                    Print planned external commands only

Configure options:
  --gateway-key-stdin          Read AI_GATEWAY_API_KEY from stdin or env format
  --config-dir <path>          Override the private config directory

Credentials are read from a masked prompt or stdin. API keys are never accepted as
command-line arguments.`;

export function parseArgs(argv) {
  const args = [...argv];
  const options = { command: 'install', agents: [] };
  const commands = new Set(['install', 'configure', 'doctor', 'help']);
  if (args[0] && commands.has(args[0])) options.command = args.shift();

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version' || arg === '-v') options.version = true;
    else if (arg === '--skip-deps') options.skipDeps = true;
    else if (arg === '--skip-config') options.skipConfig = true;
    else if (arg === '--copy') options.copy = true;
    else if (arg === '--yes' || arg === '-y') options.yes = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--from-stdin' || arg === '--gateway-key-stdin') options.fromStdin = true;
    else if (arg === '--scope') {
      options.scope = readOptionValue(args, ++i, arg);
    } else if (arg === '--agent' || arg === '--agents') {
      options.agents.push(...splitAgents(readOptionValue(args, ++i, arg)));
    } else if (arg === '--config-dir') {
      options.configDir = readOptionValue(args, ++i, arg);
    } else if (arg.startsWith('--api-key')) {
      throw new Error('API keys must be provided by masked prompt or --from-stdin, never as command-line arguments.');
    } else {
      throw new Error('Unknown argument. Run --help.');
    }
  }

  if (options.scope && !['project', 'global'].includes(options.scope)) {
    throw new Error('--scope must be "project" or "global".');
  }
  options.agents = [...new Set(options.agents.filter(Boolean))];
  if (options.agents.some(agent => !/^[a-z0-9][a-z0-9-]*$/.test(agent))) {
    throw new Error('Agent names may contain only lowercase letters, digits, and hyphens.');
  }
  return options;
}

function readOptionValue(args, index, flag) {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
  return value;
}

function splitAgents(value) {
  return value.split(',').map(agent => agent.trim()).filter(Boolean);
}

export function packageRoot() {
  return PACKAGE_ROOT;
}

export function skillsCommandArgs(command, { source = PACKAGE_ROOT, scope, agents = [], yes = false, copy = false } = {}) {
  const args = [SKILLS_CLI, command];
  if (command === 'add') {
    args.push(source, '--skill', SKILL_NAME);
    if (scope === 'global') args.push('--global');
    for (const agent of agents) args.push('--agent', agent);
    if (copy) args.push('--copy');
    if (yes) args.push('--yes');
  }
  if (command === 'list') {
    args.push('--json');
    if (scope === 'global') args.push('--global');
  }
  return args;
}

export function configDir(env = process.env, platform = process.platform) {
  return dirname(defaultCredentialsFile(env, platform));
}

export function credentialsPath(directory) {
  return join(directory, 'credentials.env');
}

export function parseCredentialInput(text) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('{')) {
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch { throw new Error('Invalid credential input.'); }
    return String(parsed.AI_GATEWAY_API_KEY || parsed.aiGatewayApiKey || '').trim();
  }
  const match = /^AI_GATEWAY_API_KEY=(.*)$/m.exec(trimmed);
  return (match ? match[1] : trimmed).trim().replace(/^['"]|['"]$/g, '');
}

export async function writeCredentials(apiKey, { directory, fs = { mkdir, writeFile, chmod, lstat } } = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('AI_GATEWAY_API_KEY was empty.');
  if (key.length > 8192 || /[\r\n\0]/.test(key)) throw new Error('AI_GATEWAY_API_KEY contains invalid control characters.');
  const file = defaultCredentialsFile(process.env, process.platform, { directory });
  await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 });
  if (fs.lstat) {
    try {
      const existing = await fs.lstat(file);
      if (existing.isSymbolicLink?.() || (existing.isFile && !existing.isFile())) throw new Error('Credential path must be a regular file.');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  await fs.writeFile(file, `AI_GATEWAY_API_KEY=${key}\n`, { mode: 0o600, flag: 'w' });
  await fs.chmod(file, 0o600).catch(error => {
    if (process.platform !== 'win32') throw error;
  });
  return file;
}

export async function discoverInstalledSkillDirs(listJson, skillName = SKILL_NAME) {
  const parsed = JSON.parse(listJson);
  const candidates = Array.isArray(parsed) ? parsed : parsed.skills || parsed.installed || parsed.items || [];
  return candidates
    .filter(item => item?.name === skillName || item?.id === skillName || item?.skill === skillName || item?.path?.endsWith(skillName))
    .map(item => item.path || item.dir || item.directory || item.location || item.installPath)
    .filter(Boolean)
    .map(path => path === '~' ? homedir() : path.startsWith('~/') || path.startsWith('~\\') ? join(homedir(), path.slice(2)) : resolve(path))
    .filter((path, index, all) => all.indexOf(path) === index);
}

export async function existingPackageDirs(paths, fs = { stat }) {
  const out = [];
  for (const dir of paths) {
    try {
      await fs.stat(join(dir, 'package.json'));
      out.push(dir);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return out;
}

export function packageManagerCommand(name, platform = process.platform) {
  if (platform !== 'win32') return { command: name, prefixArgs: [] };
  const candidates = [];
  if (process.env.npm_execpath) candidates.push(join(dirname(process.env.npm_execpath), `${name}-cli.js`));
  candidates.push(join(dirname(process.execPath), 'node_modules', 'npm', 'bin', `${name}-cli.js`));
  const cli = candidates.find(existsSync);
  if (!cli) throw new Error(`Cannot locate ${name}-cli.js. Install a standard Node.js distribution or add ${name} to PATH.`);
  return { command: process.execPath, prefixArgs: [cli] };
}

export async function runInstall(options, io = defaultIo()) {
  const npx = packageManagerCommand('npx');
  const npm = packageManagerCommand('npm');
  let scope = options.scope;
  if (!scope && io.isTty && io.readLine && !options.yes) {
    const answer = (await io.readLine('Install scope — project or global? [project] ')).trim().toLowerCase();
    scope = answer === 'global' || answer === 'g' ? 'global' : 'project';
  }
  scope ||= 'project';
  if (options.yes && !options.agents.length) throw new Error('--yes requires at least one --agent target.');
  const addArgs = skillsCommandArgs('add', { scope, agents: options.agents, yes: options.yes, copy: options.copy });
  const listArgs = skillsCommandArgs('list', { scope });

  io.log(`Installing ${SKILL_NAME} with ${SKILLS_CLI} from ${PACKAGE_ROOT}`);
  if (options.dryRun) {
    io.log([npx.command, ...npx.prefixArgs, ...addArgs].join(' '));
    io.log([npx.command, ...npx.prefixArgs, ...listArgs].join(' '));
    return { scope, installedDirs: [], dependencyDirs: [] };
  }

  await io.run(npx.command, [...npx.prefixArgs, ...addArgs], { stdio: 'inherit' });
  const list = await io.run(npx.command, [...npx.prefixArgs, ...listArgs], { stdio: 'pipe' });
  const installedDirs = await discoverInstalledSkillDirs(list.stdout || '');
  if (!installedDirs.length) throw new Error('Installation unverified: no installed skill directory was found.');
  const packages = await existingPackageDirs(installedDirs, io.fs);
  if (packages.length !== installedDirs.length) throw new Error('Installation incomplete: installed skill package.json is missing.');
  const dependencyDirs = options.skipDeps ? [] : await existingPackageDirs(installedDirs, io.fs);
  for (const dir of dependencyDirs) {
    await io.run(npm.command, [...npm.prefixArgs, 'ci', '--omit=dev', '--ignore-scripts', '--workspaces=false'], { cwd: dir, stdio: 'inherit' });
  }
  io.log(`Installed skill copies: ${installedDirs.length || 'not reported by skills list'}`);
  if (!options.skipConfig) {
    if (io.isTty && io.readLine) {
      const answer = (await io.readLine('Configure AI_GATEWAY_API_KEY now? [Y/n] ')).trim().toLowerCase();
      if (answer !== 'n' && answer !== 'no') await runConfigure(options, io);
    } else {
      io.log('Credential not configured in non-interactive mode. Run `browser-qa configure`.');
    }
  }
  const status = options.skipDeps ? 'INSTALLED_DEPENDENCIES_SKIPPED' : 'INSTALLED';
  io.log(`Status: ${status}. Run the installed scripts/doctor.mjs before QA; no live validation has run.`);
  return { status, scope, installedDirs, dependencyDirs };
}

export async function runConfigure(options, io = defaultIo()) {
  const directory = options.configDir ? resolve(options.configDir) : undefined;
  const input = options.fromStdin || !io.isTty ? await io.readStdin() : await io.readSecret('AI_GATEWAY_API_KEY');
  const apiKey = parseCredentialInput(input);
  const file = await writeCredentials(apiKey, { directory, fs: io.fs });
  io.log(`Saved AI Gateway credentials to ${file}`);
  if (options.configDir) io.log(`For future processes, set BROWSER_QA_ENV_FILE to ${file}. The command-line override is not persisted.`);
  else io.log('Helpers use this same resolved file unless AI_GATEWAY_API_KEY overrides it.');
  return file;
}

export async function runDoctor(io = defaultIo(), options = {}) {
  const npx = packageManagerCommand('npx');
  const directories = new Set();
  const failures = [];
  for (const scope of options.scope ? [options.scope] : ['project', 'global']) {
    try {
      const list = await io.run(npx.command, [...npx.prefixArgs, ...skillsCommandArgs('list', { scope })], { stdio: 'pipe' });
      for (const path of await discoverInstalledSkillDirs(list.stdout || '')) directories.add(path);
    } catch { failures.push(`INSTALLATION_DISCOVERY_${scope.toUpperCase()}`); }
  }
  if (!directories.size) failures.push('NO_INSTALLED_SKILL_FOUND');
  const checks = [];
  for (const skillDir of directories) {
    const check = await (io.diagnose || diagnose)({ skillDir });
    checks.push(check);
    if (check.status !== 'READY') failures.push('INSTALLED_SKILL_NOT_READY');
  }
  const report = { status: failures.length ? 'BLOCKED' : 'READY', scope: 'offline-prerequisites-only', blockers: failures, checks };
  io.log(JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 2;
  return report;
}

export async function version() {
  const pkg = JSON.parse(await readFile(PACKAGE_JSON, 'utf8'));
  return pkg.version;
}

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const options = parseArgs(argv);
  if (options.help || options.command === 'help') {
    io.log(HELP);
    return;
  }
  if (options.version) {
    io.log(await version());
    return;
  }
  if (options.command === 'configure') {
    await runConfigure(options, io);
  } else if (options.command === 'doctor') {
    await runDoctor(io, options);
  } else {
    await runInstall(options, io);
  }
}

function defaultIo() {
  return {
    fs: { mkdir, stat, writeFile, chmod, lstat },
    isTty: Boolean(process.stdin.isTTY && process.stdout.isTTY),
    log: message => console.log(message),
    readLine: async prompt => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try { return await rl.question(prompt); } finally { rl.close(); }
    },
    readStdin: () => new Promise((resolveRead, reject) => {
      let body = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', chunk => { body += chunk; });
      process.stdin.on('error', reject);
      process.stdin.on('end', () => resolveRead(body));
    }),
    readSecret: promptSecret,
    run: runProcess,
  };
}

async function promptSecret(label) {
  process.stdout.write(`${label}: `);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  let value = '';
  try {
    for await (const chunk of process.stdin) {
      for (const char of chunk.toString('utf8')) {
        const code = char.charCodeAt(0);
        if (char === '\r' || char === '\n') {
          process.stdout.write('\n');
          return value;
        }
        if (code === 3) throw new Error('Cancelled.');
        if (code === 8 || code === 127) {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (code >= 32) {
          value += char;
          process.stdout.write('*');
        }
      }
    }
  } finally {
    process.stdin.setRawMode?.(false);
    process.stdin.pause();
  }
  return value;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio || 'pipe',
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', chunk => { stdout += chunk; });
    child.stderr?.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolveRun({ stdout, stderr, code });
      else reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code}`));
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
