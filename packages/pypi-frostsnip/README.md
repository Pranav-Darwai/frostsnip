# frostsnip (PyPI)

Install and launch the **frostSnip desktop app** with pip.

```bash
pip install frostsnip
frostsnip
```

Or:

```bash
pipx run frostsnip
```

## Commands

| Command | What it does |
|---------|----------------|
| `frostsnip` | Install if needed, then launch |
| `frostsnip install` | Force reinstall, then launch |
| `frostsnip path` | Print where the app binary lives |
| `frostsnip help` | Help |

## How it finds the app

1. Already installed under your user data folder (`%LOCALAPPDATA%\frostSnip` on Windows)
2. Else a local monorepo build (`apps/desktop/src-tauri/target/release/…`)
3. Else download from GitHub Releases (`Pranav-Darwai/frostsnip`) or `FROSTSNIP_DOWNLOAD_URL`

## Publish this package

From `packages/pypi-frostsnip`:

```bash
python -m pip install build twine
python -m build
python -m twine upload dist/*
```

Upload the Windows NSIS installer to GitHub Releases as:

`frostSnip_0.1.0_x64-setup.exe`

## Not for the browser extension

Chrome/Edge extension install is still **Load unpacked** (see root `INSTALL.md` section B).
