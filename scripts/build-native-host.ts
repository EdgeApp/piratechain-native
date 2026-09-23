// Run as `node -r sucrase/register ./scripts/build-native-host.ts`
//
// Builds the pinned Pirate core for the host, then the Node addon against it,
// and drops the result in prebuilds/<platform>-<arch>/piratechain.node.

import { copyFile, mkdir } from 'fs/promises'
import { join } from 'path'

import {
  cached,
  getPirateSource,
  pirateCacheTag,
  repoRoot,
  runLoud
} from './utils/common'

/** Node's own names for this machine, which load-addon.js resolves against. */
const hostDir = `${process.platform}-${process.arch}`

/** The Rust target triple matching that. */
function hostTriple(): string {
  const table: { [key: string]: string } = {
    'darwin-arm64': 'aarch64-apple-darwin',
    'darwin-x64': 'x86_64-apple-darwin',
    'linux-x64': 'x86_64-unknown-linux-gnu',
    'linux-arm64': 'aarch64-unknown-linux-gnu'
  }
  const triple = table[hostDir]
  if (triple == null) {
    throw new Error(`No Rust target known for ${hostDir}`)
  }
  return triple
}

async function main(): Promise<void> {
  const triple = hostTriple()
  const pirate = await getPirateSource()

  // 1. The Pirate core, as a static library the addon links.
  await cached(`pirate.build.${triple}`, pirateCacheTag, async () => {
    console.log(`Building pirate-ffi-native for ${triple}...`)
    await runLoud(
      'cargo',
      ['build', '--release', '--package', 'pirate-ffi-native', '--target', triple],
      { cwd: join(pirate, 'crates') }
    )
  })

  const libDir = join(pirate, 'crates', 'target', triple, 'release')

  // 2. The addon, linked against it.
  console.log('Building the Node addon...')
  await runLoud(
    'cargo',
    ['build', '--release', '--target', triple],
    {
      cwd: join(repoRoot, 'rust'),
      env: { ...process.env, PIRATE_FFI_LIB_DIR: libDir }
    }
  )

  // 3. Publish it where load-addon.js looks.
  const outDir = join(repoRoot, 'prebuilds', hostDir)
  await mkdir(outDir, { recursive: true })
  await copyFile(
    join(repoRoot, 'rust', 'target', triple, 'release', 'libpiratechain_native_addon.dylib'),
    join(outDir, 'piratechain.node')
  )
  console.log(`Wrote prebuilds/${hostDir}/piratechain.node`)
}

main().catch((error: unknown) => {
  console.error(String(error))
  process.exit(1)
})
