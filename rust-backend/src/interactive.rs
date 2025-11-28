use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration as StdDuration, SystemTime, UNIX_EPOCH};
use tempfile::TempDir;
use tokio::fs as tokio_fs;
use tokio::process::Command as TokioCommand;
use tokio::time::{timeout, Duration};

static RUN_COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_run_path() -> PathBuf {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| StdDuration::from_millis(0))
        .as_micros();
    let count = RUN_COUNTER.fetch_add(1, Ordering::Relaxed);
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    std::env::temp_dir().join(format!("dsa-run-{}-{}{}", ts, count, suffix))
}

fn clean_old_run_artifacts() {
    let tmp = std::env::temp_dir();
    let cutoff = SystemTime::now()
        .checked_sub(StdDuration::from_secs(60 * 30)) // ~30 minutes
        .unwrap_or(SystemTime::now());
    if let Ok(entries) = std::fs::read_dir(tmp) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if name.starts_with("dsa-run-") {
                    if let Ok(meta) = entry.metadata() {
                        if let Ok(modified) = meta.modified() {
                            if modified < cutoff {
                                let _ = std::fs::remove_file(&path);
                            }
                        }
                    }
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeFile {
    pub filename: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub executable_path: Option<String>,
    pub error: Option<String>,
    pub compile_time_ms: u64,
}

/// Compile multiple files (C or C++) for interactive execution
pub async fn compile_files(files: Vec<CodeFile>, language: &str) -> Result<CompileResult> {
    let start = std::time::Instant::now();
    let temp_dir = TempDir::new().context("Failed to create temp directory")?;
    
    // Write all files to temp directory
    for file in &files {
        let file_path = temp_dir.path().join(&file.filename);
        
        // Create parent directories if needed
        if let Some(parent) = file_path.parent() {
            tokio_fs::create_dir_all(parent).await?;
        }
        
        tokio_fs::write(&file_path, &file.content).await
            .context(format!("Failed to write file: {}", file.filename))?;
    }
    
    // Determine compiler and source files
    let compiler = match language {
        "c" => "gcc",
        "cpp" => "g++",
        "rust" => "rustc",
        _ => return Err(anyhow::anyhow!("Unsupported language: {}", language)),
    };
    
    // Filter source files (exclude headers)
    let source_files: Vec<PathBuf> = files.iter()
        .filter(|f| {
            let fname = f.filename.to_lowercase();
            match language {
                "rust" => fname.ends_with(".rs"),
                _ => fname.ends_with(".c") || fname.ends_with(".cpp"),
            }
        })
        .map(|f| temp_dir.path().join(&f.filename))
        .collect();
    
    if source_files.is_empty() {
        return Err(anyhow::anyhow!("No source files found"));
    }
    
    let executable_path = temp_dir.path().join(if cfg!(windows) { "program.exe" } else { "program" });
    
    // Build compilation command
    let mut cmd = TokioCommand::new(compiler);
    cmd.current_dir(temp_dir.path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    
    if language == "rust" {
        for source in &source_files {
            cmd.arg(source.file_name().unwrap());
        }
        cmd.arg("-O").arg("-o").arg(&executable_path);
    } else {
        // Add source files
        for source in &source_files {
            cmd.arg(source.file_name().unwrap());
        }
        
        // Add output and flags
        cmd.arg("-o").arg(&executable_path);
        
        if language == "c" {
            cmd.arg("-std=c99");
        } else {
            cmd.arg("-std=c++17");
        }
        
        cmd.arg("-O2")
            .arg("-Wall")
            .arg("-Wextra");
    }
    
    // Execute compilation with timeout
    let output = timeout(Duration::from_secs(15), cmd.output())
        .await
        .context("Compilation timeout")?
        .context("Failed to execute compiler")?;
    
    let compile_time_ms = start.elapsed().as_millis() as u64;
    
    if !output.status.success() {
        let error = String::from_utf8_lossy(&output.stderr).to_string();
        return Ok(CompileResult {
            success: false,
            executable_path: None,
            error: Some(error),
            compile_time_ms,
        });
    }
    
    // Move executable to a stable temp path and cleanup build dir
    clean_old_run_artifacts();
    let final_path = next_run_path();
    if let Some(parent) = final_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::copy(&executable_path, &final_path)?;
    // temp_dir drops here and cleans sources/artifacts
    
    Ok(CompileResult {
        success: true,
        executable_path: Some(final_path.to_string_lossy().to_string()),
        error: None,
        compile_time_ms,
    })
}

#[derive(Debug, Serialize)]
pub struct ExecutionMetrics {
    pub execution_time_ms: u64,
    pub peak_memory_kb: u64,
}

