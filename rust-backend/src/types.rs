use serde::{Deserialize, Serialize};

/// Represents a test case for a problem
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCase {
    pub input: String,
    pub expected_output: String,
    pub is_hidden: bool,
}

/// Represents a programming problem
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Problem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub difficulty: Difficulty,
    pub time_limit: u64, // in milliseconds
    pub memory_limit: u64, // in MB
    pub test_cases: Vec<TestCase>,
    pub tags: Vec<String>,
}

/// Difficulty levels for problems
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Difficulty {
    Easy,
    Medium,
    Hard,
}

/// Result of code execution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
    pub execution_time: u64, // in milliseconds
    pub memory_usage: u64, // in KB
}

/// Result of test case evaluation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TestCaseResult {
    pub test_case_id: usize,
    pub passed: bool,
    pub execution_result: ExecutionResult,
    pub expected_output: String,
    pub actual_output: String,
}

/// Overall submission result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubmissionResult {
    pub problem_id: String,
    pub total_test_cases: usize,
    pub passed_test_cases: usize,
    pub test_case_results: Vec<TestCaseResult>,
    pub compilation_successful: bool,
    pub compilation_error: Option<String>,
    pub total_execution_time: u64,
    pub score: f64, // percentage
}

/// Request to compile and run code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JudgeRequest {
    pub code: String,
    pub problem: Problem,
    pub language: String, // "c", "cpp", etc.
}

/// Response from judge
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JudgeResponse {
    pub success: bool,
    pub result: Option<SubmissionResult>,
    pub error: Option<String>,
}
