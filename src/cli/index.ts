import{ createApp } from '../server/index.js';
import { createServer } from 'http';
import { parseArgs } from 'util';
import open from 'open';

const DEFAULT_PORT = 3456;
const MAX_PORT_ATTEMPTS = 20;

async function startServer(port:number, noOpen: boolean): Promise<void> {
  const app = createApp();
  const server = createServer(app);
  const startPort = port;

  return new Promise((resolve, reject) => {
    server.on('error', (err: NodeJS.ErrnoException) =>{
      if (err.code === 'EADDRINUSE') {
        if (port < startPort + MAX_PORT_ATTEMPTS) {
          server.listen(++port);
        } else {
          reject(new Error('No available port found'));
        }
      } else {
reject(err);
      }
    });

    server.listen(port, () => {
      console.log(`TokenLens running at http://localhost:${port}`);
      console.log(`API: http://localhost:${port}/api/health`);

      if (!noOpen) {
        open(`http://localhost:${port}`).catch(() => {
          console.log(`Open http://localhost:${port} in your browser`);
        });
      }
    });
  });
}

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', short: 'p' },
      'no-open': { type: 'boolean', default: false },
      version: { type: 'boolean', default: false },
    },
  });

  if (values.version) {
    console.log('tokenlens 0.1.5');
    return;
}

  const port = values.port ? parseInt(values.port, 10) : DEFAULT_PORT;
  const noOpen = values['no-open'] ?? false;

  try {
    await startServer(port, noOpen);
  } catch (err) {
console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
