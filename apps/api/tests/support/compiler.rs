//! A tiny trusted-compiler fixture. The real renderer is exercised separately.
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::TcpListener,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    thread,
};
pub struct Compiler {
    pub url: String,
    stop: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Compiler {
    pub fn start() -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        listener.set_nonblocking(true).unwrap();
        let stop = Arc::new(AtomicBool::new(false));
        let stopping = stop.clone();
        let thread = thread::spawn(move || {
            let mut jobs = HashMap::<String, Value>::new();
            while !stopping.load(Ordering::Relaxed) {
                let Ok((mut stream, _)) = listener.accept() else {
                    thread::sleep(std::time::Duration::from_millis(10));
                    continue;
                };
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                    .unwrap();
                let mut input = Vec::new();
                let mut buffer = [0; 4096];
                let end = loop {
                    let Ok(n) = stream.read(&mut buffer) else {
                        break None;
                    };
                    if n == 0 {
                        break None;
                    }
                    input.extend_from_slice(&buffer[..n]);
                    if let Some(end) = input.windows(4).position(|w| w == b"\r\n\r\n") {
                        break Some(end + 4);
                    }
                };
                let Some(end) = end else {
                    continue;
                };
                let headers = String::from_utf8_lossy(&input[..end]).to_string();
                let length = headers
                    .lines()
                    .find_map(|line| {
                        line.to_lowercase()
                            .strip_prefix("content-length:")
                            .and_then(|n| n.trim().parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                while input.len() < end + length {
                    let Ok(n) = stream.read(&mut buffer) else {
                        break;
                    };
                    if n == 0 {
                        break;
                    }
                    input.extend_from_slice(&buffer[..n]);
                }
                let path = headers.split_whitespace().nth(1).unwrap_or("");
                let (status, body) = if headers.starts_with("POST /jobs ") {
                    let mut job: Value = serde_json::from_slice(&input[end..end + length]).unwrap();
                    let id = uuid::Uuid::new_v4().to_string();
                    job["id"] = json!(id);
                    job["state"] = json!("ready");
                    job["diagnostics"] = json!([]);
                    job["artifact"] = json!({"format":"publisle:publication","formatVersion":1,"identity":"trusted-test","rendererBuild":"1","html":"<p>Server compiled</p>","styles":[],"modules":[],"islands":[],"diagnostics":[]});
                    jobs.insert(id.clone(), job);
                    (202, json!({"id":id,"state":"ready"}))
                } else if let Some(job) = path.strip_prefix("/jobs/").and_then(|id| jobs.get(id)) {
                    (200, job.clone())
                } else {
                    (404, json!({"error":"Not found"}))
                };
                let text = body.to_string();
                let _ = write!(
                    stream,
                    "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    text.len(),
                    text
                );
            }
        });
        Self {
            url,
            stop,
            thread: Some(thread),
        }
    }
    pub fn configure(&self, config: &mut voidreg_api::config::Config) {
        config.compiler_url = self.url.clone();
        config.compiler_token = Some("test-compiler".into());
    }
}
impl Drop for Compiler {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(thread) = self.thread.take() {
            thread.join().unwrap();
        }
    }
}
