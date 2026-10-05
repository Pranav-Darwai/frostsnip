use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{ImageFormat, RgbaImage};
use serde::Serialize;
use std::io::Cursor;
use std::path::PathBuf;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, RunEvent,
};
use xcap::Monitor;

#[derive(Serialize)]
struct CaptureResult {
    png_base64: String,
    width: u32,
    height: u32,
    /// Monitor origin in physical pixels
    origin_x: i32,
    origin_y: i32,
    scale_factor: f64,
}

#[cfg(windows)]
fn cursor_pos() -> (i32, i32) {
    #[link(name = "user32")]
    extern "system" {
        fn GetCursorPos(lp_point: *mut Point) -> i32;
    }
    #[repr(C)]
    struct Point {
        x: i32,
        y: i32,
    }
    let mut pt = Point { x: 0, y: 0 };
    unsafe {
        GetCursorPos(&mut pt);
    }
    (pt.x, pt.y)
}

#[cfg(not(windows))]
fn cursor_pos() -> (i32, i32) {
    (0, 0)
}

fn monitor_containing(x: i32, y: i32, monitors: &[Monitor]) -> Option<&Monitor> {
    monitors.iter().find(|m| {
        let left = m.x();
        let top = m.y();
        let right = left + m.width() as i32;
        let bottom = top + m.height() as i32;
        x >= left && x < right && y >= top && y < bottom
    })
}

fn pick_monitor<'a>(
    monitors: &'a [Monitor],
    cursor_x: Option<i32>,
    cursor_y: Option<i32>,
) -> Option<&'a Monitor> {
    let (cx, cy) = match (cursor_x, cursor_y) {
        (Some(x), Some(y)) => (x, y),
        _ => cursor_pos(),
    };
    if let Some(m) = monitor_containing(cx, cy, monitors) {
        return Some(m);
    }
    monitors
        .iter()
        .find(|m| m.is_primary())
        .or_else(|| monitors.first())
}

/// Capture only the monitor under the cursor (like Win+Shift+S on that display).
#[tauri::command]
fn capture_fullscreen(cursor_x: Option<i32>, cursor_y: Option<i32>) -> Result<CaptureResult, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    if monitors.is_empty() {
        return Err("No monitor found".to_string());
    }

    let monitor = pick_monitor(&monitors, cursor_x, cursor_y)
        .ok_or_else(|| "No monitor found".to_string())?;

    let scale_factor = f64::from(monitor.scale_factor());
    let origin_x = monitor.x();
    let origin_y = monitor.y();
    let image = monitor.capture_image().map_err(|e| e.to_string())?;
    let width = image.width();
    let height = image.height();

    let rgba: RgbaImage = RgbaImage::from_raw(width, height, image.into_raw())
        .ok_or_else(|| "bad image buffer".to_string())?;

    let mut png_bytes: Vec<u8> = Vec::new();
    rgba
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(CaptureResult {
        png_base64: STANDARD.encode(png_bytes),
        width,
        height,
        origin_x,
        origin_y,
        scale_factor,
    })
}

/// Write a PNG from a base64 payload to a user-chosen path (Save dialog).
#[tauri::command]
fn save_png_bytes(path: String, png_base64: String) -> Result<(), String> {
    let bytes = STANDARD
        .decode(png_base64.trim())
        .map_err(|e| format!("Invalid PNG data: {e}"))?;
    let target = PathBuf::from(&path);
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }
    std::fs::write(&target, bytes).map_err(|e| e.to_string())
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn fire_capture(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.eval("window.dispatchEvent(new Event('snapshort-capture'))");
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            focus_main(app);
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    use tauri_plugin_global_shortcut::ShortcutState;
                    if event.state == ShortcutState::Pressed {
                        fire_capture(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut,
                };
                // Same idea as Win+Shift+S, but Ctrl+Shift+F for frostSnip
                let primary = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyF);
                if let Err(err) = app.global_shortcut().register(primary) {
                    eprintln!("[frostsnip] Ctrl+Shift+F unavailable ({err})");
                    // Fallbacks if another app owns Ctrl+Shift+F (e.g. IDE Find in Files)
                    let fallbacks = [
                        Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::KeyF),
                        Shortcut::new(
                            Some(Modifiers::CONTROL | Modifiers::ALT | Modifiers::SHIFT),
                            Code::KeyF,
                        ),
                    ];
                    for fb in fallbacks {
                        if app.global_shortcut().register(fb).is_ok() {
                            eprintln!("[frostsnip] registered fallback hotkey");
                            break;
                        }
                    }
                } else {
                    eprintln!("[frostsnip] Ctrl+Shift+F registered");
                }
            }

            let show = MenuItem::with_id(app, "capture", "New Capture", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("frostSnip - Ctrl+Shift+F")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "capture" => {
                        fire_capture(app);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![capture_fullscreen, save_png_bytes])
        .build(tauri::generate_context!())
        .expect("error while building frostSnip")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = &event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
