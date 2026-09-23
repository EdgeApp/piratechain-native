'use strict'

const { expect } = require('chai')

const { PirateWalletSdk, assertNativeModule } = require('../src/index.js')

/**
 * A transport that records what the SDK sent and replays a canned response.
 *
 * Every case drives the SDK through its public surface, so these lock the wire
 * the SDK composes rather than restating it.
 */
function makeFakeNative(responder = () => '{"ok":true,"result":{}}') {
  const calls = []
  return {
    calls,
    invoke(requestJson, pretty) {
      calls.push({ method: 'invoke', requestJson, pretty })
      return Promise.resolve(responder(requestJson))
    },
    configureAccountStorage(accountId, passphrase, storagePath) {
      calls.push({
        method: 'configureAccountStorage',
        accountId,
        passphrase,
        storagePath
      })
      return Promise.resolve('{"ok":true,"result":{}}')
    },
    configureSecureAccountStorage(accountId, storagePath) {
      calls.push({
        method: 'configureSecureAccountStorage',
        accountId,
        storagePath
      })
      return Promise.resolve('{"ok":true,"result":{}}')
    }
  }
}

describe('transport injection', function () {
  it('passes the SDK-composed request to the injected transport', async function () {
    const native = makeFakeNative(
      () => '{"ok":true,"result":{"version":"1.2.3"}}'
    )
    const sdk = new PirateWalletSdk(native)

    const result = await sdk.buildInfo()

    expect(native.calls).to.have.lengthOf(1)
    const sent = JSON.parse(native.calls[0].requestJson)
    expect(sent.method).to.equal('get_build_info')
    expect(result).to.deep.equal({ version: '1.2.3' })
  })

  it('composes snake_case method names, not Rust variant names', async function () {
    const native = makeFakeNative()
    const sdk = new PirateWalletSdk(native)

    await sdk.walletRegistryExists()

    const sent = JSON.parse(native.calls[0].requestJson)
    expect(sent.method).to.equal('wallet_registry_exists')
  })

  for (const missing of [
    'invoke',
    'configureAccountStorage',
    'configureSecureAccountStorage'
  ]) {
    it(`rejects a transport with no ${missing}`, function () {
      const native = makeFakeNative()
      delete native[missing]
      expect(() => new PirateWalletSdk(native)).to.throw(missing)
    })
  }

  it('rejects a null transport with an error naming both entry points', function () {
    expect(() => new PirateWalletSdk(null)).to.throw(
      /piratechain-native\/node/
    )
  })

  it('assertNativeModule returns the module it was given', function () {
    const native = makeFakeNative()
    expect(assertNativeModule(native)).to.equal(native)
  })

  it('surfaces the upstream error message, not a generic one', async function () {
    const native = makeFakeNative(
      () => '{"ok":false,"error":"wallet is locked"}'
    )
    const sdk = new PirateWalletSdk(native)

    let caught
    try {
      await sdk.buildInfo()
    } catch (error) {
      caught = error
    }
    expect(caught, 'expected a rejection').to.not.equal(undefined)
    expect(caught.message).to.contain('wallet is locked')
  })

  it('rejects a non-JSON response naming the request that produced it', async function () {
    const native = makeFakeNative(() => 'not json at all')
    const sdk = new PirateWalletSdk(native)

    let caught
    try {
      await sdk.buildInfo()
    } catch (error) {
      caught = error
    }
    expect(caught, 'expected a rejection').to.not.equal(undefined)
    expect(caught.message).to.contain('get_build_info')
  })

  it('does not import react-native', function () {
    // The SDK module must load in a process where requiring react-native
    // throws, which is every Node process. Reload it from scratch to prove the
    // load itself is clean, then put the original back so later cases keep
    // comparing against the same class object.
    const indexPath = require.resolve('../src/index.js')
    const original = require.cache[indexPath]
    delete require.cache[indexPath]
    try {
      const reloaded = require('../src/index.js')
      expect(() => new reloaded.PirateWalletSdk(makeFakeNative())).to.not.throw()
    } finally {
      require.cache[indexPath] = original
    }
  })
})

describe('react-native entry point', function () {
  const rnPath = require.resolve('../src/react-native.js')

  afterEach(function () {
    delete require.cache[rnPath]
    delete require.cache['react-native']
  })

  // `react-native.js` requires 'react-native' lazily, inside getNativeModule,
  // so the stub has to stay installed for the duration of the case rather than
  // only while the module is loaded.
  function withStub(stub, body) {
    delete require.cache[rnPath]
    const Module = require('module')
    const original = Module._load
    Module._load = function (request) {
      if (request === 'react-native') {
        if (stub == null) throw new Error('Cannot find module react-native')
        return stub
      }
      return original.apply(this, arguments)
    }
    try {
      return body(require(rnPath))
    } finally {
      Module._load = original
    }
  }

  it('passes NativeModules.PirateWalletReactNative through to the SDK', function () {
    const native = makeFakeNative()
    withStub({ NativeModules: { PirateWalletReactNative: native } }, rn => {
      expect(rn.getNativeModule()).to.equal(native)
      expect(rn.createPirateWalletSdk()).to.be.instanceOf(PirateWalletSdk)
    })
  })

  it('throws a named error when the native module is not linked', function () {
    withStub({ NativeModules: {} }, rn => {
      expect(() => rn.getNativeModule()).to.throw(/not\s+linked/)
    })
  })

  it('throws a named error when react-native itself is absent', function () {
    withStub(null, rn => {
      expect(() => rn.getNativeModule()).to.throw(/piratechain-native\/node/)
    })
  })
})
