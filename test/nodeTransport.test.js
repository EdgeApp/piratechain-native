'use strict'

const { expect } = require('chai')
const { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, chmodSync } = require('fs')
const { tmpdir } = require('os')
const { join } = require('path')

const { makeNodeNativeModule, createPirateWalletSdk } = require('../src/node.js')
const { PirateWalletSdk } = require('../src/index.js')

const ACCOUNT = 'edge-pirate-device'

/** An addon stub that records requests and answers with an ack envelope. */
function makeFakeAddon() {
  const requests = []
  return {
    requests,
    invoke(requestJson) {
      requests.push(JSON.parse(requestJson))
      return Promise.resolve('{"ok":true,"result":{}}')
    }
  }
}

function makeModule() {
  const documentDirectory = mkdtempSync(join(tmpdir(), 'pcn-'))
  const addon = makeFakeAddon()
  return {
    documentDirectory,
    addon,
    native: makeNodeNativeModule({ documentDirectory, addon })
  }
}

describe('node storage transport', function () {
  it('derives the base directory from the document directory and account id', async function () {
    const { documentDirectory, addon, native } = makeModule()

    await native.configureSecureAccountStorage(ACCOUNT)

    expect(addon.requests).to.have.lengthOf(1)
    expect(addon.requests[0].method).to.equal('configure_wallet_storage')
    expect(addon.requests[0].base_dir).to.equal(join(documentDirectory, ACCOUNT))
    expect(statSync(join(documentDirectory, ACCOUNT)).isDirectory()).to.equal(true)
  })

  it('writes the passphrase file owner-only with 32 bytes of entropy', async function () {
    const { documentDirectory, native } = makeModule()

    await native.configureSecureAccountStorage(ACCOUNT)

    const path = join(documentDirectory, ACCOUNT, '.registry-passphrase')
    expect(statSync(path).mode & 0o777).to.equal(0o600)
    expect(Buffer.from(readFileSync(path, 'utf8'), 'base64')).to.have.lengthOf(32)
  })

  it('reuses the same passphrase on a second call', async function () {
    const { documentDirectory, addon, native } = makeModule()

    await native.configureSecureAccountStorage(ACCOUNT)
    const first = readFileSync(join(documentDirectory, ACCOUNT, '.registry-passphrase'), 'utf8')
    await native.configureSecureAccountStorage(ACCOUNT)
    const second = readFileSync(join(documentDirectory, ACCOUNT, '.registry-passphrase'), 'utf8')

    expect(second).to.equal(first)
    expect(addon.requests[1].passphrase).to.equal(addon.requests[0].passphrase)
  })

  it('gives different accounts different passphrases and directories', async function () {
    const { documentDirectory, addon, native } = makeModule()

    await native.configureSecureAccountStorage('account-a')
    await native.configureSecureAccountStorage('account-b')

    expect(addon.requests[0].passphrase).to.not.equal(addon.requests[1].passphrase)
    expect(addon.requests[0].base_dir).to.equal(join(documentDirectory, 'account-a'))
    expect(addon.requests[1].base_dir).to.equal(join(documentDirectory, 'account-b'))
  })

  it('uses an explicit storage path when the caller supplies one', async function () {
    const { addon, native } = makeModule()
    const explicit = mkdtempSync(join(tmpdir(), 'pcn-explicit-'))

    await native.configureSecureAccountStorage(ACCOUNT, explicit)

    expect(addon.requests[0].base_dir).to.equal(explicit)
  })

  it('does not return the passphrase to the caller', async function () {
    const { native } = makeModule()

    const response = await native.configureSecureAccountStorage(ACCOUNT)

    expect(response).to.be.a('string')
    expect(response).to.not.contain('passphrase')
  })

  it('fails rather than minting a second passphrase when the file is unreadable', async function () {
    const { documentDirectory, native } = makeModule()
    const dir = join(documentDirectory, ACCOUNT)
    require('fs').mkdirSync(dir, { recursive: true })
    const path = join(dir, '.registry-passphrase')
    writeFileSync(path, 'existing', 'utf8')
    chmodSync(path, 0o000)

    let caught
    try {
      await native.configureSecureAccountStorage(ACCOUNT)
    } catch (error) {
      caught = error
    } finally {
      chmodSync(path, 0o600)
    }

    expect(caught, 'expected a rejection').to.not.equal(undefined)
    expect(caught.message).to.contain('.registry-passphrase')
  })

  it('passes the caller passphrase through configureAccountStorage', async function () {
    const { documentDirectory, addon, native } = makeModule()

    await native.configureAccountStorage(ACCOUNT, 'caller-supplied')

    expect(addon.requests[0].passphrase).to.equal('caller-supplied')
    expect(addon.requests[0].base_dir).to.equal(join(documentDirectory, ACCOUNT))
  })

  it('returns the envelope as a string the SDK can parse', async function () {
    const { native } = makeModule()

    const response = await native.configureAccountStorage(ACCOUNT, 'x')

    expect(response).to.be.a('string')
    expect(() => JSON.parse(response)).to.not.throw()
  })

  it('forwards invoke verbatim', async function () {
    const { addon, native } = makeModule()

    await native.invoke(JSON.stringify({ method: 'get_build_info' }))

    expect(addon.requests[0]).to.deep.equal({ method: 'get_build_info' })
  })

  it('rejects an empty account id', function () {
    const { native } = makeModule()
    expect(() => native.configureSecureAccountStorage('  ')).to.throw(/accountId/)
  })

  it('requires a documentDirectory', function () {
    expect(() => makeNodeNativeModule({ addon: makeFakeAddon() })).to.throw(
      /documentDirectory/
    )
  })

  it('createPirateWalletSdk builds an SDK on the Node transport', function () {
    const documentDirectory = mkdtempSync(join(tmpdir(), 'pcn-sdk-'))
    const sdk = createPirateWalletSdk({
      documentDirectory,
      addon: makeFakeAddon()
    })
    expect(sdk).to.be.instanceOf(PirateWalletSdk)
  })

  it('never writes a mnemonic into the storage directory', async function () {
    const { documentDirectory, native } = makeModule()
    const phrase = 'item morning fan fringe image joy color cement soft parent athlete evil'

    await native.configureSecureAccountStorage(ACCOUNT)
    await native.invoke(JSON.stringify({ method: 'restore_wallet', mnemonic: phrase }))

    for (const entry of readdirSync(join(documentDirectory, ACCOUNT))) {
      const body = readFileSync(join(documentDirectory, ACCOUNT, entry), 'utf8')
      expect(body).to.not.contain('item morning fan')
    }
  })
})
