import esbuild from 'esbuild';
import fs from 'fs';

const externalDependencies = [];

// Prepend the shebang
const shebang = '#!/usr/bin/env node\n';

esbuild
  .build({
    entryPoints: ['src/cli.ts'],
    bundle: true,
    outfile: 'dist/cli.js',
    platform: 'node',
    format: 'esm',
    target: 'node20',
    external: externalDependencies,
    packages: 'external',
    metafile: true,
    banner: {
      js: shebang // Add the shebang line to the output
    }
  })
  .then(result => {
    fs.writeFileSync(
      new URL('./dist/metafile.json', import.meta.url),
      JSON.stringify(result.metafile, null, 2),
      'utf-8'
    );
  })
  .catch(err => {
    console.error('esbuild failed:', err);
    process.exit(1);
  });

console.log('esbuild build complete for CLI.');
