import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const VERSION = "0.1.0";
const REPO = process.env.FROSTSNIP_REPO || "Pranav-Darwai/frostsnip";

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
  // packages/npm-frostsnip/lib -> repo root
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
        `frostSnip_${VERSION}_x64-setup.exe`,
      ),
    ];
  }
  return [join(root, "apps", "desktop", "src-tauri", "target", "release", "frostsnip")];
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { "User-Agent": `frostsnip-npm/${VERSION}` },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(`Download failed (${res.status}): ${url}`);
  }
  mkdirSync(dirname(dest), { recursive: true });
  const tmp = `${dest}.partial`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  const { renameSync } = await import("node:fs");
  renameSync(tmp, dest);
}

function assetName() {
  const p = platform();
  if (p === "win32") return `frostSnip_${VERSION}_x64-setup.exe`;
  if (p === "darwin") return `frostSnip_${VERSION}_aarch64.app.tar.gz`;
  return `frostSnip_${VERSION}_amd64.AppImage`;
}

async function latestReleaseAssetUrl() {
  const override = process.env.FROSTSNIP_DOWNLOAD_URL;
  if (override) return override;

  const api = `https://api.github.com/repos/${REPO}/releases/latest`;
  const res = await fetch(api, {
    headers: {
      "User-Agent": `frostsnip-npm/${VERSION}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!res.ok) {
    throw new Error(
      `No GitHub release found for ${REPO} (${res.status}). Build the desktop app locally, or set FROSTSNIP_DOWNLOAD_URL.`,
    );
  }
  const data = await res.json();
  const want = assetName().toLowerCase();
  const asset = (data.assets || []).find((a) => String(a.name).toLowerCase() === want)
    || (data.assets || []).find((a) => String(a.name).toLowerCase().includes("setup") && String(a.name).toLowerCase().endsWith(".exe"));
  if (!asset?.browser_download_url) {
    throw new Error(
      `Release has no matching installer asset (wanted ${assetName()}). Upload the NSIS setup to GitHub Releases, or set FROSTSNIP_DOWNLOAD_URL.`,
    );
  }
  return asset.browser_download_url;
}

function run(file, args = [], opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: "inherit",
      shell: platform() === "win32",
      detached: opts.detached ?? false,
      ...opts,
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

  // Prefer a local release build from this monorepo (developers)
  for (const candidate of localBuildCandidates()) {
    if (!existsSync(candidate)) continue;
    if (candidate.endsWith("-setup.exe") || candidate.endsWith(".msi")) {
      return { kind: "installer", path: candidate };
    }
    mkdirSync(dirname(exe), { recursive: true });
    const { copyFileSync } = await import("node:fs");
    copyFileSync(candidate, exe);
    if (platform() !== "win32") chmodSync(exe, 0o755);
    return { kind: "app", path: exe };
  }

  // Download published installer / binary
  const url = await latestReleaseAssetUrl();
  const dest = join(tmpdir(), assetName());
  console.log(`Downloading frostSnip ${VERSION}…`);
  console.log(url);
  await download(url, dest);

  if (dest.endsWith("-setup.exe") || dest.endsWith(".msi")) {
    return { kind: "installer", path: dest };
  }

  mkdirSync(dirname(exe), { recursive: true });
  const { copyFileSync, renameSync } = await import("node:fs");
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
      // Silent install into the usual Local AppData location
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
  console.log(`frostSnip CLI ${VERSION}

Usage:
  frostsnip              Download/install (if needed) and launch the desktop app
  frostsnip install      Force re-download / reinstall
  frostsnip path         Print install location
  frostsnip help         Show this help

Environment:
  FROSTSNIP_REPO           GitHub repo (default: ${REPO})
  FROSTSNIP_DOWNLOAD_URL   Direct installer/binary URL (skips GitHub API)

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
