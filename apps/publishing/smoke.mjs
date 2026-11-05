// Integration check against a running, isolated publishing worker.
const origin = process.env.COMPILER_URL ?? 'http://127.0.0.1:18084';
const token = process.env.COMPILER_TOKEN;
if (!token) throw Error('Set COMPILER_TOKEN for an isolated worker.');
const headers = { 'X-Compiler-Key': token, 'Content-Type': 'application/json' };
const block = (type, data) => ({
  id: crypto.randomUUID(),
  type: 'publisle:' + type,
  schemaVersion: 1,
  data
});
async function compile(blocks) {
  const response = await fetch(origin + '/jobs', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      kind: 'article',
      slug: 'compiler-smoke',
      revision: 1,
      title: 'Compiler smoke',
      document: { schemaVersion: 1, metadata: { language: 'en' }, blocks }
    })
  });
  if (!response.ok) throw Error(await response.text());
  const started = await response.json();
  for (let n = 0; n < 480; n++) {
    const poll = await fetch(origin + '/jobs/' + started.id, { headers });
    if (!poll.ok) throw Error(await poll.text());
    const job = await poll.json();
    if (job.state === 'ready' || job.state === 'failed') return job;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error('Compilation timed out.');
}
const sources = {
  mermaid: 'flowchart LR\n  Browser --> API\n  API --> Database',
  graphviz: 'digraph Service { rankdir=LR; Browser -> API; API -> Database; }',
  plantuml: '@startuml\nBrowser -> API: Request\nAPI --> Browser: Response\n@enduml',
  wavedrom: '{"signal":[{"name":"clk","wave":"p....."},{"name":"valid","wave":"0.1..0"}]}'
};
const good = await compile(
  Object.entries(sources).map(([engine, source]) =>
    block('diagram', { engine, source, alt: engine + ' diagram' })
  )
);
if (good.state !== 'ready' || good.artifact.islands.length)
  throw Error(JSON.stringify(good.diagnostics));
const urls = [...good.artifact.html.matchAll(/src="(\/media\/diagrams\/[^\"]+)"/g)].map(
  (m) => m[1]
);
if (urls.length !== 8) throw Error('Expected eight theme images.');
for (const url of urls) {
  const response = await fetch(origin + url.replace('/media/diagrams/', '/assets/'), { headers });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.ok || bytes.length < 24 || bytes.readUInt32BE(0) !== 0x89504e47)
    throw Error('Invalid PNG.');
}
const badSources = {
  mermaid: 'flowchart LR\nA --> [',
  graphviz: 'digraph {',
  plantuml: '@startuml\nthis is invalid syntax\n@enduml',
  wavedrom: '{invalid JSON'
};
for (const [engine, source] of Object.entries(badSources)) {
  const bad = await compile([block('diagram', { engine, source, alt: 'Invalid diagram' })]);
  if (bad.state !== 'failed' || !bad.diagnostics.some((d) => d.level === 'error'))
    throw Error(engine + ' accepted invalid source.');
}
const math = await compile([block('math', { value: '\\frac{1}{', display: true })]);
if (
  math.state !== 'failed' ||
  !math.diagnostics.some((d) => d.code === 'invalid-math' && d.level === 'error')
)
  throw Error('Invalid math accepted.');
console.log(
  'Passed: four engines, eight PNGs, no static islands, four invalid sources, invalid LaTeX.'
);
