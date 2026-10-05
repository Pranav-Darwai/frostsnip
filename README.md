# frostSnip

<p align="center">
  <img src="branding/frostsnip-icon-512.png" alt="frostSnip" width="128" height="128" />
</p>

<p align="center">
  <strong>Privacy-first snipping</strong><br/>
  Capture, find sensitive data on your PC, pixelate it, then share.
</p>

## Install options

| Method | Installs | Command / action |
|--------|----------|------------------|
| **Windows setup** | Desktop app | Run `frostSnip_*_x64-setup.exe` |
| **npm** | Desktop app | `npm i -g frostsnip` then `frostsnip` |
| **pip** | Desktop app | `pip install frostsnip` then `frostsnip` |
| **Browser extension** | Chrome/Edge only | Load unpacked `apps/extension/dist` |

Full steps and troubleshooting: **[INSTALL.md](./INSTALL.md)**

```bash
# Desktop via npm
npm install -g frostsnip
frostsnip

# Desktop via pip
pip install frostsnip
frostsnip
```

> npm and pip install the **desktop app**, not the browser extension.

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

## Publish installers to registries

1. Build desktop: `pnpm install:win`
2. Upload `frostSnip_0.1.0_x64-setup.exe` to GitHub Releases
3. Publish npm: `cd packages/npm-frostsnip && npm publish --access public`
4. Publish PyPI: `cd packages/pypi-frostsnip && python -m build && twine upload dist/*`

## Brand

Assets in [`branding/`](./branding/). Product name: **frostSnip**.

## License

MIT
