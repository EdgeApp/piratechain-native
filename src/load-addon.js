'use strict'

const { existsSync } = require('fs')
const { join } = require('path')

/**
 * Resolves the Node addon for this machine.
 *
 * Prebuilds are laid out by Node's own `process.platform`-`process.arch` names,
 * so the directory this looks for is the one `build-native-host` wrote.
 */
function loadAddon() {
  const hostDir = `${process.platform}-${process.arch}`
  const addonPath = join(__dirname, '..', 'prebuilds', hostDir, 'piratechain.node')

  if (!existsSync(addonPath)) {
    throw new Error(
      `piratechain-native: no prebuilt addon for ${hostDir}. ` +
        'Run `npm run build-native-host` in the piratechain-native checkout, ' +
        'or install a release that ships this platform.'
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require(addonPath)
}

module.exports = { loadAddon }
