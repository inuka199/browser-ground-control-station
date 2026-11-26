import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const gameRoutes = ['/simulator', '/garage', '/challenges'];
const icons = ['icon-192.png', 'icon-512.png', 'maskable-512.png'];
export default function simulatorPwa() {
  return {
    name: 'offline-simulator',
    apply: 'build',
    async writeBundle({ dir }) {
      const manifest = JSON.parse(await readFile(resolve(dir, '.vite/manifest.json'), 'utf8'));
      // Static hosts can serve a direct home-screen launch without an SPA rewrite.
      const html = await readFile(resolve(dir, 'index.html'));
      for (const route of gameRoutes) {
        const folder = resolve(dir, route.slice(1));
        await mkdir(folder, {recursive: true});
        await writeFile(resolve(folder, 'index.html'), html);
      }
      const roots = ['index.html', 'src/components/simulator/SimulatorPage.jsx',
        'src/components/simulator/DroneGarage.jsx', 'src/components/views/ChallengesView.jsx'];
      const files = new Set(['favicon.svg', 'simulator-pwa/flight.webmanifest',
        ...icons.map(name => 'simulator-pwa/' + name)]);
      const visited = new Set();
      function add(key) {
        if (visited.has(key)) return;
        visited.add(key);
        const chunk = manifest[key];
        if (!chunk) throw new Error('Missing simulator build entry ' + key);
        [chunk.file, ...(chunk.css || []), ...(chunk.assets || [])].forEach(file => files.add(file));
        (chunk.imports || []).forEach(add);
      }
      roots.forEach(add);
      const hashes = {};
      for (const file of [...files].sort()) {
        const bytes = await readFile(resolve(dir, file));
        hashes['/' + file] = 'sha256-' + createHash('sha256').update(bytes).digest('base64');
      }
      const template = await readFile(new URL('./simulator-worker.template.js', import.meta.url), 'utf8');
      const revision = createHash('sha256').update(template + JSON.stringify([hashes, gameRoutes])).update(html).digest('hex').slice(0, 20);
      await writeFile(resolve(dir, 'simulator-worker.js'), template
        .replace('__REVISION__', revision).replace('__FILES__', JSON.stringify(hashes))
        .replace('__ROUTES__', JSON.stringify(gameRoutes))
        .replace('__OFFLINE_HTML__', () => JSON.stringify(html.toString('utf8'))));
    }
  };
}
