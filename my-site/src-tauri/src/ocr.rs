use std::path::PathBuf;
use std::process::Command;

use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize, Debug)]
pub struct OcrItem {
    pub name: String,
    pub count: u32,
    pub confidence: f32,
    pub bbox: Vec<i32>,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct OcrResult {
    pub items: Vec<OcrItem>,
    pub warnings: Vec<String>,
}

/// 인벤토리 이미지에서 PaddleOCR 로 항목/수량을 추출한다.
///
/// - `image_paths`: 절대 경로 리스트 (file picker 결과)
/// - 내부적으로 Python 스크립트(`tools/ocr/extract_inventory.py`)를 spawn 한다
/// - venv (`tools/ocr/venv/`) 가 있으면 그쪽 python 을, 없으면 시스템 `python3` 사용
#[tauri::command]
pub async fn ocr_import(
    app: tauri::AppHandle,
    image_paths: Vec<String>,
) -> Result<OcrResult, String> {
    let script_path = resolve_script_path(&app)?;
    let python = resolve_python();

    let output = Command::new(&python)
        .arg(&script_path)
        .args(&image_paths)
        .output()
        .map_err(|e| {
            format!(
                "Python spawn 실패 (path={:?}): {}\n\n• Python 3.10+ 가 설치되어 있는지 확인하세요\n• tools/ocr/venv 에 venv 를 만들고 requirements.txt 를 설치하세요",
                python, e
            )
        })?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("OCR 스크립트 실행 실패:\n{}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| format!("OCR 결과 파싱 실패: {}\nraw output:\n{}", e, stdout))
}

/// venv 가 있으면 그 python, 없으면 시스템 python3 을 반환.
fn resolve_python() -> PathBuf {
    if let Ok(cwd) = std::env::current_dir() {
        // Dev: cwd 는 src-tauri/ → 상위에서 tools/ocr/venv 찾기
        let venv = if cfg!(windows) {
            cwd.parent().map(|p| p.join("tools/ocr/venv/Scripts/python.exe"))
        } else {
            cwd.parent().map(|p| p.join("tools/ocr/venv/bin/python"))
        };
        if let Some(v) = venv {
            if v.exists() {
                return v;
            }
        }
    }
    PathBuf::from("python3")
}

/// dev / prod 모두에서 OCR 스크립트 경로 해결.
fn resolve_script_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // Dev mode: cwd 는 my-site/src-tauri/ → ../tools/ocr/extract_inventory.py
    if let Ok(cwd) = std::env::current_dir() {
        if let Some(parent) = cwd.parent() {
            let dev = parent.join("tools/ocr/extract_inventory.py");
            if dev.exists() {
                return Ok(dev);
            }
        }
    }

    // Prod (bundle): app.path().resource_dir() 하위에 tauri.conf.json 의 bundle.resources 로 복사됨
    let resource = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir 조회 실패: {}", e))?
        .join("tools/ocr/extract_inventory.py");
    if resource.exists() {
        return Ok(resource);
    }

    Err(format!(
        "OCR 스크립트를 찾을 수 없습니다 (dev/prod 모두). resource path: {:?}",
        resource
    ))
}
