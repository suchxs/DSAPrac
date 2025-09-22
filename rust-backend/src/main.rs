use dsa_judge::{Judge, JudgeRequest, Problem, TestCase, Difficulty};
use serde_json;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("DSA Judge Engine v0.1.0");
    println!("========================");

    // Check environment
    if let Err(e) = Judge::check_environment() {
        eprintln!("Environment check failed: {}", e);
        eprintln!("Please ensure GCC and G++ are installed and available in PATH");
        return Ok(());
    }

    println!("Environment check passed ✓");

    // Example usage
    let example_code = r#"
#include <stdio.h>

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\n", n * 2);
    return 0;
}
"#;

    let example_problem = Problem {
        id: "example-1".to_string(),
        title: "Double the Number".to_string(),
        description: "Read a number and output its double".to_string(),
        difficulty: Difficulty::Easy,
        time_limit: 1000, // 1 second
        memory_limit: 64, // 64 MB
        test_cases: vec![
            TestCase {
                input: "5\n".to_string(),
                expected_output: "10\n".to_string(),
                is_hidden: false,
            },
            TestCase {
                input: "10\n".to_string(),
                expected_output: "20\n".to_string(),
                is_hidden: false,
            },
        ],
        tags: vec!["basic".to_string(), "math".to_string()],
    };

    let request = JudgeRequest {
        code: example_code.to_string(),
        problem: example_problem,
        language: "c".to_string(),
    };

    let judge = Judge::new()?;
    let response = judge.judge(request).await?;

    println!("\nJudge Result:");
    println!("=============");
    println!("{}", serde_json::to_string_pretty(&response)?);

    Ok(())
}
