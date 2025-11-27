use crate::types::*;
use anyhow::{Context, Result};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command as TokioCommand;
use tokio::time::sleep;
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

/// Handles execution of compiled code with sandboxing
pub struct Executor {
    time_limit: Duration,
    _memory_limit: u64, // reserved for future use
}

impl Executor {
    pub fn new(time_limit_ms: u64, memory_limit_mb: u64) -> Self {
        Self {
            time_limit: Duration::from_millis(time_limit_ms),
            _memory_limit: memory_limit_mb,
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

        let pid = child.id();
        let peak_mem = Arc::new(AtomicU64::new(0));
        let running = Arc::new(AtomicBool::new(true));

        // Sampling task to capture peak memory while the process is running
        let peak_mem_clone = Arc::clone(&peak_mem);
        let running_clone = Arc::clone(&running);
        let sampler = tokio::spawn(async move {
          if let Some(pid_val) = pid {
            let mut sys = System::new_with_specifics(
              RefreshKind::new().with_processes(ProcessRefreshKind::new())
            );
            let target_pid = Pid::from_u32(pid_val as u32);
            while running_clone.load(Ordering::Relaxed) {
              sys.refresh_process_specifics(target_pid, ProcessRefreshKind::new());
              if let Some(proc) = sys.process(target_pid) {
                let mem = proc.memory(); // in KB
                let current = peak_mem_clone.load(Ordering::Relaxed);
                if mem > current {
                  peak_mem_clone.store(mem, Ordering::Relaxed);
                }
              }
              sleep(Duration::from_millis(30)).await;
            }
          }
        });

        // Concurrently read stdout/stderr while waiting
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

        // Wait with timeout so we can kill runaway processes quickly
        let wait_result = tokio::time::timeout(self.time_limit, child.wait()).await;
        let execution_time = start_time.elapsed().as_millis() as u64;

        match wait_result {
            Ok(Ok(status)) => {
                let stdout_buf = stdout_task.await.unwrap_or_default();
                let stderr_buf = stderr_task.await.unwrap_or_default();
                let output_str = String::from_utf8_lossy(&stdout_buf).to_string();
                let error = if !status.success() && !stderr_buf.is_empty() {
                    Some(String::from_utf8_lossy(&stderr_buf).to_string())
                } else { None };
                running.store(false, Ordering::Relaxed);
                let _ = sampler.await;
                let memory_usage = peak_mem.load(Ordering::Relaxed);

                Ok(ExecutionResult {
                    success: status.success(),
                    output: output_str,
                    error,
                    execution_time,
                    memory_usage,
                })
            }
            Ok(Err(e)) => Ok(ExecutionResult {
                success: false,
                output: String::new(),
                error: Some(format!("Process error: {}", e)),
                execution_time,
                memory_usage: 0,
            }),
            Err(_) => {
                // Timeout - ensure the process is killed and outputs are drained
                let _ = child.kill().await;
                let _ = child.wait().await;
                let _ = stdout_task.await;
                let _ = stderr_task.await;
                running.store(false, Ordering::Relaxed);
                let _ = sampler.await;
                let memory_usage = peak_mem.load(Ordering::Relaxed);

                Ok(ExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some("Time limit exceeded".to_string()),
                    execution_time,
                    memory_usage,
                })
            }
        }
    }
}
