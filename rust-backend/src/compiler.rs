use anyhow::{Context, Result};
use std::process::Command;
use tokio::process::Command as TokioCommand;
use tempfile::TempDir;
use tokio::fs;
use tokio::time::{timeout, Duration};

/// Handles compilation of C/C++ code
pub struct Compiler {
    temp_dir: TempDir,
}

impl Compiler {
    pub fn new() -> Result<Self> {
        let temp_dir = TempDir::new().context("Failed to create temporary directory")?;
        Ok(Self { temp_dir })
    }

    /// Compile C code and return the executable path (with on-disk cache)
    pub async fn compile_c(&self, code: &str) -> Result<String> {
        let source_path = self.temp_dir.path().join("solution.c");
        let executable_path = self.temp_dir.path().join("solution.exe");

        // Simple cache by hash(code)
        let mut hasher = sha1_smol::Sha1::new();
        hasher.update(code.as_bytes());
        let hash = hasher.digest().to_string();
        let cache_dir = dirs::cache_dir().unwrap_or(std::env::temp_dir()).join("dsa_judge_cache");
        let cache_path = cache_dir.join(format!("{}_c.exe", hash));
        if cache_path.exists() {
            return Ok(cache_path.to_string_lossy().to_string());
        }

        // Write code to file
        if code.as_bytes().len() > 256 * 1024 { // 256 KB
            return Err(anyhow::anyhow!("Source too large"));
        }
        fs::write(&source_path, code)
            .await
            .context("Failed to write source code")?;

        // Compile with GCC (async + timeout)
        let mut cmd = TokioCommand::new("gcc");
        cmd.arg("-pipe")
            .arg("-o").arg(&executable_path)
            .arg(&source_path)
            .arg("-std=c99")
            .arg("-O2")
            .arg("-Wall")
            .arg("-Wextra")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let output = timeout(Duration::from_secs(10), cmd.output())
            .await
            .context("gcc timeout")?
            .context("Failed to execute gcc")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Compilation failed: {}", error));
        }

        if let Ok(meta) = std::fs::metadata(&executable_path) {
            if meta.len() > 64 * 1024 * 1024 { // 64 MB
                return Err(anyhow::anyhow!("Executable too large"));
            }
        }
        // Move/copy to cache
        std::fs::create_dir_all(&cache_dir).ok();
        let _ = std::fs::copy(&executable_path, &cache_path);
        Ok(cache_path.to_string_lossy().to_string())
    }

    /// Compile C++ code and return the executable path (with on-disk cache)
    pub async fn compile_cpp(&self, code: &str) -> Result<String> {
        let source_path = self.temp_dir.path().join("solution.cpp");
        let executable_path = self.temp_dir.path().join("solution.exe");

        let mut hasher = sha1_smol::Sha1::new();
        hasher.update(code.as_bytes());
        let hash = hasher.digest().to_string();
        let cache_dir = dirs::cache_dir().unwrap_or(std::env::temp_dir()).join("dsa_judge_cache");
        let cache_path = cache_dir.join(format!("{}_cpp.exe", hash));
        if cache_path.exists() {
            return Ok(cache_path.to_string_lossy().to_string());
        }

        // Write code to file
        if code.as_bytes().len() > 256 * 1024 {
            return Err(anyhow::anyhow!("Source too large"));
        }
        fs::write(&source_path, code)
            .await
            .context("Failed to write source code")?;

        // Compile with G++ (async + timeout)
        let mut cmd = TokioCommand::new("g++");
        cmd.arg("-pipe")
            .arg("-o").arg(&executable_path)
            .arg(&source_path)
            .arg("-std=c++17")
            .arg("-O2")
            .arg("-Wall")
            .arg("-Wextra")
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        let output = timeout(Duration::from_secs(10), cmd.output())
            .await
            .context("g++ timeout")?
            .context("Failed to execute g++")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Compilation failed: {}", error));
        }

        if let Ok(meta) = std::fs::metadata(&executable_path) {
            if meta.len() > 64 * 1024 * 1024 {
                return Err(anyhow::anyhow!("Executable too large"));
            }
        }
        std::fs::create_dir_all(&cache_dir).ok();
        let _ = std::fs::copy(&executable_path, &cache_path);
        Ok(cache_path.to_string_lossy().to_string())
    }

    /// Check if required compilers are available
    pub fn check_compilers() -> Result<()> {
        // Check for GCC
        Command::new("gcc")
            .arg("--version")
            .output()
            .context("GCC not found. Please install GCC compiler")?;

        // Check for G++
        Command::new("g++")
            .arg("--version")
            .output()
            .context("G++ not found. Please install G++ compiler")?;

        Ok(())
    }
}
