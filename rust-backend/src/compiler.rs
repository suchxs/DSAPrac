use anyhow::{Context, Result};
use std::process::Command;
use tempfile::TempDir;
use tokio::fs;

/// Handles compilation of C/C++ code
pub struct Compiler {
    temp_dir: TempDir,
}

impl Compiler {
    pub fn new() -> Result<Self> {
        let temp_dir = TempDir::new().context("Failed to create temporary directory")?;
        Ok(Self { temp_dir })
    }

    /// Compile C code and return the executable path
    pub async fn compile_c(&self, code: &str) -> Result<String> {
        let source_path = self.temp_dir.path().join("solution.c");
        let executable_path = self.temp_dir.path().join("solution.exe");

        // Write code to file
        fs::write(&source_path, code)
            .await
            .context("Failed to write source code")?;

        // Compile with GCC
        let output = Command::new("gcc")
            .arg("-o")
            .arg(&executable_path)
            .arg(&source_path)
            .arg("-std=c99")
            .arg("-O2")
            .arg("-Wall")
            .arg("-Wextra")
            .output()
            .context("Failed to execute gcc")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Compilation failed: {}", error));
        }

        Ok(executable_path.to_string_lossy().to_string())
    }

    /// Compile C++ code and return the executable path
    pub async fn compile_cpp(&self, code: &str) -> Result<String> {
        let source_path = self.temp_dir.path().join("solution.cpp");
        let executable_path = self.temp_dir.path().join("solution.exe");

        // Write code to file
        fs::write(&source_path, code)
            .await
            .context("Failed to write source code")?;

        // Compile with G++
        let output = Command::new("g++")
            .arg("-o")
            .arg(&executable_path)
            .arg(&source_path)
            .arg("-std=c++17")
            .arg("-O2")
            .arg("-Wall")
            .arg("-Wextra")
            .output()
            .context("Failed to execute g++")?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Compilation failed: {}", error));
        }

        Ok(executable_path.to_string_lossy().to_string())
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
