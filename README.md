# Frostsnip

<p align="center">
  <img src="branding/frostsnip-icon-512.png" alt="Frostsnip" width="128" height="128" />
</p>

<p align="center">
  <strong>Privacy-first snipping tool</strong><br/>
  Capture → auto-find sensitive data → frost it before you share.
</p>

Lossless **PNG** capture with Snipping Tool–style UX. Emails, phones, cards, passbooks, invoices, and more are detected locally and frosted in-app. Nothing leaves your machine for OCR or redaction.

## Apps

| App | Role |
|-----|------|
| **Frostsnip Desktop** (Win/Mac) | Compact snip bar, hotkey capture, full editor |
| **Frostsnip** (Chrome/Edge) | Annotate + Locate PII |
| **Frostsnip Lite** | Capture + auto PII frost |

## Install on Windows (native, offline)

```powershell
pnpm install
pnpm install:win
```

Run the setup from `apps/desktop/src-tauri/target/release/bundle/nsis/`.

Details: [INSTALL.md](./INSTALL.md)

## Hotkeys

- Windows: `Win+Shift+R` (falls back to `Ctrl+Shift+R`)
- macOS: `Cmd+Shift+R`
- Extension: `Ctrl/Cmd+Shift+R`

Editor: `Ctrl/Cmd+Z` undo · `Ctrl/Cmd+C` copy · `Ctrl/Cmd+S` save

## Develop

```bash
pnpm install
pnpm test
pnpm --filter @snapshort/desktop tauri:dev
pnpm --filter @snapshort/extension build
pnpm --filter @snapshort/extension-lite build
```

Load unpacked extensions from `apps/extension/dist` or `apps/extension-lite/dist`.

## Brand

Logo and icons live in [`branding/`](./branding/). Product name is **Frostsnip**.

## License

MIT
