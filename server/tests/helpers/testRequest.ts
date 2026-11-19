import { Express } from 'express';
import { IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';

export interface MockResponse {
  status: number;
  headers: Record<string, string | number | string[] | undefined>;
  body: any;
  rawBody: string;
}

export function testRequest(
  app: Express,
  options: {
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    url: string;
    body?: any;
    headers?: Record<string, string>;
  }
): Promise<MockResponse> {
  return new Promise((resolve) => {
    // Dummy socket for IncomingMessage without binding network port
    const socket = new Socket();
    const req = new IncomingMessage(socket);
    req.method = options.method;
    req.url = options.url;
    const payload = options.body !== undefined
      ? typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body)
      : null;

    req.headers = {
      host: 'localhost',
      'user-agent': 'test-agent',
      accept: 'application/json',
      ...(payload
        ? {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload, 'utf8').toString(),
          }
        : {}),
      ...(options.headers || {}),
    };

    const res = new ServerResponse(req);
    let rawBody = '';

    const origWrite = res.write.bind(res);
    res.write = function (chunk: any, ...args: any[]) {
      if (chunk) {
        rawBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      }
      return origWrite(chunk, ...args);
    } as any;

    const origEnd = res.end.bind(res);
    res.end = function (chunk: any, ...args: any[]) {
      if (chunk) {
        rawBody += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      }
      origEnd(chunk, ...args);

      let parsedBody = rawBody;
      try {
        parsedBody = JSON.parse(rawBody);
      } catch {
        // preserve string body
      }

      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        body: parsedBody,
        rawBody,
      });
      return this;
    } as any;

    if (payload !== null) {
      req.push(payload);
    }
    req.push(null);

    app(req, res);
  });
}
