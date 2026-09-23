"use strict";

const fs = require("fs");
const path = require("path");

const packageRoot = path.resolve(__dirname, "..");

function fail(message) {
  console.error(`[piratechain-native] ${message}`);
  process.exitCode = 1;
}

function requireFile(relativePath) {
  const absolutePath = path.join(packageRoot, relativePath);
  if (!fs.statSync(absolutePath, { throwIfNoEntry: false })?.isFile()) {
    fail(`Required package file is missing: ${relativePath}`);
    return;
  }
  if (fs.statSync(absolutePath).size === 0) {
    fail(`Required package file is empty: ${relativePath}`);
  }
}

function rejectPath(relativePath) {
  if (fs.existsSync(path.join(packageRoot, relativePath))) {
    fail(`Generated build path must not be published: ${relativePath}`);
  }
}

function collectFiles(directory) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }

  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")
);

if (packageJson.name !== "piratechain-native") {
  fail(`Unexpected package name: ${packageJson.name}`);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(packageJson.version)) {
  fail(
    `Package version is not valid semantic versioning: ${packageJson.version}`
  );
}
if (packageJson.private === true) {
  fail("The publishable package must not be marked private");
}
if (
  packageJson.repository?.url !==
  "git+https://github.com/EdgeApp/piratechain-native.git"
) {
  fail(
    "The repository URL must match the GitHub repository used for npm provenance"
  );
}
if (packageJson.publishConfig?.access !== "public") {
  fail("publishConfig.access must remain public");
}

[
  "LICENSE-MIT",
  "README.md",
  "react-native.config.js",
  "piratechain-native.podspec",
  "scripts/assemble-ios-framework.js",
  "scripts/resolve-android-packages.js",
  "test/smoke.js",
  "src/index.js",
  "src/index.d.ts",
  "src/react-native.js",
  "src/node.js",
  "src/node.d.ts",
  "src/load-addon.js",
  "node.js",
  "node.d.ts",
  "android/src/main/AndroidManifest.xml",
  "android/src/main/java/com/pirate/wallet/reactnative/PirateWalletReactNativeModule.kt",
  "ios/PirateWalletReactNative.m",
  "ios/PirateWalletReactNative.swift",
].forEach(requireFile);

if (process.argv.includes("--publish-layout")) {
  [
    "android/.gradle",
    "android/build",
    "android/src/main/jniLibs",
    "ios/Frameworks/PirateWalletNative.xcframework",
  ].forEach(rejectPath);
}

// Upstream asserted that each binary package pinned the wrapper's exact
// version. This fork versions independently of the Pirate team's releases, so
// that equality can never hold. The binary packages themselves go away once the
// native artifacts are built from source.

// The xcframework is gitignored and built by `build-native-ios`, so a fresh
// checkout has none. Check it when it is there; requiring it unconditionally
// would fail every developer who has not run a native build yet.
if (
  !process.argv.includes("--publish-layout") &&
  (process.platform === "darwin" || process.argv.includes("--all-platforms")) &&
  fs.existsSync(
    path.join(packageRoot, "ios", "Frameworks", "PirateWalletNative.xcframework")
  )
) {
  const staticLibraries = collectFiles(
    path.join(
      packageRoot,
      "ios",
      "Frameworks",
      "PirateWalletNative.xcframework"
    )
  ).filter((file) => file.endsWith(".a"));
  if (staticLibraries.length !== 2) {
    fail(
      "The iOS XCFramework must contain device and simulator static libraries"
    );
  }
  for (const library of staticLibraries) {
    if (fs.statSync(library).size === 0) {
      fail(
        `The iOS static library is empty: ${path.relative(
          packageRoot,
          library
        )}`
      );
    }
  }
}

// Upstream resolved the Android jniLibs from two sibling packages in its own
// monorepo. This fork is a standalone repository, so those siblings do not
// exist and the packages are not installed by default; the artifacts come from
// `build-native-android` instead. Check the pair when they are resolvable, so
// the assertion still means something for anyone who has them, and skip it
// otherwise rather than failing a clean checkout.
try {
  const { resolveAndroidJniLibsPaths } = require("./resolve-android-packages");
  const jniLibsPaths = resolveAndroidJniLibsPaths();
  if (jniLibsPaths.length !== 2) {
    fail("Both Android binary packages must resolve");
  }
} catch (error) {
  if (!/is required to build/.test(error.message)) {
    fail(error.message);
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
