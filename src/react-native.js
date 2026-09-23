'use strict'

const {
  PirateWalletSdk,
  PirateWalletSynchronizer,
  PirateWalletAdvancedKeyManagement,
  assertNativeModule
} = require('./index.js')

/**
 * Resolves the React Native bridge module.
 *
 * This is the only file in the package that knows React Native exists. The SDK
 * class takes its transport as a constructor argument, so the Node entry point
 * supplies a different one without either side importing the other's runtime.
 */
function getNativeModule() {
  let reactNative
  try {
    reactNative = require('react-native')
  } catch (error) {
    throw new Error(
      'piratechain-native: react-native is not available. Import ' +
        "'piratechain-native/node' to run under Node."
    )
  }

  const nativeModule =
    reactNative &&
    reactNative.NativeModules &&
    reactNative.NativeModules.PirateWalletReactNative

  if (nativeModule == null) {
    throw new Error(
      'piratechain-native: the PirateWalletReactNative native module is not ' +
        'linked. Rebuild the app and check the native installation.'
    )
  }
  return assertNativeModule(nativeModule)
}

function createPirateWalletSdk(nativeModule = getNativeModule()) {
  return new PirateWalletSdk(nativeModule)
}

module.exports = {
  PirateWalletSdk,
  PirateWalletSynchronizer,
  PirateWalletAdvancedKeyManagement,
  getNativeModule,
  createPirateWalletSdk
}
