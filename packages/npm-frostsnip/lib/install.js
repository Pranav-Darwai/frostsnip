import { spawn } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  chmodSync,
  copyFileSync,
  renameSync,
  readFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const CLI_VERSION = "0.1.1";
/** Desktop installer / GitHub Release asset version. */
const APP_VERSION = "0.1.0";
const DEFAULT_REPO = "Pranav-Darwai/frostsnip";

/** Known-good SHA-256 digests for published installers (lowercase hex). */
const KNOWN_SHA256 = {
  "frostSnip_0.1.0_x64-setup.exe":
    "4a028c02bf2bb8a6f7e06c5a437cd9591d9d026497cb024ccb7e6ed74adb7320",
};

function resolvedRepo() {
  const raw = (process.env.FROSTSNIP_REPO || DEFAULT_REPO).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(raw)) {
    throw new Error(
      `Invalid FROSTSNIP_REPO "${raw}". Expected owner/name with letters, digits, ._- only.`,
    );
  }
  return raw;
}

function cacheDir() {
  if (platform() === "win32") {
    return join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "frostSnip");
  }
  if (platform() === "darwin") {
    return join(homedir(), "Library", "Application Support", "frostSnip");
  }
  return join(process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "frostSnip");
}

function installedExe() {
  const base = cacheDir();
  if (platform() === "win32") {
    return join(base, "frostsnip.exe");
  }
  return join(base, "frostsnip");
}

function localBuildCandidates() {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, "..", "..", "..");
  if (platform() === "win32") {
    return [
      join(root, "apps", "desktop", "src-tauri", "target", "release", "frostsnip.exe"),
      join(
        root,
        "apps",
        "desktop",
        "src-tauri",
        "target",
        "release",
        "bundle",
        "nsis",
        `frostSnip_${APP_VERSION}_x64-setup.exe`,
      ),
    ];
  }
  return [join(root, "apps", "desktop", "src-tauri", "target", "release", "frostsnip")];
}

function assertAllowedDownloadUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid download URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Refusing non-HTTPS download URL: ${url}`);
  }
  const host = parsed.hostname.toLowerCase();
  const allowed =
    host === "github.com" ||
    host === "objects.githubusercontent.com" ||
    host === "release-assets.githubusercontent.com" ||
    host.endsWith(".githubusercontent.com");
  if (!allowed) {
    throw new Error(
      `Refusing download host "${host}". Allowed: github.com / *.githubusercontent.com (or unset FROSTSNIP_DOWNLOAD_URL).`,
    );
  }
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(readFileSync(filePath));
  return hash.digest("hex");
}

function expectedSha256(fileName) {
  const env = (process.env.FROSTSNIP_SHA256 || "").trim().toLowerCase();
  if (env) {
    if (!/^[a-f0-9]{64}$/.test(env)) {
      throw new Error("FROSTSNIP_SHA256 must be a 64-character hex digest.");
    }
    return env;
  }
  return KNOWN_SHA256[fileName] || null;
}

function verifySha256(filePath, fileName) {
  const expected = expectedSha256(fileName);
  if (!expected) {
    console.warn(
      `[frostsnip] No pinned SHA-256 for ${fileName}. Set FROSTSNIP_SHA256 to enforce integrity.`,
    );
    return;
  }
  const actual = sha256File(filePath);
  if (actual !== expected) {
    throw new Error(
      `SHA-256 mismatch for ${fileName}.\n  expected: ${expected}\n  actual:   ${actual}\nRefusing to install. Delete the file and retry, or set FROSTSNIP_SHA256 if you intentionally changed the build.`,
    );
  }
}

async function download(url, dest) {
  assertAllowedDownloadUrl(url);
  const res = await fetch(url, {
    headers: { "User-Agent": `frostsnip-npm/${CLI_VERSION}` },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  // After redirects, confirm final URL is still allowlisted
  if (res.url) assertAllowedDownloadUrl(res.url);

  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.partial`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  renameSync(tmp, dest);
  verifySha256(dest, basename(dest));
}

function assetName() {
  const p = platform();
  if (p === "win32") return `frostSnip_${APP_VERSION}_x64-setup.exe`;
  if (p === "darwin") return `frostSnip_${APP_VERSION}_aarch64.app.tar.gz`;
  return `frostSnip_${APP_VERSION}_amd64.AppImage`;
}

async function latestReleaseAssetUrl() {
  const override = process.env.FROSTSNIP_DOWNLOAD_URL;
  if (override) {
    assertAllowedDownloadUrl(override);
    return override;
  }

  const repo = resolvedRepo();
  const api = `https://api.github.com/repos/${repo}/releases/latest`;
  const res = await fetch(api, {
    headers: {
      "User-Agent": `frostsnip-npm/${CLI_VERSION}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(
      `No GitHub release found for ${repo} (${res.status}). Build the desktop app locally, or set FROSTSNIP_DOWNLOAD_URL.`,
    );
  }
  const data = await res.json();
  const want = assetName().toLowerCase();
  const asset =
    (data.assets || []).find((a) => String(a.name).toLowerCase() === want) ||
    (data.assets || []).find(
      (a) =>
        String(a.name).toLowerCase().includes("setup") &&
        String(a.name).toLowerCase().endsWith(".exe"),
    );
  if (!asset?.browser_download_url) {
    throw new Error(
      `Release has no matching installer asset (wanted ${assetName()}). Upload the NSIS setup to GitHub Releases, or set FROSTSNIP_DOWNLOAD_URL.`,
    );
  }
  assertAllowedDownloadUrl(asset.browser_download_url);
  return asset.browser_download_url;
}

function run(file, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: opts.stdio ?? "inherit",
      windowsHide: true,
      detached: opts.detached ?? false,
    });
    if (opts.detached) {
      child.unref();
      resolve(0);
      return;
    }
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 0));
  });
}

async function ensureInstalled({ force = false } = {}) {
  const exe = installedExe();
  if (!force && existsSync(exe)) {
    return { kind: "app", path: exe };
  }

  for (const candidate of localBuildCandidates()) {
    if (!existsSync(candidate)) continue;
    // Local monorepo builds are trusted; checksums apply to downloaded assets only.
    if (candidate.endsWith("-setup.exe") || candidate.endsWith(".msi")) {
      return { kind: "installer", path: candidate };
    }
    mkdirSync(dirname(exe), { recursive: true });
    copyFileSync(candidate, exe);
    if (platform() !== "win32") chmodSync(exe, 0o755);
    return { kind: "app", path: exe };
  }

  const url = await latestReleaseAssetUrl();
  const dest = join(tmpdir(), assetName());
  console.log(`Downloading frostSnip ${APP_VERSION}…`);
  console.log(url);
  await download(url, dest);

  if (dest.endsWith("-setup.exe") || dest.endsWith(".msi")) {
    return { kind: "installer", path: dest };
  }

  mkdirSync(dirname(exe), { recursive: true });
  try {
    renameSync(dest, exe);
  } catch {
    copyFileSync(dest, exe);
  }
  if (platform() !== "win32") chmodSync(exe, 0o755);
  return { kind: "app", path: exe };
}

async function installAndLaunch(force = false) {
  const target = await ensureInstalled({ force });
  if (target.kind === "installer") {
    console.log(`Running installer:\n  ${target.path}`);
    if (platform() === "win32" && target.path.endsWith("-setup.exe")) {
      await run(target.path, ["/S"]);
      const exe = installedExe();
      if (existsSync(exe)) {
        console.log("Installed. Launching frostSnip…");
        await run(exe, [], { detached: true, stdio: "ignore" });
        return;
      }
      console.log("Installer finished. Open frostSnip from the Start Menu if it did not launch.");
      return;
    }
    await run(target.path, []);
    return;
  }

  console.log(`Launching ${target.path}`);
  await run(target.path, [], { detached: true, stdio: "ignore" });
}

function printHelp() {
  console.log(`frostSnip CLI ${CLI_VERSION}

Usage:
  frostsnip              Download/install (if needed) and launch the desktop app
  frostsnip install      Force re-download / reinstall
  frostsnip path         Print install location
  frostsnip help         Show this help

Environment:
  FROSTSNIP_REPO           GitHub repo (default: ${DEFAULT_REPO})
  FROSTSNIP_DOWNLOAD_URL   Direct HTTPS installer URL (GitHub hosts only)
  FROSTSNIP_SHA256         Expected SHA-256 of the installer (64 hex chars)

Note:
  This installs the Windows/macOS/Linux DESKTOP app.
  Browser extensions are separate (see INSTALL.md section B).
`);
}

export async function runCli(args) {
  const cmd = (args[0] || "launch").toLowerCase();
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    printHelp();
    return;
  }
  if (cmd === "path") {
    console.log(installedExe());
    return;
  }
  if (cmd === "install") {
    await installAndLaunch(true);
    return;
  }
  if (cmd === "launch" || !args[0]) {
    await installAndLaunch(false);
    return;
  }
  printHelp();
  process.exit(1);
}
