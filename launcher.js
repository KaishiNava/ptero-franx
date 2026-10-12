const { spawn } = require('node:child_process');
const path = require('node:path');
const mode = process.argv[2] || 'start';
const root = __dirname;
const apiPort = String(process.env.API_PORT || 3001);
const webPort = String(process.env.PORT || 3000);
const isDev = mode === 'dev';
const children = [];

function launch(label, command, args, env = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  child.on('error', error => {
    console.error(`[${label}] gagal dijalankan: ${error.message}`);
    shutdown(1);
  });
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[${label}] berhenti (code=${code}, signal=${signal || '-'})`);
      shutdown(code || 1);
    }
  });
  children.push(child);
  return child;
}
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

launch('FRANXX API', process.execPath, [path.join(root, 'server.js')], { PORT: apiPort, API_PORT: apiPort });
const nextArgs = [path.join(root, 'next-server.js'), ...(isDev ? ['dev'] : ['start'])];
launch('Next.js', process.execPath, nextArgs, { PORT: webPort, API_PORT: apiPort });
console.log(`[FRANXX PTERO] Next.js :${webPort} | API internal :${apiPort}`);
