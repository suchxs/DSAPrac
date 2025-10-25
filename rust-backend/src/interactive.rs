use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use tempfile::TempDir;
use tokio::fs;
use tokio::process::Command as TokioCommand;
use tokio::time::{timeout, Duration};

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
            fs::create_dir_all(parent).await?;
        }
        
        fs::write(&file_path, &file.content).await
            .context(format!("Failed to write file: {}", file.filename))?;
    }
    
    // Determine compiler and source files
    let (compiler, extension) = match language {
        "c" => ("gcc", "c"),
        "cpp" => ("g++", "cpp"),
        _ => return Err(anyhow::anyhow!("Unsupported language: {}", language)),
    };
    
    // Filter source files (exclude headers)
    let source_files: Vec<PathBuf> = files.iter()
        .filter(|f| {
            let fname = f.filename.to_lowercase();
            fname.ends_with(".c") || fname.ends_with(".cpp")
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
    
    // Keep temp_dir alive by returning path as string and forgetting the temp_dir
    let exe_path = executable_path.to_string_lossy().to_string();
    std::mem::forget(temp_dir); // Don't cleanup yet - executable is still in there
    
    Ok(CompileResult {
        success: true,
        executable_path: Some(exe_path),
        error: None,
        compile_time_ms,
    })
}

#[derive(Debug, Serialize)]
pub struct ExecutionMetrics {
    pub execution_time_ms: u64,
    pub peak_memory_kb: u64,
}

/// Get memory usage of a process (Windows-specific)
#[cfg(windows)]
fn get_process_memory(pid: u32) -> Option<u64> {
    use std::process::Command;
    
    let output = Command::new("tasklist")
        .args(&["/FI", &format!("PID eq {}", pid), "/FO", "CSV", "/NH"])
        .output()
        .ok()?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse CSV output: "name","PID","Session","Mem Usage"
    // Memory is like "1,234 K"
    let parts: Vec<&str> = stdout.split(',').collect();
    if parts.len() >= 4 {
        let mem_str = parts[4].trim().trim_matches('"');
        let mem_kb: u64 = mem_str
            .replace(",", "")
            .replace(" K", "")
            .trim()
            .parse()
            .ok()?;
        return Some(mem_kb);
    }
    
    None
}

#[cfg(not(windows))]
fn get_process_memory(_pid: u32) -> Option<u64> {
    // Linux/Mac implementation would use /proc or ps
    None
}
