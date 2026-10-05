from __future__ import annotations

import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

__version__ = "0.1.0"
REPO = os.environ.get("FROSTSNIP_REPO", "Pranav-Darwai/frostsnip")


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
        return f"frostSnip_{__version__}_x64-setup.exe"
    if sys.platform == "darwin":
        return f"frostSnip_{__version__}_aarch64.app.tar.gz"
    return f"frostSnip_{__version__}_amd64.AppImage"


def local_candidates() -> list[Path]:
    # packages/pypi-frostsnip/src/frostsnip/cli.py -> repo root (parents[4])
    root = Path(__file__).resolve().parents[4]
    release = root / "apps" / "desktop" / "src-tauri" / "target" / "release"
    if sys.platform == "win32":
        return [
            release / "frostsnip.exe",
            release / "bundle" / "nsis" / f"frostSnip_{__version__}_x64-setup.exe",
        ]
    return [release / "frostsnip"]


def _urlopen(url: str):
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
        return override
    api = f"https://api.github.com/repos/{REPO}/releases/latest"
    try:
        with _urlopen(api) as res:
            data = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise SystemExit(
            f"No GitHub release found for {REPO} ({exc.code}). "
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
    return url


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    partial = dest.with_suffix(dest.suffix + ".partial")
    with _urlopen(url) as res, open(partial, "wb") as out:
        shutil.copyfileobj(res, out)
    partial.replace(dest)


def ensure_installed(force: bool = False) -> tuple[str, Path]:
    exe = installed_exe()
    if not force and exe.exists():
        return "app", exe

    for candidate in local_candidates():
        if not candidate.exists():
            continue
        if candidate.name.endswith("-setup.exe") or candidate.suffix.lower() == ".msi":
            return "installer", candidate
        exe.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(candidate, exe)
        if sys.platform != "win32":
            exe.chmod(exe.stat().st_mode | stat.S_IEXEC)
        return "app", exe

    url = latest_download_url()
    dest = Path(tempfile.gettempdir()) / asset_name()
    print(f"Downloading frostSnip {__version__}…")
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
        kwargs = {"stdout": subprocess.DEVNULL, "stderr": subprocess.DEVNULL}
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
  FROSTSNIP_REPO           GitHub repo (default: {REPO})
  FROSTSNIP_DOWNLOAD_URL   Direct installer/binary URL (skips GitHub API)

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
