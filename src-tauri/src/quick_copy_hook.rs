//! Low-level keyboard hook: consumes digit/Esc keys during quick copy mode before
//! they reach other applications.

use std::sync::atomic::{AtomicBool, AtomicIsize, AtomicU8, Ordering};
use std::sync::Once;

const PENDING_NONE: u8 = 0;
const PENDING_ESC: u8 = 254;

static HOOK_THREAD_ONCE: Once = Once::new();
static HOOK_HANDLE: AtomicIsize = AtomicIsize::new(0);
static QUICK_COPY_HOOK_ACTIVE: AtomicBool = AtomicBool::new(false);
static PENDING_KEY: AtomicU8 = AtomicU8::new(PENDING_NONE);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PendingKey {
    Digit(u8),
    Escape,
}

pub fn ensure_hook_thread() {
    HOOK_THREAD_ONCE.call_once(|| {
        std::thread::spawn(hook_message_loop);
    });
}

pub fn set_active(active: bool) {
    QUICK_COPY_HOOK_ACTIVE.store(active, Ordering::SeqCst);
    if !active {
        PENDING_KEY.store(PENDING_NONE, Ordering::SeqCst);
    }
}

pub fn clear_pending() {
    PENDING_KEY.store(PENDING_NONE, Ordering::SeqCst);
}

#[cfg(windows)]
pub fn take_pending() -> Option<PendingKey> {
    match PENDING_KEY.swap(PENDING_NONE, Ordering::SeqCst) {
        PENDING_NONE => None,
        PENDING_ESC => Some(PendingKey::Escape),
        d @ 1..=9 => Some(PendingKey::Digit(d)),
        _ => None,
    }
}

#[cfg(not(windows))]
pub fn take_pending() -> Option<PendingKey> {
    None
}

#[cfg(windows)]
fn vk_to_digit(vk: u32) -> Option<u8> {
    match vk {
        0x31..=0x39 => Some((vk - 0x30) as u8),
        0x61..=0x69 => Some((vk - 0x60) as u8),
        _ => None,
    }
}

#[cfg(windows)]
fn call_next_hook(
    code: i32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::LRESULT;
    use windows::Win32::UI::WindowsAndMessaging::{CallNextHookEx, HHOOK};

    let handle = HOOK_HANDLE.load(Ordering::Relaxed);
    let hook = if handle == 0 {
        HHOOK::default()
    } else {
        HHOOK(handle as _)
    };
    unsafe { CallNextHookEx(hook, code, wparam, lparam) }
}

#[cfg(windows)]
fn hook_timestamp_ms() -> u128 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[cfg(windows)]
fn hook_message_loop() {
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_SYSKEYDOWN,
    };

    const LLKHF_UP: u32 = 0x80;
    const LLKHF_REPEAT: u32 = 0x40000000;

    unsafe extern "system" fn low_level_keyboard_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code < 0 || !QUICK_COPY_HOOK_ACTIVE.load(Ordering::SeqCst) {
            return call_next_hook(code, wparam, lparam);
        }

        let msg = wparam.0 as u32;
        if msg != WM_KEYDOWN && msg != WM_SYSKEYDOWN {
            return call_next_hook(code, wparam, lparam);
        }

        let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if kb.flags.0 & LLKHF_UP != 0 {
            return call_next_hook(code, wparam, lparam);
        }

        if kb.flags.0 & LLKHF_REPEAT != 0 {
            if vk_to_digit(kb.vkCode).is_some() || kb.vkCode == 0x1B {
                return LRESULT(1);
            }
        }

        if kb.vkCode == 0x1B {
            let _ = PENDING_KEY.compare_exchange(
                PENDING_NONE,
                PENDING_ESC,
                Ordering::SeqCst,
                Ordering::SeqCst,
            );
            return LRESULT(1);
        }

        if let Some(digit) = vk_to_digit(kb.vkCode) {
            let consumed = PENDING_KEY
                .compare_exchange(
                    PENDING_NONE,
                    digit,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                )
                .is_ok();
            log::info!(
                "[self-paste-diag] hook digit {} vkCode={:#x}: {} at {}",
                digit,
                kb.vkCode,
                if consumed {
                    "CONSUMED (not passed to OS)"
                } else {
                    "duplicate (already pending, still blocked)"
                },
                hook_timestamp_ms()
            );
            return LRESULT(1);
        }

        call_next_hook(code, wparam, lparam)
    }

    unsafe {
        let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), None, 0) {
            Ok(h) => h,
            Err(err) => {
                log::error!("quick copy keyboard hook failed to install: {err:?}");
                return;
            }
        };
        HOOK_HANDLE.store(hook.0 as isize, Ordering::Relaxed);
        log::info!("quick copy keyboard hook installed");

        let mut msg = MSG::default();
        while GetMessageW(&mut msg, HWND::default(), 0, 0).into() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        let _ = UnhookWindowsHookEx(hook);
        HOOK_HANDLE.store(0, Ordering::Relaxed);
    }
}

#[cfg(not(windows))]
fn hook_message_loop() {}
