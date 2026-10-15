import { type Request, type Response } from "express";

// Minimal stand-ins for Express objects, shared by the controller unit tests.
export interface FakeResponse {
  statusCode: number;
  body: unknown;
  ended: boolean;
  headers: Record<string, string>;
  locals: Record<string, unknown>;
  status(code: number): FakeResponse;
  json(payload: unknown): FakeResponse;
  end(payload?: unknown): FakeResponse;
  setHeader(name: string, value: string): FakeResponse;
}

export function fakeResponse(locals: Record<string, unknown> = {}): FakeResponse {
  const res: FakeResponse = {
    statusCode: 200,
    body: undefined,
    ended: false,
    headers: {},
    locals,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    end(payload) {
      res.ended = true;
      if (payload !== undefined) res.body = payload;
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
  };
  return res;
}

export async function invoke(
  handler: (req: Request, res: Response) => Promise<void>,
  req: object,
  locals: Record<string, unknown> = {},
): Promise<FakeResponse> {
  const res = fakeResponse(locals);
  await handler(req as Request, res as unknown as Response);
  return res;
}

// Builds the res.locals of an authenticated request.
export function authLocals(userId: string, role: string): Record<string, unknown> {
  return { auth: { userId, role } };
}
