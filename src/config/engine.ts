export interface EngineConfig {
  url: string;
  apiKey: string;
  timeoutMs: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export function getEngineConfig(env: NodeJS.ProcessEnv = process.env): EngineConfig {
  const url = env["ENGINE_URL"];
  const apiKey = env["ENGINE_API_KEY"];

  if (!url || !apiKey) {
    throw new Error("ENGINE_URL and ENGINE_API_KEY must be defined in the environment");
  }

  const timeout = Number(env["ENGINE_TIMEOUT_MS"]);
  return { url, apiKey, timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS };
}
