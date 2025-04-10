import esbuild from 'esbuild';
import fs from 'fs';

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    outfile: 'dist/index.js',
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    metafile: true
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

console.log('esbuild build complete for engine.');
