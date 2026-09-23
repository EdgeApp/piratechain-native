'use strict'

const { expect } = require('chai')
const Module = require('module')
const { join } = require('path')

const addonPath = require.resolve('../src/load-addon.js')

/**
 * Runs `body` with `fs.existsSync` and the addon require forced to a known
 * answer, so the resolution logic is tested without depending on whether this
 * machine happens to have a prebuild.
 */
function withHost(platform, arch, exists, body) {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  const originalArch = Object.getOwnPropertyDescriptor(process, 'arch')
  const fs = require('fs')
  const originalExists = fs.existsSync
  const originalLoad = Module._load
  const loaded = []

  Object.defineProperty(process, 'platform', { value: platform })
  Object.defineProperty(process, 'arch', { value: arch })
  fs.existsSync = path => (String(path).includes('piratechain.node') ? exists : originalExists(path))
  Module._load = function (request) {
    if (String(request).endsWith('piratechain.node')) {
      loaded.push(request)
      return { invoke: () => Promise.resolve('{}') }
    }
    return originalLoad.apply(this, arguments)
  }
  delete require.cache[addonPath]

  try {
    return body(require(addonPath), loaded)
  } finally {
    Object.defineProperty(process, 'platform', originalPlatform)
    Object.defineProperty(process, 'arch', originalArch)
    fs.existsSync = originalExists
    Module._load = originalLoad
    delete require.cache[addonPath]
  }
}

describe('load-addon', function () {
  it('resolves the prebuild for this platform and architecture', function () {
    withHost('darwin', 'arm64', true, ({ loadAddon }, loaded) => {
      const addon = loadAddon()
      expect(addon).to.have.property('invoke')
      expect(loaded).to.have.lengthOf(1)
      expect(loaded[0]).to.contain(join('prebuilds', 'darwin-arm64'))
    })
  })

  it('names the platform and architecture when the prebuild is absent', function () {
    withHost('linux', 'arm64', false, ({ loadAddon }) => {
      expect(() => loadAddon()).to.throw(/linux-arm64/)
    })
  })

  it('points at the build script when the prebuild is absent', function () {
    withHost('linux', 'arm64', false, ({ loadAddon }) => {
      expect(() => loadAddon()).to.throw(/build-native-host/)
    })
  })
})
