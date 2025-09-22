use crate::types::*;
use crate::compiler::Compiler;
use crate::executor::Executor;
use crate::sandbox::Sandbox;
use anyhow::{Context, Result};

/// Main judge engine that orchestrates compilation, execution, and evaluation
pub struct Judge {
    sandbox: Sandbox,
}

impl Judge {
    pub fn new() -> Result<Self> {
        let sandbox = Sandbox::new().context("Failed to create sandbox")?;
        sandbox.setup().context("Failed to setup sandbox")?;
        
        Ok(Self { sandbox })
    }

    /// Process a judge request and return results
    pub async fn judge(&self, request: JudgeRequest) -> Result<JudgeResponse> {
        // Initialize compiler
        let compiler = Compiler::new().context("Failed to create compiler")?;
        
        // Compile the code
        let executable_path = match request.language.to_lowercase().as_str() {
            "c" => compiler.compile_c(&request.code).await,
            "cpp" | "c++" => compiler.compile_cpp(&request.code).await,
            _ => return Ok(JudgeResponse {
                success: false,
                result: None,
                error: Some(format!("Unsupported language: {}", request.language)),
            }),
        };

        let executable_path = match executable_path {
            Ok(path) => path,
            Err(e) => {
                return Ok(JudgeResponse {
                    success: false,
                    result: None,
                    error: Some(format!("Compilation failed: {}", e)),
                });
            }
        };

        // Execute test cases
        let mut test_case_results = Vec::new();
        let mut total_execution_time = 0u64;

        for (i, test_case) in request.problem.test_cases.iter().enumerate() {
            let executor = Executor::new(
                request.problem.time_limit,
                request.problem.memory_limit,
            );

            let execution_result = executor
                .execute(&executable_path, &test_case.input)
                .await
                .unwrap_or_else(|e| ExecutionResult {
                    success: false,
                    output: String::new(),
                    error: Some(format!("Execution error: {}", e)),
                    execution_time: 0,
                    memory_usage: 0,
                });

            total_execution_time += execution_result.execution_time;

            // Compare outputs (normalize whitespace)
            let actual_output = self.normalize_output(&execution_result.output);
            let expected_output = self.normalize_output(&test_case.expected_output);
            let passed = actual_output == expected_output;

            test_case_results.push(TestCaseResult {
                test_case_id: i,
                passed,
                execution_result: execution_result.clone(),
                expected_output: test_case.expected_output.clone(),
                actual_output: execution_result.output.clone(),
            });
        }

        // Calculate score
        let passed_count = test_case_results.iter().filter(|r| r.passed).count();
        let score = (passed_count as f64 / test_case_results.len() as f64) * 100.0;

        let submission_result = SubmissionResult {
            problem_id: request.problem.id.clone(),
            total_test_cases: test_case_results.len(),
            passed_test_cases: passed_count,
            test_case_results,
            compilation_successful: true,
            compilation_error: None,
            total_execution_time,
            score,
        };

        Ok(JudgeResponse {
            success: true,
            result: Some(submission_result),
            error: None,
        })
    }

    /// Normalize output for comparison (trim whitespace, normalize line endings)
    fn normalize_output(&self, output: &str) -> String {
        output
            .lines()
            .map(|line| line.trim())
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string()
    }

    /// Check if required tools are available
    pub fn check_environment() -> Result<()> {
        Compiler::check_compilers()
            .context("Compiler check failed")?;
        
        // Additional environment checks can be added here
        Ok(())
    }
}
