// Optional read-only visual comparison server. Uses the pinned original procedure
// sources without changing the working tree. Normal authentication is required.
// Run from frontend: node scripts/procedure-baseline-server.mjs
import path from 'node:path';
import { createServer } from 'vite';
import { files, root, at } from './procedure-migration-lib.mjs';

const originals = new Map(files.map(p => [path.resolve(root, p).replaceAll('\\', '/'), at(p)]));
const server = await createServer({
  configFile: path.join(root, 'frontend/vite.config.ts'),
  server: { port: 5174, strictPort: true, host: 'localhost' },
  plugins: [{
    name: 'procedure-migration-baseline',
    enforce: 'pre',
    load(id) {
      const [filename, query] = id.split('?');
      if (filename.endsWith('.vue') && query) return null;
      return originals.get(filename) ?? null;
    },
  }],
});
await server.listen();
server.printUrls();
