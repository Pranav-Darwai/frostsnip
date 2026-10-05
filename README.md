# frostSnip

<p align="center">
  <img src="branding/frostsnip-icon-512.png" alt="frostSnip" width="128" height="128" />
</p>

<p align="center">
  <strong>Privacy-first snipping</strong><br/>
  Capture, find sensitive data on your PC, pixelate it, then share.
</p>

## Install

| Method | Installs | Command / link |
|--------|----------|----------------|
| **pip** | Desktop app | `pip install frostsnip` then `python -m frostsnip` |
| **npm / npx** | Desktop app | `npx frostsnip` or `npm i -g frostsnip` |
| **Windows setup** | Desktop app | [GitHub Release v0.1.0](https://github.com/Pranav-Darwai/frostsnip/releases/tag/v0.1.0) |
| **Browser extension** | Chrome/Edge only | Load unpacked `apps/extension/dist` |

```bash
# Python
pip install frostsnip
python -m frostsnip

# Node
npx frostsnip
```

> npm and pip install the **desktop app**, not the browser extension.

Packages:
- PyPI: https://pypi.org/project/frostsnip/
- npm: https://www.npmjs.com/package/frostsnip
- Releases: https://github.com/Pranav-Darwai/frostsnip/releases

Full steps and troubleshooting: **[INSTALL.md](./INSTALL.md)**

## Hotkeys (desktop)

- Screenshot: `Ctrl+Shift+F` (change in Settings)
- Editor: `Ctrl+Z` undo, `Ctrl+C` copy, `Ctrl+S` save

## Develop

```bash
pnpm install
pnpm test
pnpm --filter @snapshort/desktop tauri:dev
pnpm --filter @snapshort/extension build
```

Build a Windows installer locally: `pnpm install:win`

## Brand

Assets in [`branding/`](./branding/). Product name: **frostSnip**.

## License

MIT
