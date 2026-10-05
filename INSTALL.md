# How to install frostSnip

There are **four** ways to get frostSnip. Pick one.

```
A. Windows setup (.exe)     native desktop installer
B. Browser extension        Chrome / Edge only (web pages)
C. npm / npx                installs/launches the desktop app
D. pip (PyPI)               installs/launches the desktop app
```

C and D install the **same desktop app** as A. They do not install the browser extension.

Live packages:
- https://pypi.org/project/frostsnip/
- https://www.npmjs.com/package/frostsnip
- https://github.com/Pranav-Darwai/frostsnip/releases

---

## A. Desktop app (Windows setup)

1. Download `frostSnip_0.1.0_x64-setup.exe` from [Releases](https://github.com/Pranav-Darwai/frostsnip/releases/tag/v0.1.0)
2. Double-click it and finish the wizard
3. Open **frostSnip** from the Start Menu
4. Use **Ctrl+Shift+F** or **Rectangle** / **Full screen**

Uninstall: Windows **Settings → Apps → frostSnip**

### Build the setup file (developers)

Needs Node 20+, pnpm, Rust, and VS C++ build tools.

```powershell
pnpm install
pnpm install:win
```

Output:

```
apps/desktop/src-tauri/target/release/bundle/nsis/frostSnip_0.1.0_x64-setup.exe
```

---

## B. Browser extension (Chrome / Edge)

Not the Start Menu app. Load an unpacked extension.

```powershell
pnpm install
pnpm --filter @snapshort/extension build
```

1. Open `chrome://extensions` or `edge://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → choose `apps/extension/dist`

Lite variant: build `@snapshort/extension-lite` and load `apps/extension-lite/dist`.

---

## C. npm (desktop app)

```bash
npm install -g frostsnip
frostsnip
```

Or without a global install:

```bash
npx frostsnip
```

Useful commands:

```bash
frostsnip install   # force reinstall
frostsnip path      # show install folder
frostsnip help
```

Optional override:

```bash
set FROSTSNIP_DOWNLOAD_URL=https://github.com/Pranav-Darwai/frostsnip/releases/download/v0.1.0/frostSnip_0.1.0_x64-setup.exe
frostsnip install
```

Package source in this repo: `packages/npm-frostsnip`

---

## D. pip / PyPI (desktop app)

```bash
pip install frostsnip
python -m frostsnip
```

If `frostsnip` is not found on PATH (common with Windows Store Python), always use `python -m frostsnip`.

Or:

```bash
pipx run frostsnip
```

Same commands as npm: `install`, `path`, `help`.  
Same env vars: `FROSTSNIP_REPO`, `FROSTSNIP_DOWNLOAD_URL`.

Package source in this repo: `packages/pypi-frostsnip`

---

## Common mix-ups

| Mistake | Fix |
|---------|-----|
| `npm install frostsnip` then looking in Chrome | npm installs the **desktop** app. For Chrome use section **B**. |
| `pip install frostsnip` expecting a Python library API | This package is an **installer/launcher**, not a Python OCR API. |
| Loading the repo root in “Load unpacked” | Load `apps/extension/dist`. |
| `frostsnip` not recognized after pip | Run `python -m frostsnip` or add Python Scripts to PATH. |

---

## Checklist

**Desktop (A / C / D)**

- [ ] frostSnip opens
- [ ] `Ctrl+Shift+F` starts a snip

**Extension (B)**

- [ ] Enabled on `chrome://extensions` or `edge://extensions`
- [ ] Toolbar icon captures the tab
