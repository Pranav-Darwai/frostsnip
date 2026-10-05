from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

__version__ = "0.1.1"
APP_VERSION = "0.1.0"
DEFAULT_REPO = "Pranav-Darwai/frostsnip"
REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")

# Known-good SHA-256 digests for published installers (lowercase hex).
KNOWN_SHA256 = {
    "frostSnip_0.1.0_x64-setup.exe": (
        "4a028c02bf2bb8a6f7e06c5a437cd9591d9d026497cb024ccb7e6ed74adb7320"
    ),
}

ALLOWED_DOWNLOAD_HOSTS = {
    "github.com",
    "objects.githubusercontent.com",
    "release-assets.githubusercontent.com",
}


def resolved_repo() -> str:
    raw = (os.environ.get("FROSTSNIP_REPO") or DEFAULT_REPO).strip()
    if not REPO_RE.fullmatch(raw):
        raise SystemExit(
            f'Invalid FROSTSNIP_REPO "{raw}". '
            "Expected owner/name with letters, digits, ._- only."
        )
    return raw


def cache_dir() -> Path:
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
        return Path(base) / "frostSnip"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "frostSnip"
    xdg = os.environ.get("XDG_DATA_HOME") or str(Path.home() / ".local" / "share")
    return Path(xdg) / "frostSnip"


def installed_exe() -> Path:
    name = "frostsnip.exe" if sys.platform == "win32" else "frostsnip"
    return cache_dir() / name


def asset_name() -> str:
    if sys.platform == "win32":
        return f"frostSnip_{APP_VERSION}_x64-setup.exe"
    if sys.platform == "darwin":
        return f"frostSnip_{APP_VERSION}_aarch64.app.tar.gz"
    return f"frostSnip_{APP_VERSION}_amd64.AppImage"


def local_candidates() -> list[Path]:
    root = Path(__file__).resolve().parents[4]
    release = root / "apps" / "desktop" / "src-tauri" / "target" / "release"
    if sys.platform == "win32":
        return [
            release / "frostsnip.exe",
            release / "bundle" / "nsis" / f"frostSnip_{APP_VERSION}_x64-setup.exe",
        ]
    return [release / "frostsnip"]


def assert_allowed_download_url(url: str) -> None:
    try:
        parsed = urlparse(url)
    except Exception as exc:  # noqa: BLE001
        raise SystemExit(f"Invalid download URL: {url}") from exc
    if parsed.scheme != "https":
        raise SystemExit(f"Refusing non-HTTPS download URL: {url}")
    host = (parsed.hostname or "").lower()
    allowed = host in ALLOWED_DOWNLOAD_HOSTS or host.endswith(".githubusercontent.com")
    if not allowed:
        raise SystemExit(
            f'Refusing download host "{host}". '
            "Allowed: github.com / *.githubusercontent.com "
            "(or unset FROSTSNIP_DOWNLOAD_URL)."
        )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def expected_sha256(file_name: str) -> str | None:
    env = (os.environ.get("FROSTSNIP_SHA256") or "").strip().lower()
    if env:
        if not re.fullmatch(r"[a-f0-9]{64}", env):
            raise SystemExit("FROSTSNIP_SHA256 must be a 64-character hex digest.")
        return env
    return KNOWN_SHA256.get(file_name)


def verify_sha256(path: Path) -> None:
    expected = expected_sha256(path.name)
    if not expected:
        print(
            f"[frostsnip] No pinned SHA-256 for {path.name}. "
            "Set FROSTSNIP_SHA256 to enforce integrity.",
            file=sys.stderr,
        )
        return
    actual = sha256_file(path)
    if actual != expected:
        raise SystemExit(
            f"SHA-256 mismatch for {path.name}.\n"
            f"  expected: {expected}\n"
            f"  actual:   {actual}\n"
            "Refusing to install. Delete the file and retry, or set FROSTSNIP_SHA256 "
            "if you intentionally changed the build."
        )


def _urlopen(url: str):
    assert_allowed_download_url(url)
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": f"frostsnip-pypi/{__version__}",
            "Accept": "application/vnd.github+json,application/octet-stream",
        },
    )
    return urllib.request.urlopen(req, timeout=120)


def latest_download_url() -> str:
    override = os.environ.get("FROSTSNIP_DOWNLOAD_URL")
    if override:
        assert_allowed_download_url(override)
        return override
    repo = resolved_repo()
    api = f"https://api.github.com/repos/{repo}/releases/latest"
    try:
        with _urlopen(api) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"No GitHub release found for {repo} ({exc.code}). "
            "Build the desktop app locally, or set FROSTSNIP_DOWNLOAD_URL."
        ) from exc

    want = asset_name().lower()
    assets = data.get("assets") or []
    asset = next((a for a in assets if str(a.get("name", "")).lower() == want), None)
    if asset is None:
        asset = next(
            (
                a
                for a in assets
                if "setup" in str(a.get("name", "")).lower()
                and str(a.get("name", "")).lower().endswith(".exe")
            ),
            None,
        )
    url = (asset or {}).get("browser_download_url")
    if not url:
        raise SystemExit(
            f"Release has no matching installer (wanted {asset_name()}). "
            "Upload the NSIS setup to GitHub Releases, or set FROSTSNIP_DOWNLOAD_URL."
        )
    assert_allowed_download_url(url)
    return url


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".partial")
    with _urlopen(url) as res, open(partial, "wb") as out:
        final = res.geturl() if hasattr(res, "geturl") else url
        assert_allowed_download_url(final)
        shutil.copyfileobj(res, out)
    partial.replace(dest)
    verify_sha256(dest)


def ensure_installed(force: bool = False) -> tuple[str, Path]:
    exe = installed_exe()
    if not force and exe.exists():
        return "app", exe

    for candidate in local_candidates():
        if not candidate.exists():
            continue
        # Local monorepo builds are trusted; checksums apply to downloaded assets only.
        if candidate.name.endswith("-setup.exe") or candidate.suffix.lower() == ".msi":
            return "installer", candidate
        exe.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(candidate, exe)
        if sys.platform != "win32":
            exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
        return "app", exe

    url = latest_download_url()
    dest = Path(tempfile.gettempdir()) / asset_name()
    print(f"Downloading frostSnip {APP_VERSION}…")
    print(url)
    download(url, dest)
    if dest.name.endswith("-setup.exe") or dest.suffix.lower() == ".msi":
        return "installer", dest

    exe.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(dest, exe)
    if sys.platform != "win32":
        exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
    return "app", exe


def launch(path: Path, detached: bool = True) -> int:
    if detached:
        kwargs: dict = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
        if sys.platform == "win32":
            kwargs["creationflags"] = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
                subprocess, "CREATE_NEW_PROCESS_GROUP", 0
            )
        else:
            kwargs["start_new_session"] = True
        subprocess.Popen([str(path)], **kwargs)
        return 0
    return subprocess.call([str(path)])


def install_and_launch(force: bool = False) -> int:
    kind, path = ensure_installed(force=force)
    if kind == "installer":
        print(f"Running installer:\n  {path}")
        if sys.platform == "win32" and path.name.endswith("-setup.exe"):
            code = subprocess.call([str(path), "/S"])
            exe = installed_exe()
            if exe.exists():
                print("Installed. Launching frostSnip…")
                return launch(exe, detached=True)
            print("Installer finished. Open frostSnip from the Start Menu if it did not launch.")
            return code
        return subprocess.call([str(path)])

    print(f"Launching {path}")
    return launch(path, detached=True)


def print_help() -> None:
    print(
        f"""frostSnip CLI {__version__}

Usage:
  frostsnip              Download/install (if needed) and launch the desktop app
  frostsnip install      Force re-download / reinstall
  frostsnip path         Print install location
  frostsnip help         Show this help

Environment:
  FROSTSNIP_REPO           GitHub repo (default: {DEFAULT_REPO})
  FROSTSNIP_DOWNLOAD_URL   Direct HTTPS installer URL (GitHub hosts only)
  FROSTSNIP_SHA256         Expected SHA-256 of the installer (64 hex chars)

Note:
  This installs the DESKTOP app.
  Browser extensions are separate (see INSTALL.md section B).
"""
    )


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    cmd = (args[0] if args else "launch").lower()
    if cmd in {"help", "-h", "--help"}:
        print_help()
        return 0
    if cmd == "path":
        print(installed_exe())
        return 0
    if cmd == "install":
        return install_and_launch(force=True)
    if cmd == "launch" or not args:
        return install_and_launch(force=False)
    print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
