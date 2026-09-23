'use strict'

const { randomBytes } = require('crypto')
const { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const {
  PirateWalletSdk,
  PirateWalletSynchronizer,
  PirateWalletAdvancedKeyManagement
} = require('./index.js')
const { loadAddon } = require('./load-addon.js')

const PASSPHRASE_FILE = '.registry-passphrase'
const PASSPHRASE_BYTES = 32

/**
 * Mints or reads the registry passphrase for one account.
 *
 * The wallet registry is encrypted under this value, and
 * `configure_wallet_storage` requires it on every call. On device the native
 * module keeps it in the iOS Keychain or the Android Keystore and never returns
 * it to JavaScript. Node has neither, so it lives in the account's own storage
 * directory with owner-only permissions, beside the wallet files it protects.
 *
 * It is keyed on the account id rather than on a path, because the caller
 * supplies an account id and usually no path at all.
 */
function resolvePassphrase(baseDir) {
  const passphrasePath = join(baseDir, PASSPHRASE_FILE)

  if (existsSync(passphrasePath)) {
    let stored
    try {
      stored = readFileSync(passphrasePath, 'utf8').trim()
    } catch (error) {
      // Minting a second passphrase here would silently produce a registry
      // that cannot decrypt the wallets already written under the first one.
      throw new Error(
        `piratechain-native: cannot read ${passphrasePath}: ${String(error)}`
      )
    }
    if (stored !== '') return stored
  }

  const minted = randomBytes(PASSPHRASE_BYTES).toString('base64')
  writeFileSync(passphrasePath, minted, { encoding: 'utf8', mode: 0o600 })
  chmodSync(passphrasePath, 0o600)
  return minted
}

/**
 * Builds the Node transport.
 *
 * The three methods match what the React Native bridge exposes, so the SDK
 * class above cannot tell the two runtimes apart. The two storage methods are
 * not pass-throughs: like the ObjC module, they compose the
 * `configure_wallet_storage` request themselves and hand back the envelope
 * string, which the SDK then parses.
 */
function makeNodeNativeModule(opts) {
  const { documentDirectory, addon = loadAddon() } = opts ?? {}
  if (typeof documentDirectory !== 'string' || documentDirectory === '') {
    throw new Error(
      'piratechain-native: makeNodeNativeModule requires a documentDirectory'
    )
  }

  const resolveBaseDir = (accountId, storagePath) => {
    if (typeof accountId !== 'string' || accountId.trim() === '') {
      throw new Error('piratechain-native: an accountId is required')
    }
    const baseDir =
      typeof storagePath === 'string' && storagePath !== ''
        ? storagePath
        : join(documentDirectory, accountId)
    mkdirSync(baseDir, { recursive: true })
    return baseDir
  }

  const configureStorage = (accountId, passphrase, storagePath) => {
    const baseDir = resolveBaseDir(accountId, storagePath)
    return addon.invoke(
      JSON.stringify({
        method: 'configure_wallet_storage',
        base_dir: baseDir,
        passphrase
      })
    )
  }

  return {
    invoke(requestJson, pretty = false) {
      return addon.invoke(requestJson, pretty)
    },

    configureAccountStorage(accountId, passphrase, storagePath) {
      return configureStorage(accountId, passphrase, storagePath)
    },

    configureSecureAccountStorage(accountId, storagePath) {
      const baseDir = resolveBaseDir(accountId, storagePath)
      return configureStorage(accountId, resolvePassphrase(baseDir), baseDir)
    }
  }
}

function createPirateWalletSdk(opts) {
  return new PirateWalletSdk(makeNodeNativeModule(opts))
}

module.exports = {
  PirateWalletSdk,
  PirateWalletSynchronizer,
  PirateWalletAdvancedKeyManagement,
  makeNodeNativeModule,
  createPirateWalletSdk
}
