mod ocr;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_store::Builder::default().build())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_process::init())
    .invoke_handler(tauri::generate_handler![ocr::ocr_import])
    .setup(|app| {
      // updater 플러그인은 데스크탑 전용 — 모바일 빌드에서 컴파일 실패 방지
      #[cfg(desktop)]
      app
        .handle()
        .plugin(tauri_plugin_updater::Builder::new().build())?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
