# Install Frostsnip on Windows (offline)

Frostsnip installs like a normal Windows app — **not from a website**. You build (or use) a local `.exe` installer, then run it once.

## What you get

After install:

- **Start Menu** → Frostsnip
- **Desktop** shortcut
- Tray icon for quick capture
- Hotkey: `Win+Shift+R` (falls back to `Ctrl+Shift+R`)

Installer files are produced under:

```
apps/desktop/src-tauri/target/release/bundle/nsis/
apps/desktop/src-tauri/target/release/bundle/msi/
```

Typical names:

- `Frostsnip_0.1.0_x64-setup.exe` — NSIS wizard (recommended)
- `Frostsnip_0.1.0_x64_en-US.msi` — MSI for enterprise / silent install

## One-time build prerequisites

1. **Node.js 20+** and **pnpm**
2. **Rust** ([rustup](https://rustup.rs/))
3. **Visual Studio Build Tools** with “Desktop development with C++”
4. **WebView2** is usually already on Windows 10/11; the installer can bootstrap it if missing

```powershell
# From the repo root
pnpm install
```

## Build the Windows installer

```powershell
pnpm --filter @snapshort/desktop tauri:build
```

Or from repo root:

```powershell
pnpm install:win
```

When the build finishes, open the `nsis` folder and double-click the `-setup.exe`.

## Install on this PC

1. Run `Frostsnip_*_x64-setup.exe`
2. Choose install folder (default is fine)
3. Finish → launch Frostsnip from Start Menu

Shortcuts are created by the NSIS installer automatically. Uninstall anytime from **Settings → Apps → Frostsnip**.

## Silent / IT install (MSI)

```powershell
msiexec /i Frostsnip_0.1.0_x64_en-US.msi /qn
```

## Share with others (still offline)

Copy the `.exe` or `.msi` to a USB drive / shared folder. Recipients do **not** need Node, Rust, or the internet to install — only WebView2 (already present on most Windows machines).

## Dev mode (no installer)

```powershell
pnpm --filter @snapshort/desktop tauri:dev
```
