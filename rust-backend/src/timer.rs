use std::time::{Duration, Instant};

/// High-precision timer for measuring execution time
pub struct Timer {
    start_time: Option<Instant>,
}

impl Timer {
    pub fn new() -> Self {
        Self { start_time: None }
    }

    pub fn start(&mut self) {
        self.start_time = Some(Instant::now());
    }

    pub fn elapsed(&self) -> Option<Duration> {
        self.start_time.map(|start| start.elapsed())
    }

    pub fn elapsed_millis(&self) -> Option<u64> {
        self.elapsed().map(|duration| duration.as_millis() as u64)
    }

    pub fn reset(&mut self) {
        self.start_time = None;
    }

    pub fn is_running(&self) -> bool {
        self.start_time.is_some()
    }
}

impl Default for Timer {
    fn default() -> Self {
        Self::new()
    }
}

/// Utility functions for timing operations
pub mod utils {
    use super::*;

    /// Measure the execution time of a closure
    pub fn measure_time<F, R>(f: F) -> (R, Duration)
    where
        F: FnOnce() -> R,
    {
        let start = Instant::now();
        let result = f();
        let elapsed = start.elapsed();
        (result, elapsed)
    }

    /// Measure the execution time of an async closure
    pub async fn measure_time_async<F, Fut, R>(f: F) -> (R, Duration)
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = R>,
    {
        let start = Instant::now();
        let result = f().await;
        let elapsed = start.elapsed();
        (result, elapsed)
    }
}
