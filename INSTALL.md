# How to install frostSnip

There are **four** ways to get frostSnip. Pick one.

```
A. Windows setup (.exe)     native desktop installer
B. Browser extension        Chrome / Edge only (web pages)
C. npm                      installs/launches the desktop app
D. pip (PyPI)               installs/launches the desktop app
```

C and D install the **same desktop app** as A. They do not install the browser extension.

---

## A. Desktop app (Windows setup)

### If you already have the setup file

1. Find `frostSnip_0.1.0_x64-setup.exe`
2. Double-click it
3. Finish the wizard
4. Open **frostSnip** from the Start Menu
5. Use **Ctrl+Shift+F** or **Rectangle** / **Full screen**

Uninstall: Windows **Settings → Apps → frostSnip**

### Build the setup file

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

If GitHub Releases are not published yet, either:

1. Build the desktop app first (`pnpm install:win`), then run `frostsnip` from this repo, or
2. Point at an installer URL:

```bash
set FROSTSNIP_DOWNLOAD_URL=https://example.com/frostSnip_0.1.0_x64-setup.exe
frostsnip install
```

Package source: `packages/npm-frostsnip`  
Publish: `cd packages/npm-frostsnip && npm publish --access public`

---

## D. pip / PyPI (desktop app)

```bash
pip install frostsnip
frostsnip
```

Or:

```bash
pipx run frostsnip
```

Same commands as npm: `install`, `path`, `help`.  
Same env vars: `FROSTSNIP_REPO`, `FROSTSNIP_DOWNLOAD_URL`.

Package source: `packages/pypi-frostsnip`  
Publish:

```bash
cd packages/pypi-frostsnip
python -m pip install build twine
python -m build
python -m twine upload dist/*
```

---

## Common mix-ups

| Mistake | Fix |
|---------|-----|
| `npm install frostsnip` then looking in Chrome | npm installs the **desktop** app. For Chrome use section **B**. |
| `pip install frostsnip` expecting a Python library API | This package is an **installer/launcher**, not a Python OCR API. |
| Loading the repo root in “Load unpacked” | Load `apps/extension/dist`. |
| `frostsnip` fails with “No GitHub release” | Build locally (`pnpm install:win`) or set `FROSTSNIP_DOWNLOAD_URL`. |

---

## Checklist

**Desktop (A / C / D)**

- [ ] frostSnip opens
- [ ] `Ctrl+Shift+F` starts a snip

**Extension (B)**

- [ ] Enabled on `chrome://extensions` or `edge://extensions`
- [ ] Toolbar icon captures the tab
