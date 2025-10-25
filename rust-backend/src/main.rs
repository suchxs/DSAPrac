use dsa_judge::{Judge, JudgeRequest, Problem, TestCase, Difficulty, CodeFile};
use serde_json;
use std::env;
use std::io::{self, BufRead, Write};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|a| a == "--stdio") {
        run_stdio().await?;
        return Ok(());
    }

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
        normalization: Default::default(),
    };

    let judge = Judge::new()?;
    let response = judge.judge(request).await?;

    println!("\nJudge Result:");
    println!("=============");
    println!("{}", serde_json::to_string_pretty(&response)?);

    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(tag = "action")]
enum StdioRequest {
    #[serde(rename = "ping")] Ping { id: Option<String> },
    #[serde(rename = "version")] Version { id: Option<String> },
    #[serde(rename = "env_check")] EnvCheck { id: Option<String> },
    #[serde(rename = "judge")] Judge { id: Option<String>, request: dsa_judge::JudgeRequest },
    #[serde(rename = "execute")] Execute { 
        id: Option<String>, 
        code: Option<String>,
        language: String,
        files: Option<Vec<CodeFile>>,
    },
}

#[derive(serde::Serialize)]
struct StdioResponse<T> {
    id: Option<String>,
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

async fn run_stdio() -> Result<(), Box<dyn std::error::Error>> {
    // Ensure environment is OK before serving
    if let Err(e) = dsa_judge::Judge::check_environment() {
        eprintln!("{{\"error\":\"{}\"}}", format!("Environment check failed: {}", e).replace('"', "'"));
        return Ok(());
    }

    let judge = Judge::new()?;
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    let mut lines = stdin.lock().lines();

    while let Some(line) = lines.next() {
        let line = match line {
            Ok(l) => l,
            Err(_) => break,
        };
        if line.trim().is_empty() { continue; }
        let parsed: Result<StdioRequest, _> = serde_json::from_str(&line);
        match parsed {
            Ok(StdioRequest::Ping { id }) => {
                let resp = StdioResponse { id, success: true, data: Some("pong".to_string()), error: None };
                writeln!(stdout, "{}", serde_json::to_string(&resp).unwrap())?;
                stdout.flush()?;
            }
            Ok(StdioRequest::Version { id }) => {
                let v = env!("CARGO_PKG_VERSION").to_string();
                let resp = StdioResponse { id, success: true, data: Some(v), error: None };
                writeln!(stdout, "{}", serde_json::to_string(&resp).unwrap())?;
                stdout.flush()?;
            }
            Ok(StdioRequest::EnvCheck { id }) => {
                let result = dsa_judge::Judge::check_environment();
                let (success, err) = match result { Ok(_) => (true, None), Err(e) => (false, Some(e.to_string())) };
                let resp = StdioResponse::<String> { id, success, data: None, error: err };
                writeln!(stdout, "{}", serde_json::to_string(&resp).unwrap())?;
                stdout.flush()?;
            }
            Ok(StdioRequest::Judge { id, request }) => {
                let resp = judge.judge(request).await;
                match resp {
                    Ok(val) => {
                        let wrap = StdioResponse { id, success: true, data: Some(val), error: None };
                        writeln!(stdout, "{}", serde_json::to_string(&wrap).unwrap())?;
                    }
                    Err(e) => {
                        let wrap: StdioResponse::<serde_json::Value> = StdioResponse { id, success: false, data: None, error: Some(e.to_string()) };
                        writeln!(stdout, "{}", serde_json::to_string(&wrap).unwrap())?;
                    }
                }
                stdout.flush()?;
            }
            Ok(StdioRequest::Execute { id, code, language, files }) => {
                // Prepare files for compilation
                let compile_files = if let Some(fs) = files {
                    fs
                } else if let Some(c) = code {
                    // Single file mode
                    let filename = if language == "cpp" { "main.cpp" } else { "main.c" };
                    vec![CodeFile { filename: filename.to_string(), content: c }]
                } else {
                    // Error: need either files or code
                    let wrap: StdioResponse::<serde_json::Value> = StdioResponse { 
                        id, 
                        success: false, 
                        data: None, 
                        error: Some("Either 'code' or 'files' must be provided".to_string()) 
                    };
                    writeln!(stdout, "{}", serde_json::to_string(&wrap).unwrap())?;
                    stdout.flush()?;
                    continue;
                };
                
                let compile_result = dsa_judge::interactive::compile_files(compile_files, &language).await;
                
                match compile_result {
                    Ok(result) => {
                        let wrap = StdioResponse { id, success: true, data: Some(result), error: None };
                        writeln!(stdout, "{}", serde_json::to_string(&wrap).unwrap())?;
                    }
                    Err(e) => {
                        let wrap: StdioResponse::<serde_json::Value> = StdioResponse { 
                            id, 
                            success: false, 
                            data: None, 
                            error: Some(e.to_string()) 
                        };
                        writeln!(stdout, "{}", serde_json::to_string(&wrap).unwrap())?;
                    }
                }
                stdout.flush()?;
            }
            Err(e) => {
                let resp = StdioResponse::<String> { id: None, success: false, data: None, error: Some(format!("invalid request: {}", e)) };
                writeln!(stdout, "{}", serde_json::to_string(&resp).unwrap())?;
                stdout.flush()?;
            }
        }
    }

    Ok(())
}
