import * as esbuild from 'esbuild'

const config = {
  entryPoints: ['src/adapters/cli/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile: 'dist/cli.js',
  packages: 'external',
}

const watch = process.argv.includes('--watch')

if (watch) {
  const ctx = await esbuild.context(config)
  await ctx.watch()
  console.log('Watching for changes...')
} else {
  await esbuild.build(config)
  console.log('Build complete: dist/cli.js')
}
