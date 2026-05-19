use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::memo_overlay::{exit_quick_copy_mode, QuickCopyModeState};

const OVERLAY_LABEL: &str = "memo-overlay";
const MAIN_WINDOW_LABEL: &str = "main";
const PASTE_SETTLE_MS: u64 = 50;

#[derive(Clone, Default)]
pub struct PasteTargetState(pub Arc<Mutex<Option<isize>>>);

pub enum PasteOutcome {
    Pasted,
    ClipboardOnly,
    MainWindowPaste,
}

#[derive(Clone, Serialize)]
struct PasteBindingPayload {
    text: String,
    binding_key: u8,
}

pub fn capture_paste_target(paste_target: &PasteTargetState) {
    let hwnd = capture_foreground_hwnd();
    if let Ok(mut guard) = paste_target.0.lock() {
        *guard = hwnd;
    }
}

pub fn resolve_paste_target_hwnd(app: &AppHandle) -> Option<isize> {
    app.try_state::<PasteTargetState>()
        .and_then(|state| state.0.lock().ok().and_then(|guard| *guard))
}

pub fn perform_quick_copy_paste(
    app: &AppHandle,
    quick_copy: &QuickCopyModeState,
    text: String,
    binding_key: u8,
) {
    let app_handle = app.clone();
    let quick_copy = quick_copy.clone();

    thread::spawn(move || {
        let target_hwnd = resolve_paste_target_hwnd(&app_handle);
        let outcome = paste_binding_text(&text, target_hwnd);
        thread::sleep(Duration::from_millis(PASTE_SETTLE_MS));
        let app_for_main = app_handle.clone();
        let text_for_main = text.clone();
        let _ = app_handle.run_on_main_thread(move || {
            match outcome {
                PasteOutcome::MainWindowPaste => {
                    log::info!(
                        "[self-paste-diag] substrate self-target: routing to paste-binding-text (binding_key={}) at {}",
                        binding_key,
                        diag_timestamp_ms()
                    );
                    emit_paste_binding_to_main(&app_for_main, &text_for_main, binding_key);
                }
                PasteOutcome::ClipboardOnly => {
                    emit_overlay_event(&app_for_main, "quick-copy-copied-to-clipboard");
                }
                PasteOutcome::Pasted => {}
            }
            exit_quick_copy_mode(&app_for_main, &quick_copy);
        });
    });
}

pub fn emit_quick_copy_unbound(app: &AppHandle) {
    emit_overlay_event(app, "quick-copy-unbound");
}

fn emit_paste_binding_to_main(app: &AppHandle, text: &str, binding_key: u8) {
    let payload = PasteBindingPayload {
        text: text.to_owned(),
        binding_key,
    };
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        log::info!(
            "[self-paste-diag] BEFORE emit paste-binding-text binding_key={} text_len={} at {}",
            binding_key,
            text.len(),
            diag_timestamp_ms()
        );
        let _ = main.set_focus();
        let emit_result = main.emit("paste-binding-text", payload);
        log::info!(
            "[self-paste-diag] AFTER emit paste-binding-text binding_key={} emit_ok={} at {}",
            binding_key,
            emit_result.is_ok(),
            diag_timestamp_ms()
        );
    } else {
        log::warn!(
            "[self-paste-diag] emit paste-binding-text skipped: main window not found at {}",
            diag_timestamp_ms()
        );
    }
}

fn diag_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn emit_overlay_event(app: &AppHandle, event: &str) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.emit(event, ());
    }
    let _ = app.emit(event, ());
}

fn paste_binding_text(text: &str, target_hwnd: Option<isize>) -> PasteOutcome {
    if !write_clipboard_text(text) {
        log::warn!("quick copy: clipboard write failed");
        return PasteOutcome::ClipboardOnly;
    }

    let Some(hwnd) = target_hwnd else {
        return PasteOutcome::ClipboardOnly;
    };

    #[cfg(windows)]
    {
        if is_substrate_process_window(hwnd) {
            log::info!(
                "[self-paste-diag] paste_binding_text: substrate HWND={:#x} → MainWindowPaste at {}",
                hwnd,
                diag_timestamp_ms()
            );
            return PasteOutcome::MainWindowPaste;
        }
        if paste_to_target_window(hwnd) {
            return PasteOutcome::Pasted;
        }
    }

    PasteOutcome::ClipboardOnly
}

#[cfg(windows)]
fn is_substrate_process_window(hwnd: isize) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetWindowThreadProcessId, IsWindow};

    let target = HWND(hwnd as _);
    unsafe {
        if !IsWindow(target).as_bool() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(target, Some(&mut pid));
        pid == std::process::id()
    }
}

#[cfg(not(windows))]
fn is_substrate_process_window(_hwnd: isize) -> bool {
    false
}

#[cfg(windows)]
fn capture_foreground_hwnd() -> Option<isize> {
    use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0 == 0 {
            None
        } else {
            Some(hwnd.0 as isize)
        }
    }
}

#[cfg(not(windows))]
fn capture_foreground_hwnd() -> Option<isize> {
    None
}

#[cfg(windows)]
fn paste_to_target_window(hwnd: isize) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::IsWindow;

    let target = HWND(hwnd as _);
    unsafe {
        if !IsWindow(target).as_bool() {
            return false;
        }
        if !activate_window(target) {
            return false;
        }
        send_ctrl_v();
        true
    }
}

#[cfg(windows)]
unsafe fn activate_window(target: windows::Win32::Foundation::HWND) -> bool {
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, SetForegroundWindow, ShowWindow, SW_SHOW,
    };

    let _ = ShowWindow(target, SW_SHOW);
    let _ = BringWindowToTop(target);
    SetForegroundWindow(target).as_bool()
}

#[cfg(windows)]
unsafe fn send_ctrl_v() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, KEYEVENTF_KEYUP, VIRTUAL_KEY,
        VK_CONTROL, VK_V,
    };

    let ctrl = VIRTUAL_KEY(VK_CONTROL.0);
    let v = VIRTUAL_KEY(VK_V.0);

    let inputs = [
        key_input(ctrl, Default::default()),
        key_input(v, Default::default()),
        key_input(v, KEYEVENTF_KEYUP),
        key_input(ctrl, KEYEVENTF_KEYUP),
    ];

    let _ = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
}

#[cfg(windows)]
unsafe fn key_input(
    vk: windows::Win32::UI::Input::KeyboardAndMouse::VIRTUAL_KEY,
    flags: windows::Win32::UI::Input::KeyboardAndMouse::KEYBD_EVENT_FLAGS,
) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::{INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT};
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn write_clipboard_text(text: &str) -> bool {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(text.to_owned()))
        .is_ok()
}
