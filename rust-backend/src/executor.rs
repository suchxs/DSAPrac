use crate::types::*;
use anyhow::{Context, Result};
use std::process::Stdio;
use std::time::{Duration, Instant};
use sysinfo::{System, Pid};
use tokio::process::Command as TokioCommand;
use tokio::io::AsyncWriteExt;

/// Handles execution of compiled code with sandboxing
pub struct Executor {
    time_limit: Duration,
    memory_limit: u64, // in MB
}

impl Executor {
    pub fn new(time_limit_ms: u64, memory_limit_mb: u64) -> Self {
        Self {
            time_limit: Duration::from_millis(time_limit_ms),
            memory_limit: memory_limit_mb,
        }
    }

    /// Execute the compiled program with given input
    pub async fn execute(&self, executable_path: &str, input: &str) -> Result<ExecutionResult> {
        let start_time = Instant::now();
        
        // Start the process using tokio
        let mut child = TokioCommand::new(executable_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .context("Failed to start process")?;

        // Send input to stdin
        if let Some(stdin) = child.stdin.as_mut() {
            stdin.write_all(input.as_bytes()).await
                .context("Failed to write to stdin")?;
        }

        // Wait for process to complete with timeout
        let result = tokio::time::timeout(self.time_limit, child.wait()).await;

        let execution_time = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(Ok(status)) => {
                // Process completed normally
                let mut output = Vec::new();
                if let Some(mut stdout) = child.stdout.take() {
                    use tokio::io::AsyncReadExt;
                    let _ = stdout.read_to_end(&mut output).await;
                }
                let output_str = String::from_utf8_lossy(&output).to_string();

                let error = if !status.success() {
                    let mut stderr = Vec::new();
                    if let Some(mut stderr_handle) = child.stderr.take() {
                        use tokio::io::AsyncReadExt;
                        let _ = stderr_handle.read_to_end(&mut stderr).await;
                    }
                    Some(String::from_utf8_lossy(&stderr).to_string())
                } else {
                    None
                };

                Ok(ExecutionResult {
                    success: status.success(),
                    output: output_str,
                    error,
                    execution_time,
                    memory_usage: self.get_memory_usage(child.id().unwrap_or(0)).unwrap_or(0),
                })
            }
            Ok(Err(e)) => {
                // Process failed to start or had an error
                Ok(ExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Process error: {}", e)),
                    execution_time,
                    memory_usage: 0,
                })
            }
            Err(_) => {
                // Timeout occurred
                let _ = child.kill().await;
                Ok(ExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some("Time limit exceeded".to_string()),
                    execution_time,
                    memory_usage: 0,
                })
            }
        }
    }

    /// Get memory usage of a process (simplified implementation)
    fn get_memory_usage(&self, pid: u32) -> Option<u64> {
        let mut sys = System::new_all();
        sys.refresh_processes();
        
        if let Some(process) = sys.process(Pid::from_u32(pid)) {
            Some(process.memory() / 1024) // Convert to KB
        } else {
            None
        }
    }
}
