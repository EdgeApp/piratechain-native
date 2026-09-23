import { execFile } from 'child_process'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export const repoRoot = join(__dirname, '../..')
export const tmpPath = join(repoRoot, 'tmp')

/** The upstream revision every target is built from. */
export const pirateRepo =
  'https://github.com/PirateNetwork/Pirate-Unified-Light-Wallet.git'
export const pirateTag = 'v1.2.3'
export const pirateHash = '73560800f0d3c73a0de7932c4cf1e7e2222228d1'

/**
 * Bump this whenever the checkout or patch steps below change, or a cached
 * clone is reused with the old tree. The tag alone does not capture that.
 */
export const pirateCacheTag = `${pirateHash}-1`

export async function run(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    cwd: opts.cwd ?? repoRoot,
    env: opts.env ?? process.env,
    maxBuffer: 1 << 28
  })
  return stdout
}

/** Streams a long build to the console instead of buffering it. */
export function runLoud(
  command: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { spawn } = require('child_process')
    const child = spawn(command, args, {
      cwd: opts.cwd ?? repoRoot,
      env: opts.env ?? process.env,
      stdio: 'inherit'
    })
    child.on('error', reject)
    child.on('exit', (code: number) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${String(code)}`))
    })
  })
}

async function readStatus(name: string): Promise<string | undefined> {
  const path = join(tmpPath, 'status', `${name}.txt`)
  if (!existsSync(path)) return undefined
  return (await readFile(path, 'utf8')).trim()
}

async function writeStatus(name: string, tag: string): Promise<void> {
  await mkdir(join(tmpPath, 'status'), { recursive: true })
  await writeFile(join(tmpPath, 'status', `${name}.txt`), tag, 'utf8')
}

/** Runs `body` unless a previous run already recorded this cache tag. */
export async function cached(
  name: string,
  tag: string,
  body: () => Promise<void>
): Promise<void> {
  if ((await readStatus(name)) === tag) {
    console.log(`${name}: cached`)
    return
  }
  await body()
  await writeStatus(name, tag)
}

/**
 * Clones the Pirate SDK and checks out the pinned revision.
 *
 * Every target builds from this one tree, so the Node addon, the iOS
 * xcframework and the Android jniLibs cannot drift against each other.
 */
export async function getPirateSource(): Promise<string> {
  const path = join(tmpPath, 'pirate')
  await cached('pirate.clone', pirateCacheTag, async () => {
    await mkdir(tmpPath, { recursive: true })
    if (!existsSync(path)) {
      console.log(`Cloning Pirate SDK at ${pirateTag}...`)
      await runLoud(
        'git',
        ['clone', '--branch', pirateTag, '--depth', '1', pirateRepo, 'pirate'],
        { cwd: tmpPath }
      )
    }
    const head = (await run('git', ['rev-parse', 'HEAD'], { cwd: path })).trim()
    if (head !== pirateHash) {
      throw new Error(
        `Pirate SDK checkout is ${head}, expected ${pirateHash} (${pirateTag})`
      )
    }
  })
  return path
}
