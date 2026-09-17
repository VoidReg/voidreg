export type Project = { title: string; category: string; summary: string; tags: string[] };

export const projects: Project[] = [
  {
    title: 'miniRT',
    category: 'Graphics',
    summary: 'A ray tracer exploring the mathematics of light, surfaces, and image formation.',
    tags: ['C', 'Ray tracing', 'Linear algebra']
  },
  {
    title: 'Webserv',
    category: 'Systems',
    summary:
      'An HTTP server built around explicit protocol handling and operating-system constraints.',
    tags: ['C++', 'POSIX', 'HTTP/1.1']
  },
  {
    title: 'csi-rs',
    category: 'RF / Embedded',
    summary:
      'An open-source Rust stack for Wi-Fi CSI on ESP devices, from drivers to host streaming.',
    tags: ['Rust', 'ESP32', 'Wi-Fi CSI']
  },
  {
    title: 'Voidreg Design Engineering',
    category: 'Design Engineering',
    summary:
      'A theme-agnostic system for designing, validating, and implementing accessible interfaces.',
    tags: ['TypeScript', 'Penpot', 'Tailwind CSS']
  }
];
