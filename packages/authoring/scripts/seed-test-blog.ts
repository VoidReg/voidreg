// Seeds a preview blog that exercises every Publisle block type and the voidreg
// extensions, through the real admin API and compiler. Safe to run repeatedly:
// slugs and block ids are stable, unchanged content is left alone, and changed
// content is saved as a new revision (so reruns also build revision history).
//
//   SEED_ORIGIN=http://127.0.0.1:5174 ADMIN_PASSWORD=... pnpm --filter @voidreg/authoring seed:test-blog
import { deflateSync } from 'node:zlib';
import { sampleSchematic } from '@voidreg/publishing-ui/schematic/sample';
import { extensions } from '../src/blocks';

import { ApiFailure, call, signIn, PASSWORD, type Json } from './admin-client';

// ---------------------------------------------------------------------------
// Document helpers
// ---------------------------------------------------------------------------
const text = (value: string) => ({ type: 'text', value });
const strong = (value: string) => ({ type: 'strong', children: [text(value)] });
const em = (value: string) => ({ type: 'emphasis', children: [text(value)] });
const para = (...content: Json[]) => ({ type: 'paragraph', content });
const p = (value: string) => para(text(value));

let counter = 0;
const block = (type: string, data: Json, id?: string) => {
  counter += 1;
  return {
    id: id ?? `018f5e00-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`,
    type,
    schemaVersion: 1,
    data
  };
};
const defaults = (type: string): Json => {
  const entry = extensions.blocks?.find((item) => item.type === type);
  if (!entry) throw new Error(`No default data for ${type}`);
  return entry.defaultData() as unknown as Json;
};
const heading = (level: number, value: string) =>
  block('publisle:heading', { level, content: [text(value)] });
const paragraph = (...content: Json[]) => block('publisle:paragraph', { content });
const document = (title: string, blocks: ReturnType<typeof block>[]) => ({
  schemaVersion: 1,
  metadata: { title, language: 'en' },
  blocks
});

/** A small valid PNG (gradient) so the figure block has real media to reference. */
function png(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(crc(body));
    return Buffer.concat([head, body, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const offset = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const shade = Math.round(60 + (170 * (x + y)) / (width + height));
      rows[offset + 1 + x * 3] = shade;
      rows[offset + 2 + x * 3] = shade;
      rows[offset + 3 + x * 3] = shade;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

async function ensureMedia(): Promise<string> {
  const list = await call<{
    items?: { id: string; name: string; url: string }[];
  }>('GET', '/media');
  const existing = (
    Array.isArray(list) ? (list as never as { name: string; url: string }[]) : (list.items ?? [])
  ).find((item) => item.name === 'seed-gradient.png');
  if (existing) return existing.url;
  const created = await call<{ id: string; url: string }>('POST', '/media', {
    name: 'seed-gradient.png',
    data: png(640, 360).toString('base64'),
    alt: 'A diagonal gray gradient used as a test figure'
  });
  return created.url;
}

// ---------------------------------------------------------------------------
// Schematic variants
// ---------------------------------------------------------------------------
const explanation = (title: string, purpose: string, instructions: string, fallback: string) => ({
  title: [text(title)],
  purpose: [p(purpose)],
  instructions: [p(instructions)],
  fallback: [p(fallback)]
});
const schematicBlock = (label: string, payload: unknown, content: ReturnType<typeof explanation>) =>
  block('voidreg:schematic', {
    activation: 'visible',
    payload,
    accessibility: { label },
    content
  });

const divider = {
  width: 400,
  height: 240,
  parts: [
    {
      id: 'B1',
      kind: 'battery',
      x: 80,
      y: 120,
      rotation: 270,
      label: 'B1',
      value: 9
    },
    {
      id: 'R1',
      kind: 'resistor',
      x: 200,
      y: 80,
      rotation: 0,
      label: 'R1',
      value: 10000
    },
    {
      id: 'R2',
      kind: 'resistor',
      x: 280,
      y: 120,
      rotation: 90,
      label: 'R2',
      value: 4700
    },
    { id: 'G1', kind: 'ground', x: 180, y: 200, rotation: 0, label: '' }
  ],
  nets: [
    { id: 'vin', label: 'Supply', pins: ['B1.p', 'R1.a'] },
    { id: 'mid', label: 'Midpoint', pins: ['R1.b', 'R2.a'] },
    { id: 'gnd', label: 'Ground', pins: ['B1.n', 'R2.b', 'G1.a'] }
  ]
};
const rc = {
  width: 480,
  height: 260,
  parts: [
    {
      id: 'B1',
      kind: 'battery',
      x: 80,
      y: 130,
      rotation: 270,
      label: 'B1',
      value: 5
    },
    {
      id: 'S1',
      kind: 'switch',
      x: 200,
      y: 90,
      rotation: 0,
      label: 'S1',
      closed: true
    },
    {
      id: 'R1',
      kind: 'resistor',
      x: 320,
      y: 90,
      rotation: 0,
      label: 'R1',
      value: 10000
    },
    {
      id: 'C1',
      kind: 'capacitor',
      x: 400,
      y: 130,
      rotation: 90,
      label: 'C1',
      value: 100
    },
    { id: 'G1', kind: 'ground', x: 240, y: 210, rotation: 0, label: '' },
    {
      id: 'T1',
      kind: 'label',
      x: 120,
      y: 30,
      rotation: 0,
      label: 'RC charging stage'
    }
  ],
  nets: [
    { id: 'n1', label: 'Supply', pins: ['B1.p', 'S1.a'] },
    { id: 'n2', label: 'Switched', pins: ['S1.b', 'R1.a'] },
    { id: 'n3', label: 'Capacitor', pins: ['R1.b', 'C1.a'] },
    { id: 'gnd', label: 'Ground', pins: ['B1.n', 'C1.b', 'G1.a'] }
  ]
};

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------
function kitchenSink(figureUrl: string) {
  counter = 0;
  const blocks = [
    heading(2, 'Inline text'),
    paragraph(
      text('Plain text with '),
      strong('strong'),
      text(', '),
      em('emphasis'),
      text(', '),
      { type: 'strikethrough', children: [text('strikethrough')] },
      text(', '),
      { type: 'inlineCode', value: 'inline code' },
      text(', inline math '),
      { type: 'inlineMath', value: 'E = mc^2' },
      text(', and a '),
      {
        type: 'link',
        url: 'https://example.com/',
        title: 'Example',
        children: [text('link')]
      },
      text('.'),
      { type: 'hardBreak' },
      text('A hard break precedes this line, and a footnote follows.'),
      { type: 'footnoteReference', identifier: 'note-1' },
      text(' Cited work: '),
      { type: 'citationReference', items: [{ id: 'knuth1984' }] },
      text('.')
    ),
    heading(3, 'Lists, quote and code'),
    block('publisle:list', {
      ordered: false,
      items: [
        { type: 'listItem', children: [p('First bullet')] },
        {
          type: 'listItem',
          children: [p('Second bullet with more words so it wraps on narrow screens')]
        },
        {
          type: 'listItem',
          children: [
            p('Nested list'),
            {
              type: 'list',
              ordered: true,
              items: [
                { type: 'listItem', children: [p('Inner one')] },
                { type: 'listItem', children: [p('Inner two')] }
              ]
            }
          ]
        }
      ]
    }),
    block('publisle:list', {
      ordered: false,
      items: [
        { type: 'taskListItem', checked: true, children: [p('Task done')] },
        { type: 'taskListItem', checked: false, children: [p('Task pending')] }
      ]
    }),
    block('publisle:quote', {
      children: [p('A short quotation that can run across a couple of lines on small screens.')]
    }),
    block('publisle:code', {
      language: 'rust',
      value: 'fn main() {\n    let total: u32 = (1..=10).sum();\n    println!("{total}");\n}'
    }),
    heading(3, 'Math'),
    block('publisle:math', {
      display: true,
      value: '\\int_0^1 x^2\\,dx = \\frac{1}{3}'
    }),
    heading(3, 'Figure and table'),
    block('publisle:figure', {
      src: figureUrl,
      alt: 'A diagonal gray gradient',
      caption: [p('Figure 1. A generated gradient served from the media library.')]
    }),
    block('publisle:table', {
      align: ['left', 'right', null],
      rows: [
        [[text('Part')], [text('Value')], [text('Note')]],
        [[text('R1')], [text('330')], [text('Series resistor')]],
        [[text('B1')], [text('9')], [text('Battery volts')]]
      ]
    }),
    heading(3, 'Callouts and divider'),
    block('publisle:callout', {
      variant: 'info',
      title: 'Information',
      children: [p('Callouts carry an explicit variant and a title.')]
    }),
    block('publisle:callout', {
      variant: 'warning',
      title: 'Warning',
      children: [p('Variants must stay legible without relying on color alone.')]
    }),
    block('publisle:divider', {}),
    heading(3, 'Embed'),
    block('publisle:embed', {
      provider: 'youtube',
      resourceId: 'dQw4w9WgXcQ',
      title: 'Embedded video',
      aspectRatio: { width: 16, height: 9 },
      fallback: [p('Open the video on its provider.')]
    }),
    heading(2, 'Diagrams'),
    block('publisle:diagram', {
      engine: 'mermaid',
      source: 'graph LR\n  Draft --> Review --> Published',
      alt: 'A draft moves to review and then to published',
      fallback: [p('A draft moves to review and then to published.')]
    }),
    block('publisle:diagram', {
      engine: 'graphviz',
      source: 'digraph { rankdir=LR; api -> compiler -> web }',
      alt: 'The API calls the compiler and the web app reads the result',
      fallback: [p('The API calls the compiler and the web app reads the result.')]
    }),
    block('publisle:diagram', {
      engine: 'plantuml',
      source: '@startuml\nAlice -> Bob: request\nBob --> Alice: response\n@enduml',
      alt: 'Alice sends a request to Bob and receives a response',
      fallback: [p('Alice sends a request to Bob and receives a response.')]
    }),
    block('publisle:diagram', {
      engine: 'wavedrom',
      source: JSON.stringify({
        signal: [
          { name: 'clk', wave: 'p....' },
          { name: 'data', wave: 'x345x' }
        ]
      }),
      alt: 'A clock and a data signal that changes on the second edge',
      fallback: [p('A clock and a data signal that changes on the second edge.')]
    }),
    heading(2, 'Interactive blocks'),
    block('voidreg:counter', defaults('voidreg:counter')),
    heading(3, 'Schematic: LED with series resistor'),
    schematicBlock(
      'LED circuit with a switch, resistor and battery',
      sampleSchematic(),
      explanation(
        'LED circuit',
        'See how a series resistor sets the current through an LED.',
        'Close the switch, then change the battery or resistor value.',
        'A 9 volt battery feeds a switch, a 330 ohm resistor and an LED in series. With the switch closed about 20 milliamps flow and the LED lights.'
      )
    ),
    heading(3, 'Schematic: voltage divider'),
    schematicBlock(
      'Voltage divider with two resistors',
      divider,
      explanation(
        'Voltage divider',
        'Two resistors share the battery voltage in proportion to their values.',
        'Change R1 or R2 and watch the midpoint voltage in the readout.',
        'A 9 volt battery feeds a 10 kilohm and a 4.7 kilohm resistor in series. The midpoint sits near 2.9 volts.'
      )
    ),
    heading(3, 'Schematic: RC stage'),
    schematicBlock(
      'Resistor and capacitor charged from a battery through a switch',
      rc,
      explanation(
        'RC stage',
        'A capacitor blocks steady current, so the loop carries none once charged.',
        'Open and close the switch and compare the readout.',
        'A 5 volt battery charges a 100 microfarad capacitor through a 10 kilohm resistor. At steady state no current flows.'
      )
    ),
    heading(2, 'Raw HTML'),
    block('publisle:raw-html', {
      value: '<p class="raw">Raw HTML is escaped, never executed.</p>'
    }),
    block('publisle:footnote', {
      identifier: 'note-1',
      children: [p('The footnote body renders in the notes section.')]
    }),
    block('publisle:bibliography', {
      entries: [
        {
          id: 'knuth1984',
          type: 'book',
          authors: ['Knuth, Donald'],
          title: 'The TeXbook',
          issued: '1984',
          publisher: 'Addison-Wesley'
        }
      ]
    })
  ];
  return document('Publisle feature test', blocks);
}

function longPost() {
  counter = 1000;
  const sections = [
    [
      'Why revisions matter',
      'A publishing system earns trust when an editor can change anything and still get back to any earlier state.'
    ],
    [
      'What the history keeps',
      'Autosaves within five minutes of each other collapse into one row, while publish, unpublish, archive and restore events are always kept.'
    ],
    [
      'Restoring safely',
      'Restoring an older revision creates a new working revision. The published copy only changes when you publish again.'
    ],
    [
      'Handling conflicts',
      'Every save carries the revision it was based on. A stale save is refused so that two tabs never overwrite each other silently.'
    ],
    [
      'Long content',
      'Realistic articles run for many paragraphs. This one repeats a few sentences to test reading width, line length, wrapping and the outline panel.'
    ]
  ];
  const blocks: ReturnType<typeof block>[] = [];
  for (const [title, lead] of sections) {
    blocks.push(heading(2, title));
    for (let i = 0; i < 4; i++) {
      blocks.push(
        paragraph(
          text(`${lead} `),
          text(
            'A reader should be able to follow this paragraph without horizontal scrolling at 375 pixels wide, including a very long identifier such as '
          ),
          {
            type: 'inlineCode',
            value: 'content_revisions.coalesce_seconds_before_new_row'
          },
          text(' and a long link '),
          {
            type: 'link',
            url: 'https://example.com/a/very/long/path/that/should/wrap/gracefully',
            children: [text('https://example.com/a/very/long/path/that/should/wrap/gracefully')]
          },
          text('.')
        )
      );
    }
  }
  return document('Revision history in practice', blocks);
}

function draftPost() {
  counter = 2000;
  return document('Unpublished draft with invalid math', [
    heading(2, 'Work in progress'),
    paragraph(
      text(
        'This draft stays unpublished. It carries invalid math so publishing is blocked until it is fixed.'
      )
    ),
    block('publisle:math', { display: true, value: '\\frac{1}{' })
  ]);
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v
  );
type Kind = 'articles' | 'projects';
type Stored = {
  slug: string;
  revision?: number;
  status?: string;
  document?: unknown;
  title?: string;
  id?: string;
  meta?: { id?: string };
};

async function compile(kind: Kind, slug: string, revision: number): Promise<string> {
  const started = await call<{ id: string }>('POST', `/${kind}/${slug}/compile`, {
    expected_revision: revision
  });
  for (let i = 0; i < 480; i++) {
    const job = await call<{
      state: string;
      diagnostics?: { level: string; message: string }[];
    }>('GET', `/compilations/${started.id}`);
    if (job.state === 'ready') return started.id;
    if (job.state === 'failed') {
      throw new Error(
        `compile ${slug} failed: ${JSON.stringify((job.diagnostics ?? []).filter((d) => d.level === 'error')).slice(0, 800)}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`compile ${slug} timed out`);
}

async function upsert(kind: Kind, slug: string, fields: Json, publish: boolean): Promise<Stored> {
  let stored: Stored | undefined;
  try {
    stored = await call<Stored>('GET', `/${kind}/${slug}`);
  } catch (error) {
    if (!/404/.test(String(error))) throw error;
  }
  const same =
    stored &&
    canonical(stored.document) === canonical(fields.document) &&
    stored.title === fields.title;
  if (!stored) {
    stored = await call<Stored>('POST', `/${kind}`, { ...fields, slug });
    console.log(`created ${kind}/${slug}`);
  } else if (!same) {
    stored = await call<Stored>('PUT', `/${kind}/${slug}`, {
      ...fields,
      expected_revision: stored.revision
    });
    console.log(`updated ${kind}/${slug} (revision ${stored.revision})`);
  } else {
    console.log(`unchanged ${kind}/${slug}`);
  }
  const hasChanges = (stored as { has_unpublished_changes?: boolean }).has_unpublished_changes;
  if (publish && (stored.status !== 'published' || hasChanges)) {
    const compilationId = await compile(kind, slug, stored.revision ?? 1);
    stored = await call<Stored>('POST', `/${kind}/${slug}/publish`, {
      expected_revision: stored.revision,
      compilation_id: compilationId
    });
    console.log(`published ${kind}/${slug}`);
  }
  return stored;
}

async function ensureTopic(
  projectId: string,
  slug: string,
  title: string,
  summary: string,
  sort: number
) {
  if (!projectId) return '';
  try {
    const found = await call<Stored>('GET', `/topics/${projectId}/${slug}`);
    console.log(`unchanged topics/${slug}`);
    return found.id ?? '';
  } catch (error) {
    if (!(error instanceof ApiFailure && error.status === 404)) throw error;
  }
  const created = await call<Stored>('POST', '/topics', {
    project_id: projectId,
    slug,
    title,
    summary,
    sort_order: sort
  });
  console.log(`created topics/${slug}`);
  return created.id ?? '';
}

async function main() {
  if (!PASSWORD) throw new Error('Set ADMIN_PASSWORD');
  await signIn();
  const figure = await ensureMedia();

  const projectFields = (
    title: string,
    category: string,
    summary: string,
    related: string[],
    sort: number
  ) => ({
    title,
    category,
    summary,
    tags: ['Test', 'Publisle'],
    featured: sort === 0,
    sort_order: sort,
    related_project_ids: related,
    document: document(title, [
      heading(2, 'Overview'),
      paragraph(
        text(
          `${summary} This project exists to exercise cross links, the knowledge graph and project pages.`
        )
      )
    ])
  });
  const alpha = await upsert(
    'projects',
    'test-signal-lab',
    projectFields(
      'Signal Lab',
      'Test project',
      'A bench of interactive circuits and diagrams.',
      [],
      0
    ),
    true
  );
  const alphaId = alpha.id ?? alpha.meta?.id ?? '';
  const beta = await upsert(
    'projects',
    'test-revision-vault',
    projectFields(
      'Revision Vault',
      'Test project',
      'A tour of revisions, diffs and restore.',
      alphaId ? [alphaId] : [],
      1
    ),
    true
  );
  const betaId = beta.id ?? beta.meta?.id ?? '';

  const benchTopic = await ensureTopic(
    alphaId,
    'bench-circuits',
    'Bench circuits',
    'Interactive circuits and measurements from the bench.',
    10
  );
  const diagramTopic = await ensureTopic(
    alphaId,
    'diagrams',
    'Diagrams',
    'Diagram engines and schematic rendering.',
    20
  );
  const historyTopic = await ensureTopic(
    betaId,
    'history',
    'History and restore',
    'How revisions, diffs and restore behave.',
    10
  );
  const meta = (ids: string[], topic = '') => ({
    project_ids: ids,
    topic_id: topic || null
  });
  await upsert(
    'articles',
    'publisle-feature-test',
    {
      title: 'Publisle feature test',
      category: 'Test',
      summary: 'Every block type, diagram engine and interactive schematic in one article.',
      tags: ['Test', 'Publisle', 'Diagrams'],
      meta: meta(alphaId ? [alphaId] : [], diagramTopic),
      document: kitchenSink(figure),
      featured: true
    },
    true
  );
  await upsert(
    'articles',
    'revision-history-in-practice',
    {
      title: 'Revision history in practice',
      category: 'Test',
      summary: 'A long article for reading width, wrapping and history.',
      tags: ['Test', 'History'],
      meta: meta(betaId ? [betaId] : [], historyTopic),
      document: longPost()
    },
    true
  );
  await upsert(
    'articles',
    'test-bench-notes',
    {
      title: 'Bench notes',
      category: 'Test',
      summary: 'A short post filed under a topic.',
      tags: ['Test', 'Bench'],
      meta: meta(alphaId ? [alphaId] : [], benchTopic),
      document: document('Bench notes', [
        paragraph(text('A short post that sits under the Bench circuits topic.'))
      ])
    },
    true
  );
  await upsert(
    'articles',
    'test-signal-lab-misc',
    {
      title: 'Signal Lab odds and ends',
      category: 'Test',
      summary: 'A project post with no topic, listed under Other posts.',
      tags: ['Test'],
      meta: meta(alphaId ? [alphaId] : []),
      document: document('Signal Lab odds and ends', [
        paragraph(text('This post follows the project but is not filed under any topic.'))
      ])
    },
    true
  );
  await upsert(
    'articles',
    'test-draft-invalid-math',
    {
      title: 'Unpublished draft with invalid math',
      category: 'Test',
      summary: 'Stays a draft.',
      meta: meta([]),
      document: draftPost()
    },
    false
  );
  console.log('done');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
