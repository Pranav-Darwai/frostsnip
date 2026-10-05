use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{ImageFormat, RgbaImage};
use serde::Serialize;
use std::io::Cursor;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use xcap::Monitor;

#[derive(Serialize)]
struct CaptureResult {
    png_base64: String,
    width: u32,
    height: u32,
    scale_factor: f64,
}

#[tauri::command]
fn capture_fullscreen() -> Result<CaptureResult, String> {
    let monitors = Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .into_iter()
        .max_by_key(|m| {
            let w = m.width() as u64;
            let h = m.height() as u64;
            w * h
        })
        .ok_or_else(|| "No monitor found".to_string())?;

    let scale_factor = f64::from(monitor.scale_factor());
    let image = monitor.capture_image().map_err(|e| e.to_string())?;
    let width = image.width();
    let height = image.height();

    // Rebuild as RgbaImage to guarantee full-res lossless PNG encode
    let rgba: RgbaImage =
        RgbaImage::from_raw(width, height, image.into_raw()).ok_or_else(|| "bad image buffer".to_string())?;

    let mut png_bytes: Vec<u8> = Vec::new();
    rgba
        .write_to(&mut Cursor::new(&mut png_bytes), ImageFormat::Png)
        .map_err(|e| e.to_string())?;

    Ok(CaptureResult {
        png_base64: STANDARD.encode(png_bytes),
        width,
        height,
        scale_factor,
    })
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Frostsnip is ready.", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let show = MenuItem::with_id(app, "capture", "New Capture", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "capture" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                            let _ = win.eval("window.dispatchEvent(new Event('snapshort-capture'))");
                        }
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
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![capture_fullscreen, greet])
        .run(tauri::generate_context!())
        .expect("error while running Frostsnip");
}
