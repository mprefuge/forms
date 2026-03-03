import { HttpRequest, InvocationContext } from '@azure/functions';

export function resolveRequestObject(request: HttpRequest, context: InvocationContext): any {
  let reqObj: any = request;

  if (!reqObj || typeof reqObj.method === 'undefined') {
    const ctxAny: any = context;
    if (ctxAny && typeof ctxAny.method !== 'undefined') {
      reqObj = ctxAny;
    } else {
      reqObj = (ctxAny && (ctxAny.req || ctxAny.bindingData || ctxAny.raw?.req)) || reqObj;
    }
  }

  return reqObj;
}

export function resolveRequestId(request: HttpRequest, context: InvocationContext, reqObj: any): string {
  const headersAny: any = reqObj?.headers || request.headers || {};
  return (
    (typeof headersAny.get === 'function'
      ? headersAny.get('X-Request-Id')
      : headersAny['x-request-id'] || headersAny['X-Request-Id']) ||
    context.invocationId ||
    ''
  );
}

export async function streamToString(stream: any): Promise<string> {
  if (!stream) return '';

  if (typeof stream.on === 'function') {
    return await new Promise<string>((resolve, reject) => {
      let data = '';
      stream.on('data', (chunk: any) => {
        try {
          data += chunk.toString();
        } catch (e) {
          data += String(chunk);
        }
      });
      stream.on('end', () => resolve(data));
      stream.on('error', (err: any) => reject(err));
    });
  }

  if (typeof stream.getReader === 'function') {
    const reader = stream.getReader();
    let result = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      try {
        result += typeof value === 'string' ? value : Buffer.from(value).toString();
      } catch (e) {
        result += String(value);
      }
    }
    return result;
  }

  try {
    return String(stream);
  } catch (e) {
    return '';
  }
}

export async function parseFlexibleJsonBody(request: HttpRequest, reqObj: any): Promise<any> {
  let body: any;

  if (request && typeof request.json === 'function') {
    body = await request.json();
  } else if (request && typeof request.body !== 'undefined') {
    body = request.body;
  } else if (reqObj && typeof reqObj.body !== 'undefined') {
    body = reqObj.body;
  } else if (reqObj && typeof reqObj.rawBody !== 'undefined') {
    if (typeof reqObj.rawBody === 'string') {
      try {
        body = JSON.parse(reqObj.rawBody);
      } catch (err) {
        body = {};
      }
    } else if (reqObj.rawBody && typeof reqObj.rawBody.getReader === 'function') {
      const txt = await streamToString(reqObj.rawBody);
      try {
        body = JSON.parse(txt);
      } catch (err) {
        body = {};
      }
    } else if (reqObj.rawBody && typeof reqObj.rawBody.on === 'function') {
      const txt = await streamToString(reqObj.rawBody);
      try {
        body = JSON.parse(txt);
      } catch (err) {
        body = {};
      }
    } else {
      body = {};
    }
  } else if (request && (request as any).raw && (request as any).raw.req) {
    try {
      const txt = await streamToString((request as any).raw.req);
      try {
        body = JSON.parse(txt);
      } catch (e) {
        body = {};
      }
    } catch (e) {
      body = {};
    }
  } else {
    body = {};
  }

  if (typeof body === 'string' && body.trim().length > 0) {
    try {
      body = JSON.parse(body);
    } catch (err) {
    }
  }

  return body;
}

export function getRawBodyTextForDiagnostics(reqObj: any, request: HttpRequest): string {
  return String(reqObj?.body || reqObj?.rawBody || request?.body || '');
}