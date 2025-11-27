use anyhow::{Context, Result};
use std::path::Path;


pub struct Sandbox {
    working_directory: std::path::PathBuf,
}

impl Sandbox {
    pub fn new() -> Result<Self> {
        let temp_dir = tempfile::tempdir()
            .context("Failed to create sandbox directory")?;
        
        let working_dir = temp_dir.keep();
        Ok(Self {
            working_directory: working_dir,
        })
    }

    /// Set up sandbox environment
    pub fn setup(&self) -> Result<()> {
        // Create necessary directories
        std::fs::create_dir_all(self.working_directory.join("input"))
            .context("Failed to create input directory")?;
        
        std::fs::create_dir_all(self.working_directory.join("output"))
            .context("Failed to create output directory")?;

        Ok(())
    }

    /// Check if the sandbox is properly configured
    pub fn is_secure(&self) -> bool {
        self.working_directory.exists() && 
        self.working_directory.is_dir()
    }

    /// Get the working directory path
    pub fn working_dir(&self) -> &Path {
        &self.working_directory
    }

    /// Clean up sandbox resources
    pub fn cleanup(&self) -> Result<()> {
        if self.working_directory.exists() {
            std::fs::remove_dir_all(&self.working_directory)
                .context("Failed to cleanup sandbox directory")?;
        }
        Ok(())
    }
}

impl Drop for Sandbox {
    fn drop(&mut self) {
        let _ = self.cleanup();
    }
}
