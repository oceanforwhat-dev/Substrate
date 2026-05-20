use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

/// Set by memo switch polling when a non-tap key is pressed while Ctrl is held (e.g. arrows).
static CTRL_CHORD_BLOCK_TAP: AtomicBool = AtomicBool::new(false);
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::quick_copy_hook::{self, PendingKey};
use crate::quick_copy_paste::{
    capture_paste_target, emit_quick_copy_unbound, perform_quick_copy_paste, PasteTargetState,
};

static OVERLAY_CLOSE_GENERATION: AtomicU64 = AtomicU64::new(0);

#[cfg(not(windows))]
use device_query::{DeviceQuery, DeviceState};

/// Button array is 1-based (index 0 unused): 1=L, 2=R, 3=M, 4=X1, 5=X2.
const MOUSE_BUTTON_MIDDLE: usize = 3;
use tauri::{
    AppHandle, Emitter, Listener, Manager, Monitor, PhysicalPosition, State, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

pub const OVERLAY_LABEL: &str = "memo-overlay";
const MAIN_WINDOW_LABEL: &str = "main";
const OVERLAY_WIDTH: f64 = 450.0;
const OVERLAY_HEIGHT: f64 = 700.0;
const CURSOR_GAP: f64 = 20.0;
/// Maximum press duration to count as a click (not a hold).
const CLICK_MAX_DURATION: Duration = Duration::from_millis(500);
const POLL_INTERVAL: Duration = Duration::from_millis(8);
const SHIFT_DOUBLE_PRESS_WINDOW: Duration = Duration::from_millis(400);
const CTRL_TAP_MAX_DURATION: Duration = Duration::from_millis(400);
const OVERLAY_FADE_OUT: Duration = Duration::from_millis(150);
const MEMO_SWITCH_COOLDOWN: Duration = Duration::from_millis(100);

#[derive(Clone, Default)]
pub struct EquippedMemoState(pub Arc<Mutex<Option<String>>>);

#[derive(Clone, Default)]
pub struct QuickCopyModeState(pub Arc<AtomicBool>);

/// Prevents double-trigger when frontend capture and hook/polling both see the same digit press.
#[derive(Clone, Default)]
pub struct QuickCopyDigitDedup(pub Arc<Mutex<QuickCopyDigitDedupInner>>);

#[derive(Default)]
struct QuickCopyDigitDedupInner {
    frontend_suppress_until_release: [bool; 10],
    backend_handled_until_release: [bool; 10],
}

impl QuickCopyDigitDedup {
    fn reset_all(&self) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = QuickCopyDigitDedupInner::default();
        }
    }

    fn mark_frontend_handled(&self, digit: u8) {
        if let Ok(mut guard) = self.0.lock() {
            guard.frontend_suppress_until_release[digit as usize] = true;
        }
    }

    fn mark_backend_handled(&self, digit: u8) {
        if let Ok(mut guard) = self.0.lock() {
            guard.backend_handled_until_release[digit as usize] = true;
        }
    }

    fn is_frontend_suppressed(&self, digit: u8) -> bool {
        self.0
            .lock()
            .map(|g| g.frontend_suppress_until_release[digit as usize])
            .unwrap_or(false)
    }

    fn is_backend_handled(&self, digit: u8) -> bool {
        self.0
            .lock()
            .map(|g| g.backend_handled_until_release[digit as usize])
            .unwrap_or(false)
    }

    fn sync_digit_release(&self, digit: u8, key_down: bool) {
        if key_down {
            return;
        }
        if let Ok(mut guard) = self.0.lock() {
            let idx = digit as usize;
            guard.frontend_suppress_until_release[idx] = false;
            guard.backend_handled_until_release[idx] = false;
        }
    }
}

#[derive(Clone, Serialize)]
struct QuickCopyActivePayload {
    active: bool,
}

impl QuickCopyModeState {
    fn is_active(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[derive(Debug, Deserialize)]
struct MemoBindingJson {
    key: i32,
    label: String,
    text: String,
}

#[derive(Debug, Deserialize)]
struct MemoJson {
    #[serde(default)]
    bindings: Vec<MemoBindingJson>,
}

struct MouseListenerState {
    cursor: Mutex<CursorPosition>,
    middle_press: Mutex<Option<MiddlePress>>,
}

#[derive(Clone, Copy, Default)]
struct CursorPosition {
    x: f64,
    y: f64,
}

#[derive(Clone, Copy)]
struct MiddlePress {
    at: Instant,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ShiftDoublePressPhase {
    Idle,
    /// First Shift down; window ends at first_press_at + SHIFT_DOUBLE_PRESS_WINDOW.
    FirstDown { first_press_at: Instant },
    /// Released after first press; waiting for second press before window expires.
    ReleasedAfterFirst { first_press_at: Instant },
}

struct ShiftDoublePressTracker {
    phase: ShiftDoublePressPhase,
    shift_was_pressed: bool,
    left_was_pressed: bool,
    right_was_pressed: bool,
}

impl ShiftDoublePressTracker {
    fn new() -> Self {
        Self {
            phase: ShiftDoublePressPhase::Idle,
            shift_was_pressed: false,
            left_was_pressed: false,
            right_was_pressed: false,
        }
    }

    fn reset(&mut self) {
        self.phase = ShiftDoublePressPhase::Idle;
    }

    fn update(
        &mut self,
        app: &AppHandle,
        left_pressed: bool,
        right_pressed: bool,
        cursor: (f64, f64),
    ) {
        let shift_pressed = left_pressed || right_pressed;

        self.expire_window_if_needed();

        if shift_pressed && !self.shift_was_pressed {
            let side = if left_pressed && !self.left_was_pressed {
                "L"
            } else if right_pressed && !self.right_was_pressed {
                "R"
            } else {
                "L/R"
            };
            self.on_shift_down(app, side, cursor);
        } else if !shift_pressed && self.shift_was_pressed {
            self.on_shift_up();
        }

        self.shift_was_pressed = shift_pressed;
        self.left_was_pressed = left_pressed;
        self.right_was_pressed = right_pressed;
    }

    fn expire_window_if_needed(&mut self) {
        let first_press_at = match self.phase {
            ShiftDoublePressPhase::FirstDown { first_press_at }
            | ShiftDoublePressPhase::ReleasedAfterFirst { first_press_at } => first_press_at,
            ShiftDoublePressPhase::Idle => return,
        };

        if first_press_at.elapsed() > SHIFT_DOUBLE_PRESS_WINDOW {
            self.reset();
        }
    }

    fn on_shift_down(&mut self, app: &AppHandle, _side: &str, cursor: (f64, f64)) {
        match self.phase {
            ShiftDoublePressPhase::Idle => {
                let first_press_at = Instant::now();
                log::info!("[shift-diag] shift first press");
                self.phase = ShiftDoublePressPhase::FirstDown { first_press_at };
            }
            ShiftDoublePressPhase::ReleasedAfterFirst { first_press_at } => {
                if first_press_at.elapsed() <= SHIFT_DOUBLE_PRESS_WINDOW {
                    let second_press_at = Instant::now();
                    log::info!(
                        "[shift-diag] shift second press (+{}ms from first press)",
                        first_press_at.elapsed().as_millis()
                    );
                    self.reset();
                    let app_handle = app.clone();
                    let (cx, cy) = cursor;
                    let _ = app.run_on_main_thread(move || {
                        log::info!(
                            "[shift-diag] toggle_overlay called (+{}ms from second press)",
                            second_press_at.elapsed().as_millis()
                        );
                        toggle_overlay(&app_handle, cx, cy, Some(second_press_at));
                    });
                } else {
                    log::info!("[shift-diag] shift first press (window expired)");
                    self.phase = ShiftDoublePressPhase::FirstDown {
                        first_press_at: Instant::now(),
                    };
                }
            }
            ShiftDoublePressPhase::FirstDown { .. } => {}
        }
    }

    fn on_shift_up(&mut self) {
        if let ShiftDoublePressPhase::FirstDown { first_press_at } = self.phase {
            log::info!(
                "[shift-diag] shift release (+{}ms from first press)",
                first_press_at.elapsed().as_millis()
            );
            self.phase = ShiftDoublePressPhase::ReleasedAfterFirst { first_press_at };
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum CtrlTapPhase {
    Idle,
    /// Ctrl held; tap is recognized on release within CTRL_TAP_MAX_DURATION (same window model as Shift).
    Pressed { press_at: Instant },
}

struct CtrlTapTracker {
    phase: CtrlTapPhase,
    ctrl_was_pressed: bool,
    left_was_pressed: bool,
    right_was_pressed: bool,
}

impl CtrlTapTracker {
    fn new() -> Self {
        Self {
            phase: CtrlTapPhase::Idle,
            ctrl_was_pressed: false,
            left_was_pressed: false,
            right_was_pressed: false,
        }
    }

    fn update(
        &mut self,
        app: &AppHandle,
        quick_copy: &QuickCopyModeState,
        left_pressed: bool,
        right_pressed: bool,
    ) {
        let ctrl_pressed = left_pressed || right_pressed;

        if ctrl_pressed && !self.ctrl_was_pressed {
            log::info!(
                "[ctrl-diag] raw ctrl press (L={} R={})",
                left_pressed,
                right_pressed
            );
            self.phase = CtrlTapPhase::Pressed {
                press_at: Instant::now(),
            };
        } else if !ctrl_pressed && self.ctrl_was_pressed {
            log::info!("[ctrl-diag] raw ctrl release");
            self.on_ctrl_up(app, quick_copy);
        }

        self.ctrl_was_pressed = ctrl_pressed;
        self.left_was_pressed = left_pressed;
        self.right_was_pressed = right_pressed;
    }

    fn on_ctrl_up(&mut self, app: &AppHandle, quick_copy: &QuickCopyModeState) {
        if CTRL_CHORD_BLOCK_TAP.swap(false, Ordering::SeqCst) {
            log::info!("[ctrl-diag] tap skipped: chord key pressed during ctrl hold");
            self.phase = CtrlTapPhase::Idle;
            return;
        }

        let tap = match self.phase {
            CtrlTapPhase::Pressed { press_at }
                if press_at.elapsed() <= CTRL_TAP_MAX_DURATION =>
            {
                Some(())
            }
            CtrlTapPhase::Pressed { press_at } => {
                log::info!(
                    "[ctrl-diag] tap rejected: hold duration_ms={}",
                    press_at.elapsed().as_millis()
                );
                None
            }
            _ => None,
        };
        self.phase = CtrlTapPhase::Idle;

        let Some(()) = tap else {
            return;
        };

        if app.get_webview_window(OVERLAY_LABEL).is_none() {
            return;
        }

        let app_handle = app.clone();
        let quick_copy = quick_copy.clone();
        let _ = app.run_on_main_thread(move || {
            if quick_copy.is_active() {
                exit_quick_copy_mode(&app_handle, &quick_copy);
            } else {
                enter_quick_copy_mode(&app_handle, &quick_copy);
            }
        });
    }
}

#[derive(Serialize)]
struct SwitchMemoPayload {
    direction: &'static str,
}

struct MemoSwitchKeyTracker {
    left_was_pressed: bool,
    right_was_pressed: bool,
    last_switch_at: Option<Instant>,
}

impl MemoSwitchKeyTracker {
    fn new() -> Self {
        Self {
            left_was_pressed: false,
            right_was_pressed: false,
            last_switch_at: None,
        }
    }

    fn update(&mut self, app: &AppHandle, ctrl_pressed: bool) {
        if !overlay_is_visible(app) {
            self.left_was_pressed = false;
            self.right_was_pressed = false;
            CTRL_CHORD_BLOCK_TAP.store(false, Ordering::SeqCst);
            return;
        }

        let (left_arrow, right_arrow) = poll_arrow_keys();

        if !ctrl_pressed {
            CTRL_CHORD_BLOCK_TAP.store(false, Ordering::SeqCst);
        } else if left_arrow || right_arrow {
            CTRL_CHORD_BLOCK_TAP.store(true, Ordering::SeqCst);
        }

        if ctrl_pressed {
            if left_arrow && !self.left_was_pressed {
                self.try_emit_switch(app, "prev");
            }
            if right_arrow && !self.right_was_pressed {
                self.try_emit_switch(app, "next");
            }
        }

        self.left_was_pressed = left_arrow;
        self.right_was_pressed = right_arrow;
    }

    fn try_emit_switch(&mut self, app: &AppHandle, direction: &'static str) {
        if let Some(last) = self.last_switch_at {
            if last.elapsed() < MEMO_SWITCH_COOLDOWN {
                return;
            }
        }
        self.last_switch_at = Some(Instant::now());
        log::info!("[switch-diag] switch-memo direction={direction}");
        emit_switch_memo(app, direction);
    }
}

fn emit_switch_memo(app: &AppHandle, direction: &'static str) {
    let payload = SwitchMemoPayload { direction };
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.emit("switch-memo", &payload);
    }
    let _ = app.emit("switch-memo", &payload);
}

struct QuickCopyKeyTracker {
    digit_was_pressed: [bool; 10],
    /// Suppress polling release handler for a digit already handled via the keyboard hook.
    digit_poll_suppress_until_release: [bool; 10],
    esc_was_pressed: bool,
}

impl QuickCopyKeyTracker {
    fn new() -> Self {
        Self {
            digit_was_pressed: [false; 10],
            digit_poll_suppress_until_release: [false; 10],
            esc_was_pressed: false,
        }
    }

    fn update(
        &mut self,
        app: &AppHandle,
        quick_copy: &QuickCopyModeState,
        equipped: &EquippedMemoState,
    ) {
        if !quick_copy.is_active() {
            self.reset_edges();
            if let Some(dedup) = app.try_state::<QuickCopyDigitDedup>() {
                dedup.reset_all();
            }
            #[cfg(windows)]
            quick_copy_hook::clear_pending();
            return;
        }

        let dedup = app.try_state::<QuickCopyDigitDedup>();

        #[cfg(windows)]
        {
            if let Some(key) = quick_copy_hook::take_pending() {
                if let PendingKey::Digit(digit) = key {
                    if let Some(dedup) = dedup.as_ref() {
                        if dedup.is_frontend_suppressed(digit) {
                            return;
                        }
                        dedup.mark_backend_handled(digit);
                    }
                    self.digit_poll_suppress_until_release[digit as usize] = true;
                }
                dispatch_quick_copy_key(app, quick_copy, equipped, key);
                return;
            }

            for digit in 1u8..=9 {
                let down = digit_key_down(digit);
                let idx = digit as usize;

                if let Some(dedup) = dedup.as_ref() {
                    if dedup.is_frontend_suppressed(digit) || dedup.is_backend_handled(digit) {
                        if !down {
                            dedup.sync_digit_release(digit, down);
                        }
                        self.digit_was_pressed[idx] = down;
                        continue;
                    }
                }

                if self.digit_poll_suppress_until_release[idx] {
                    if !down {
                        self.digit_poll_suppress_until_release[idx] = false;
                    }
                    self.digit_was_pressed[idx] = down;
                    continue;
                }

                if down && !self.digit_was_pressed[idx] {
                    self.digit_was_pressed[idx] = true;
                } else if !down && self.digit_was_pressed[idx] {
                    self.digit_was_pressed[idx] = false;
                    if let Some(dedup) = dedup.as_ref() {
                        if dedup.is_frontend_suppressed(digit) {
                            dedup.sync_digit_release(digit, down);
                            return;
                        }
                        dedup.mark_backend_handled(digit);
                    }
                    dispatch_quick_copy_key(app, quick_copy, equipped, PendingKey::Digit(digit));
                    return;
                } else {
                    self.digit_was_pressed[idx] = down;
                }
            }
        }

        #[cfg(not(windows))]
        {
            if poll_escape_down() && !self.esc_was_pressed {
                self.esc_was_pressed = true;
                let app_handle = app.clone();
                let quick_copy = quick_copy.clone();
                let _ = app.run_on_main_thread(move || {
                    exit_quick_copy_mode(&app_handle, &quick_copy);
                });
                return;
            }
            self.esc_was_pressed = poll_escape_down();

            for digit in 1u8..=9 {
                let down = digit_key_down(digit);
                let idx = digit as usize;
                if down && !self.digit_was_pressed[idx] {
                    self.digit_was_pressed[idx] = true;
                    dispatch_quick_copy_key(
                        app,
                        quick_copy,
                        equipped,
                        PendingKey::Digit(digit),
                    );
                    return;
                }
                self.digit_was_pressed[idx] = down;
            }
        }
    }

    fn reset_edges(&mut self) {
        self.digit_was_pressed = [false; 10];
        self.digit_poll_suppress_until_release = [false; 10];
        self.esc_was_pressed = false;
    }
}

fn self_paste_diag_timestamp_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn overlay_is_visible(app: &AppHandle) -> bool {
    app.get_webview_window(OVERLAY_LABEL).is_some()
}

fn emit_overlay_event(app: &AppHandle, event: &str) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        let _ = window.emit(event, ());
    }
    let _ = app.emit(event, ());
}

fn emit_quick_copy_active_to_main(app: &AppHandle, active: bool) {
    let payload = QuickCopyActivePayload { active };
    if let Some(main) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        let _ = main.emit("quick-copy-active", payload);
    }
}

pub fn dispatch_quick_copy_key(
    app: &AppHandle,
    quick_copy: &QuickCopyModeState,
    equipped: &EquippedMemoState,
    key: PendingKey,
) {
    match key {
        PendingKey::Escape => {
            let app_handle = app.clone();
            let quick_copy = quick_copy.clone();
            let _ = app.run_on_main_thread(move || {
                exit_quick_copy_mode(&app_handle, &quick_copy);
            });
        }
        PendingKey::Digit(digit) => {
            let app_handle = app.clone();
            let quick_copy = quick_copy.clone();
            if let Some((_, text)) = binding_for_digit(equipped, digit) {
                perform_quick_copy_paste(&app_handle, &quick_copy, text, digit);
            } else {
                let _ = app.run_on_main_thread(move || {
                    emit_quick_copy_unbound(&app_handle);
                });
            }
        }
    }
}

pub fn exit_quick_copy_mode(app: &AppHandle, quick_copy: &QuickCopyModeState) {
    if !quick_copy.0.swap(false, Ordering::SeqCst) {
        return;
    }
    quick_copy_hook::set_active(false);
    emit_overlay_event(app, "quick-copy-mode-exit");
    emit_quick_copy_active_to_main(app, false);
    if let Some(dedup) = app.try_state::<QuickCopyDigitDedup>() {
        dedup.reset_all();
    }
    log::info!("quick copy mode exited");
}

#[tauri::command]
pub fn notify_quick_copy_key(
    app: AppHandle,
    key: u32,
    quick_copy: State<'_, QuickCopyModeState>,
    equipped: State<'_, EquippedMemoState>,
    dedup: State<'_, QuickCopyDigitDedup>,
) -> Result<(), String> {
    if key < 1 || key > 9 {
        return Err(format!("invalid quick copy key: {key}"));
    }
    if !quick_copy.is_active() {
        return Ok(());
    }
    let digit = key as u8;
    if dedup.is_backend_handled(digit) {
        return Ok(());
    }
    dedup.mark_frontend_handled(digit);
    dispatch_quick_copy_key(&app, &quick_copy, &equipped, PendingKey::Digit(digit));
    Ok(())
}

fn enter_quick_copy_mode(app: &AppHandle, quick_copy: &QuickCopyModeState) {
    if !overlay_is_visible(app) {
        return;
    }
    if let Some(paste_target) = app.try_state::<PasteTargetState>() {
        capture_paste_target(&paste_target);
    }
    quick_copy.0.store(true, Ordering::SeqCst);
    quick_copy_hook::set_active(true);
    log::info!("[ctrl-diag] emitting quick-copy-mode-enter");
    emit_overlay_event(app, "quick-copy-mode-enter");
    emit_quick_copy_active_to_main(app, true);
    log::info!("quick copy mode entered");
}

fn binding_for_digit(equipped: &EquippedMemoState, digit: u8) -> Option<(String, String)> {
    let json = equipped.0.lock().ok().and_then(|g| g.clone())?;
    let memo: MemoJson = serde_json::from_str(&json).ok()?;
    memo.bindings
        .into_iter()
        .find(|b| b.key == digit as i32)
        .map(|b| (b.label, b.text))
}

fn middle_button_pressed(buttons: &[bool]) -> bool {
    buttons
        .get(MOUSE_BUTTON_MIDDLE)
        .copied()
        .unwrap_or(false)
}

#[cfg(windows)]
unsafe fn win_vk_down(vk: i32) -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, GetKeyState};
    GetAsyncKeyState(vk) < 0 || (GetKeyState(vk) as u16) & 0x8000 != 0
}

#[cfg(windows)]
fn poll_mouse_state() -> ((i32, i32), Vec<bool>) {
    use windows::Win32::Foundation::POINT;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        VK_LBUTTON, VK_MBUTTON, VK_RBUTTON, VK_XBUTTON1, VK_XBUTTON2,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut point = POINT::default();
        let _ = GetCursorPos(&mut point);

        (
            (point.x, point.y),
            vec![
                false,
                win_vk_down(VK_LBUTTON.0 as i32),
                win_vk_down(VK_RBUTTON.0 as i32),
                win_vk_down(VK_MBUTTON.0 as i32),
                win_vk_down(VK_XBUTTON1.0 as i32),
                win_vk_down(VK_XBUTTON2.0 as i32),
            ],
        )
    }
}

#[cfg(windows)]
fn poll_shift_keys() -> (bool, bool) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{VK_LSHIFT, VK_RSHIFT};
    unsafe {
        (
            win_vk_down(VK_LSHIFT.0 as i32),
            win_vk_down(VK_RSHIFT.0 as i32),
        )
    }
}

#[cfg(not(windows))]
fn poll_shift_keys() -> (bool, bool) {
    let _ = ();
    (false, false)
}

#[cfg(windows)]
fn poll_ctrl_keys() -> (bool, bool) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{VK_CONTROL, VK_LCONTROL, VK_RCONTROL};
    unsafe {
        let left = win_vk_down(VK_LCONTROL.0 as i32);
        let right = win_vk_down(VK_RCONTROL.0 as i32);
        // WebView focus may not surface VK_LCONTROL/VK_RCONTROL; VK_CONTROL mirrors Shift's reliable polling.
        let control = win_vk_down(VK_CONTROL.0 as i32);
        (left || (control && !right), right)
    }
}

#[cfg(not(windows))]
fn poll_ctrl_keys() -> (bool, bool) {
    let _ = ();
    (false, false)
}

#[cfg(windows)]
fn poll_arrow_keys() -> (bool, bool) {
    use windows::Win32::UI::Input::KeyboardAndMouse::{VK_LEFT, VK_RIGHT};
    unsafe {
        (
            win_vk_down(VK_LEFT.0 as i32),
            win_vk_down(VK_RIGHT.0 as i32),
        )
    }
}

#[cfg(not(windows))]
fn poll_arrow_keys() -> (bool, bool) {
    let _ = ();
    (false, false)
}

#[cfg(windows)]
fn poll_escape_down() -> bool {
    use windows::Win32::UI::Input::KeyboardAndMouse::VK_ESCAPE;
    unsafe { win_vk_down(VK_ESCAPE.0 as i32) }
}

#[cfg(not(windows))]
fn poll_escape_down() -> bool {
    false
}

#[cfg(windows)]
fn digit_key_down(digit: u8) -> bool {
    let main_vk = 0x30 + digit as i32;
    let numpad_vk = 0x60 + digit as i32;
    unsafe { win_vk_down(main_vk) || win_vk_down(numpad_vk) }
}

#[cfg(not(windows))]
fn digit_key_down(_digit: u8) -> bool {
    false
}

#[cfg(not(windows))]
fn poll_mouse_state() -> ((i32, i32), Vec<bool>) {
    let mouse = DeviceState::new().get_mouse();
    (mouse.coords, mouse.button_pressed)
}

#[tauri::command]
pub fn get_equipped_memo(state: State<'_, EquippedMemoState>) -> Option<String> {
    state.0.lock().ok().and_then(|g| g.clone())
}

#[tauri::command]
pub fn set_equipped_memo(state: State<'_, EquippedMemoState>, memo_data: Option<String>) {
    if let Ok(mut guard) = state.0.lock() {
        *guard = memo_data;
    }
}

#[tauri::command]
pub fn close_memo_overlay(app: AppHandle) {
    hide_overlay(&app);
}

#[tauri::command]
pub fn clamp_memo_overlay_position(app: AppHandle) {
    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        clamp_overlay_to_monitor(&app, &window);
    }
}

pub fn init(
    app: &AppHandle,
    state: EquippedMemoState,
    quick_copy: QuickCopyModeState,
) -> tauri::Result<()> {
    quick_copy_hook::ensure_hook_thread();
    register_equip_listeners(app, state.clone());
    spawn_global_mouse_listener(app.clone(), state, quick_copy);
    Ok(())
}

fn register_equip_listeners(app: &AppHandle, state: EquippedMemoState) {
    let equipped_state = state.clone();
    app.listen("memo-equipped", move |event| {
        let memo_data = serde_json::from_str::<String>(event.payload())
            .unwrap_or_else(|_| event.payload().to_string());
        if let Ok(mut guard) = equipped_state.0.lock() {
            *guard = Some(memo_data);
            log::info!("memo-equipped");
        }
    });

    let unequipped_state = state;
    app.listen("memo-unequipped", move |_event| {
        if let Ok(mut guard) = unequipped_state.0.lock() {
            *guard = None;
            log::info!("memo-unequipped");
        }
    });
}

fn spawn_global_mouse_listener(
    app: AppHandle,
    equipped_state: EquippedMemoState,
    quick_copy_state: QuickCopyModeState,
) {
    std::thread::spawn(move || {
        let listener_state = Arc::new(MouseListenerState {
            cursor: Mutex::new(CursorPosition::default()),
            middle_press: Mutex::new(None),
        });

        let mut middle_was_pressed = false;
        let mut shift_tracker = ShiftDoublePressTracker::new();
        let mut ctrl_tracker = CtrlTapTracker::new();
        let mut memo_switch_tracker = MemoSwitchKeyTracker::new();
        let mut quick_copy_keys = QuickCopyKeyTracker::new();

        loop {
            let (coords, buttons) = poll_mouse_state();
            let (left_shift, right_shift) = poll_shift_keys();
            let (left_ctrl, right_ctrl) = poll_ctrl_keys();
            let ctrl_pressed = left_ctrl || right_ctrl;

            if let Ok(mut pos) = listener_state.cursor.lock() {
                pos.x = coords.0 as f64;
                pos.y = coords.1 as f64;
            }

            let middle_pressed = middle_button_pressed(&buttons);

            if middle_pressed && !middle_was_pressed {
                if let Ok(mut press) = listener_state.middle_press.lock() {
                    *press = Some(MiddlePress {
                        at: Instant::now(),
                    });
                }
            }

            if !middle_pressed && middle_was_pressed {
                let press = listener_state
                    .middle_press
                    .lock()
                    .ok()
                    .and_then(|mut p| p.take());
                if let Some(press) = press {
                    if press.at.elapsed() <= CLICK_MAX_DURATION {
                        let (cx, cy) = listener_state
                            .cursor
                            .lock()
                            .map(|p| (p.x, p.y))
                            .unwrap_or((0.0, 0.0));
                        let app_handle = app.clone();
                        let _ = app.run_on_main_thread(move || {
                            toggle_overlay(&app_handle, cx, cy, None);
                        });
                    }
                }
            }

            middle_was_pressed = middle_pressed;

            let cursor = listener_state
                .cursor
                .lock()
                .map(|p| (p.x, p.y))
                .unwrap_or((0.0, 0.0));
            shift_tracker.update(&app, left_shift, right_shift, cursor);
            memo_switch_tracker.update(&app, ctrl_pressed);
            ctrl_tracker.update(&app, &quick_copy_state, left_ctrl, right_ctrl);
            quick_copy_keys.update(&app, &quick_copy_state, &equipped_state);

            std::thread::sleep(POLL_INTERVAL);
        }
    });
}

fn cancel_pending_overlay_close() {
    OVERLAY_CLOSE_GENERATION.fetch_add(1, Ordering::SeqCst);
}

fn toggle_overlay(app: &AppHandle, cursor_x: f64, cursor_y: f64, shift_second_press: Option<Instant>) {
    if app.get_webview_window(OVERLAY_LABEL).is_some() {
        hide_overlay(app);
        return;
    }
    show_overlay(app, cursor_x, cursor_y, shift_second_press);
}

fn monitor_work_bounds(monitor: &Monitor) -> (f64, f64, f64, f64) {
    let work = monitor.work_area();
    (
        work.position.x as f64,
        work.position.y as f64,
        work.size.width as f64,
        work.size.height as f64,
    )
}

fn point_in_monitor(x: f64, y: f64, monitor: &Monitor) -> bool {
    let pos = monitor.position();
    let size = monitor.size();
    let mx = pos.x as f64;
    let my = pos.y as f64;
    let mw = size.width as f64;
    let mh = size.height as f64;
    x >= mx && x < mx + mw && y >= my && y < my + mh
}

fn monitor_at_point(app: &AppHandle, x: f64, y: f64) -> Option<Monitor> {
    app.available_monitors()
        .ok()?
        .into_iter()
        .find(|monitor| point_in_monitor(x, y, monitor))
}

fn placement_fits(x: f64, y: f64, width: f64, height: f64, monitor: &Monitor) -> bool {
    let (mx, my, mw, mh) = monitor_work_bounds(monitor);
    x >= mx && y >= my && x + width <= mx + mw && y + height <= my + mh
}

fn clamp_to_work_area(x: f64, y: f64, width: f64, height: f64, monitor: &Monitor) -> (f64, f64) {
    let (mx, my, mw, mh) = monitor_work_bounds(monitor);
    let max_x = mx + mw - width;
    let max_y = my + mh - height;
    (x.clamp(mx, max_x.max(mx)), y.clamp(my, max_y.max(my)))
}

fn monitor_for_window(app: &AppHandle, window: &WebviewWindow) -> Option<Monitor> {
    let pos = window.outer_position().ok()?;
    let size = window.outer_size().ok()?;
    let center_x = pos.x as f64 + size.width as f64 / 2.0;
    let center_y = pos.y as f64 + size.height as f64 / 2.0;
    monitor_at_point(app, center_x, center_y).or_else(|| window.current_monitor().ok().flatten())
}

fn clamp_overlay_to_monitor(app: &AppHandle, window: &WebviewWindow) {
    let Ok(pos) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let (w, h) = (size.width as f64, size.height as f64);
    let Some(monitor) = monitor_for_window(app, window) else {
        return;
    };
    let (nx, ny) = clamp_to_work_area(pos.x as f64, pos.y as f64, w, h, &monitor);
    let nx_i = nx.round() as i32;
    let ny_i = ny.round() as i32;
    if nx_i != pos.x || ny_i != pos.y {
        let _ = window.set_position(PhysicalPosition::new(nx_i, ny_i));
    }
}

/// Preferred placements relative to cursor: top-right, bottom-right, top-left, bottom-left.
fn compute_overlay_position(
    cursor_x: f64,
    cursor_y: f64,
    width: f64,
    height: f64,
    monitor: &Monitor,
) -> (f64, f64) {
    let placements = [
        (cursor_x + CURSOR_GAP, cursor_y - height - CURSOR_GAP),
        (cursor_x + CURSOR_GAP, cursor_y + CURSOR_GAP),
        (cursor_x - width - CURSOR_GAP, cursor_y - height - CURSOR_GAP),
        (cursor_x - width - CURSOR_GAP, cursor_y + CURSOR_GAP),
    ];

    for (x, y) in placements {
        if placement_fits(x, y, width, height, monitor) {
            return (x, y);
        }
    }

    clamp_to_work_area(placements[0].0, placements[0].1, width, height, monitor)
}

fn show_overlay(app: &AppHandle, cursor_x: f64, cursor_y: f64, shift_second_press: Option<Instant>) {
    cancel_pending_overlay_close();

    if let Some(paste_target) = app.try_state::<PasteTargetState>() {
        capture_paste_target(&paste_target);
    }

    if let Some(window) = app.get_webview_window(OVERLAY_LABEL) {
        if let Some(quick_copy) = app.try_state::<QuickCopyModeState>() {
            exit_quick_copy_mode(app, &quick_copy);
        }
        let _ = window.close();
    }

    let equipped = app
        .try_state::<EquippedMemoState>()
        .and_then(|state| state.0.lock().ok().and_then(|g| g.clone()));

    let Some(memo_json) = equipped else {
        return;
    };

    let monitor = monitor_at_point(app, cursor_x, cursor_y);
    let (x, y) = monitor
        .as_ref()
        .map(|m| compute_overlay_position(cursor_x, cursor_y, OVERLAY_WIDTH, OVERLAY_HEIGHT, m))
        .unwrap_or((cursor_x + CURSOR_GAP, cursor_y - OVERLAY_HEIGHT - CURSOR_GAP));

    match WebviewWindowBuilder::new(app, OVERLAY_LABEL, WebviewUrl::App("/overlay".into()))
        .title("Memo Overlay")
        .inner_size(OVERLAY_WIDTH, OVERLAY_HEIGHT)
        .position(x, y)
        .always_on_top(true)
        .transparent(true)
        .decorations(false)
        .resizable(false)
        .focused(false)
        .skip_taskbar(true)
        .visible(true)
        .shadow(false)
        .build()
    {
        Ok(window) => {
            let (mut nx, mut ny) = (x, y);
            if let (Ok(size), Some(monitor)) = (window.outer_size(), monitor.as_ref()) {
                let (w, h) = (size.width as f64, size.height as f64);
                (nx, ny) = clamp_to_work_area(x, y, w, h, monitor);
            }
            let _ = window.set_position(PhysicalPosition::new(nx.round() as i32, ny.round() as i32));
            let _ = window.emit("mmb-down", memo_json.clone());
            let _ = app.emit("mmb-down", memo_json);
            if let Some(second_press) = shift_second_press {
                log::info!(
                    "[shift-diag] window visible (+{}ms from second press)",
                    second_press.elapsed().as_millis()
                );
            }
            log::info!("memo overlay opened");
        }
        Err(err) => log::error!("memo overlay failed to open: {err:?}"),
    }
}

fn hide_overlay(app: &AppHandle) {
    let Some(window) = app.get_webview_window(OVERLAY_LABEL) else {
        return;
    };

    if let Some(quick_copy) = app.try_state::<QuickCopyModeState>() {
        exit_quick_copy_mode(app, &quick_copy);
    }

    let close_generation = OVERLAY_CLOSE_GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = window.emit("mmb-up", ());
    let _ = app.emit("mmb-up", ());

    let app_handle = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(OVERLAY_FADE_OUT);
        let app_for_close = app_handle.clone();
        let _ = app_handle.run_on_main_thread(move || {
            if OVERLAY_CLOSE_GENERATION.load(Ordering::SeqCst) != close_generation {
                return;
            }
            if let Some(win) = app_for_close.get_webview_window(OVERLAY_LABEL) {
                let _ = win.close();
                log::info!("memo overlay closed");
            }
        });
    });
}
