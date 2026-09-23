// Run as `node -r sucrase/register ./scripts/smoke-node.ts`
//
// Proves the Node addon reaches the pinned Pirate core and speaks its protocol.

import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { loadAddon } from '../src/load-addon'
import { createPirateWalletSdk } from '../src/node'
import { pirateHash as PIRATE_HASH } from './utils/common'

/** A throwaway wallet. Never funded, never reused. */
const TEST_MNEMONIC =
  'item morning fan fringe image joy color cement soft parent athlete evil ' +
  'minute sauce wish cover round rebuild coconut finger target volcano nothing math'
const ACCOUNT_ID = 'edge-pirate-smoke'

async function main(): Promise<void> {
  const addon = loadAddon()

  const buildInfo = JSON.parse(
    await addon.invoke(JSON.stringify({ method: 'get_build_info' }))
  )
  if (buildInfo.ok !== true) {
    throw new Error(`get_build_info failed: ${JSON.stringify(buildInfo)}`)
  }
  console.log('build info:', JSON.stringify(buildInfo.result))
  if (buildInfo.result.git_commit !== PIRATE_HASH) {
    throw new Error(
      `addon reports core ${String(buildInfo.result.git_commit)}, expected ${PIRATE_HASH}`
    )
  }

  const mnemonic = JSON.parse(
    await addon.invoke(
      JSON.stringify({ method: 'generate_mnemonic', language: 'english' })
    )
  )
  if (mnemonic.ok !== true) {
    throw new Error(`generate_mnemonic failed: ${JSON.stringify(mnemonic)}`)
  }
  // `generate_mnemonic` answers with the phrase as a bare string result, not
  // an object — the service only wraps a result in fields when it has more
  // than one to report.
  const phrase: string = mnemonic.result
  if (typeof phrase !== 'string') {
    throw new Error(
      `generate_mnemonic returned ${typeof phrase}, expected a string`
    )
  }
  const words = phrase.trim().split(/\s+/)
  if (words.length !== 24) {
    throw new Error(`expected a 24-word mnemonic, got ${words.length}`)
  }
  console.log(`generated a ${words.length}-word mnemonic`)

  // The wallet path, through the SDK class rather than the raw addon: this is
  // what the Edge plugin actually drives.
  const documentDirectory = mkdtempSync(join(tmpdir(), 'piratechain-smoke-'))
  const sdk = createPirateWalletSdk({ documentDirectory })

  await sdk.configureSecureAccountStorage({ accountId: ACCOUNT_ID })
  console.log('configured secure storage at', join(documentDirectory, ACCOUNT_ID))

  const inspection = await sdk.inspectMnemonic(TEST_MNEMONIC)
  if (inspection.isValid !== true) {
    throw new Error(`test mnemonic rejected: ${JSON.stringify(inspection)}`)
  }
  console.log('mnemonic inspected:', inspection.detectedLanguage)

  console.log('smoke-node: all checks passed')
}

main().then(
  () => {
    // The wallet service keeps a process-wide tokio runtime alive, so an
    // explicit exit is what ends the process rather than a drained event loop.
    process.exit(0)
  },
  (error: unknown) => {
    console.error(String(error))
    process.exit(1)
  }
)
