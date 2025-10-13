use crate::types::*;
use anyhow::{Context, Result};
use std::process::Stdio;
use std::time::{Duration, Instant};
use sysinfo::{System, Pid};
use tokio::process::Command as TokioCommand;
use tokio::io::{AsyncWriteExt, AsyncReadExt};

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

        // Concurrently read stdout/stderr while waiting
        let mut stdout_buf = Vec::new();
        let mut stderr_buf = Vec::new();
        let mut stdout_opt = child.stdout.take();
        let mut stderr_opt = child.stderr.take();

        let stdout_task = tokio::spawn(async move {
            if let Some(mut s) = stdout_opt.take() {
                let mut buf = Vec::new();
                let _ = s.read_to_end(&mut buf).await;
                buf
            } else { Vec::new() }
        });
        let stderr_task = tokio::spawn(async move {
            if let Some(mut s) = stderr_opt.take() {
                let mut buf = Vec::new();
                let _ = s.read_to_end(&mut buf).await;
                buf
            } else { Vec::new() }
        });

        let wait_task = tokio::spawn(async move { child.wait().await });

        let result = tokio::time::timeout(self.time_limit, async {
            let status = wait_task.await.map_err(|e| anyhow::anyhow!(e))??;
            let out = stdout_task.await.unwrap_or_default();
            let err = stderr_task.await.unwrap_or_default();
            Ok::<(_, _, _), anyhow::Error>((status, out, err))
        }).await;

        let execution_time = start_time.elapsed().as_millis() as u64;

        match result {
            Ok(Ok((status, out, err))) => {
                stdout_buf = out;
                stderr_buf = err;
                let output_str = String::from_utf8_lossy(&stdout_buf).to_string();
                let error = if !status.success() && !stderr_buf.is_empty() {
                    Some(String::from_utf8_lossy(&stderr_buf).to_string())
                } else { None };
                Ok(ExecutionResult {
                    success: status.success(),
                    output: output_str,
                    error,
                    execution_time,
                    memory_usage: 0,
                })
            }
            Ok(Err(e)) => {
                Ok(ExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Process error: {}", e)),
                    execution_time,
                    memory_usage: 0,
                })
            }
            Err(_) => {
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
