import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createMcpHandler } from '@modelcontextprotocol/server';
import { hostHeaderValidation, originValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { BridgeError, createTools, type Bridge } from './tools';

export function createHttpServer(apiUrl: string, publicOrigin: string) {
  const hostname = new URL(publicOrigin).hostname;
  const checkHost = hostHeaderValidation([hostname]);
  const checkOrigin = originValidation([hostname]);
  function respond(res: ServerResponse, status: number, message: string) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(status === 401 ? { 'WWW-Authenticate': 'Bearer realm="voidreg-mcp"' } : {})
    });
    res.end(JSON.stringify({ error: message }));
  }
  const http = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/healthz') {
      res.end('ok');
      return;
    }
    if (req.url !== '/mcp') {
      respond(res, 404, 'Not found');
      return;
    }
    if (!checkHost(req, res) || !checkOrigin(req, res)) return;
    const authorization = req.headers.authorization;
    if (!authorization || !/^Bearer vr_mcp_[A-Za-z0-9_-]{32,100}$/.test(authorization)) {
      respond(res, 401, 'MCP bearer token required');
      return;
    }
    const bridge: Bridge = async (path, method = 'GET', body) => {
      const response = await fetch(apiUrl + '/api/v1/mcp' + path, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(20_000),
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      }).catch(() => {
        throw new BridgeError('Publishing service unavailable.', 503);
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new BridgeError(
          data?.error?.message ?? 'Publishing service unavailable.',
          response.status
        );
      return data;
    };
    try {
      // Authenticate discovery and validation too, even when no draft is read.
      await bridge('/session');
      if (req.method !== 'POST') {
        respond(res, 405, 'Only POST is supported by this stateless MCP server');
        return;
      }
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 7 * 1024 * 1024) {
          respond(res, 413, 'Request exceeds 7 MiB');
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        respond(res, 400, 'Invalid JSON');
        return;
      }
      const handler = createMcpHandler(() => createTools(bridge, publicOrigin), {
        legacy: 'stateless',
        responseMode: 'auto'
      });
      await toNodeHandler(handler)(req, res, parsed);
    } catch (error) {
      if (!res.headersSent) {
        const status = error instanceof BridgeError ? error.status : 503;
        respond(
          res,
          status,
          status >= 500 ? 'Publishing service unavailable.' : (error as Error).message
        );
      } else res.end();
    }
  });
  http.requestTimeout = 30_000;
  http.headersTimeout = 10_000;
  return http;
}
