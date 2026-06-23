import { cpSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// TODO also update: vuejs, ndesmic-zip, postal-mime

const __dirname = dirname(fileURLToPath(import.meta.url));
const vendorDir = resolve(__dirname, 'js/vendor');

const sources = [
  { from: '../HyperFrameset/HyperFrameset.js', to: 'HyperFrameset.js' },
  { from: '../HyperFrameset/behaviors.js', to: 'behaviors.js' },
];

for (const { from, to } of sources) {
  const src = resolve(__dirname, from);
  const dest = resolve(vendorDir, to);
  if (!existsSync(src)) {
    console.warn(`SKIP ${from} (not found)`);
    continue;
  }
  cpSync(src, dest);
  console.log(`${from} -> js/vendor/${to}`);
}
