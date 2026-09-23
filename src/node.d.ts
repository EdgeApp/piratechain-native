import { PirateWalletSdk } from './index'

export * from './index'

export interface NodePirateWalletOptions {
  /** Where this process keeps its Pirate Chain wallet state. */
  documentDirectory: string
  /** Overrides the prebuilt addon. Tests use this; callers do not. */
  addon?: { invoke: (request: string, pretty?: boolean) => Promise<string> }
}

export interface NodeNativeModule {
  invoke: (requestJson: string, pretty?: boolean) => Promise<string>
  configureAccountStorage: (
    accountId: string,
    passphrase: string,
    storagePath?: string | null
  ) => Promise<string>
  configureSecureAccountStorage: (
    accountId: string,
    storagePath?: string | null
  ) => Promise<string>
}

export function makeNodeNativeModule(
  opts: NodePirateWalletOptions
): NodeNativeModule

export function createPirateWalletSdk(
  opts: NodePirateWalletOptions
): PirateWalletSdk
