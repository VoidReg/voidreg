import { createHttpServer } from './http';
const origin = new URL(process.env.PUBLIC_BASE_URL ?? 'https://www.voidreg.xyz').origin;
const server = createHttpServer(process.env.MCP_API_URL ?? 'http://api:8080', origin);
server.listen(Number(process.env.PORT ?? 8090), process.env.HOST ?? '127.0.0.1', () =>
  console.log('Voidreg MCP listening')
);
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
