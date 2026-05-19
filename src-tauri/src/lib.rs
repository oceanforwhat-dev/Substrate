mod memo_overlay;
mod quick_copy_hook;
mod quick_copy_paste;

use memo_overlay::{
    clamp_memo_overlay_position, close_memo_overlay, get_equipped_memo,
    init as init_memo_overlay, notify_quick_copy_key, set_equipped_memo, EquippedMemoState,
    QuickCopyDigitDedup, QuickCopyModeState,
};
use quick_copy_paste::PasteTargetState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_equipped_memo,
            set_equipped_memo,
            close_memo_overlay,
            clamp_memo_overlay_position,
            notify_quick_copy_key,
        ])
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;

            let marker = data_dir.join("data_dir.path");
            std::fs::write(&marker, data_dir.to_string_lossy().as_bytes())?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let equipped_state = EquippedMemoState::default();
            let quick_copy_state = QuickCopyModeState::default();
            app.manage(equipped_state.clone());
            app.manage(quick_copy_state.clone());
            app.manage(PasteTargetState::default());
            app.manage(QuickCopyDigitDedup::default());
            init_memo_overlay(app.handle(), equipped_state, quick_copy_state)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
