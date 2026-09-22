import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const root = process.cwd();

const read = (file) => readFile(join(root, file), "utf8");

const [packageText, cargoText, tauriText] = await Promise.all([
  read("package.json"),
  read("src-tauri/Cargo.toml"),
  read("src-tauri/tauri.conf.json"),
]);

const packageJson = JSON.parse(packageText);
const cargoVersion = cargoText.match(/^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1];
const tauriVersion = JSON.parse(tauriText).version;
const errors = [];

if (!cargoVersion) {
  errors.push("Could not read the package version from src-tauri/Cargo.toml.");
}

const versions = {
  "package.json": packageJson.version,
  "src-tauri/Cargo.toml": cargoVersion,
  "src-tauri/tauri.conf.json": tauriVersion,
};
const versionValues = Object.values(versions);
if (versionValues.some((version) => version !== versionValues[0])) {
  errors.push(
    `Version mismatch: ${Object.entries(versions)
      .map(([file, version]) => `${file}=${version ?? "missing"}`)
      .join(", ")}`,
  );
}

const requiredScripts = [
  "check:repo",
  "fix",
  "preflight",
  "lint",
  "lint:fix",
  "format",
  "format:check",
];
for (const script of requiredScripts) {
  if (!packageJson.scripts?.[script]) {
    errors.push(`Missing package script: ${script}`);
  }
}

for (const lockfile of ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"]) {
  try {
    await read(lockfile);
    errors.push(`Unsupported lockfile present: ${lockfile}`);
  } catch {
    // The project intentionally uses Bun only.
  }
}

try {
  await read("bun.lock");
} catch {
  errors.push("Missing Bun lockfile: bun.lock");
}

if (errors.length > 0) {
  console.error("Repository invariant check failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Repository invariant check passed.");
