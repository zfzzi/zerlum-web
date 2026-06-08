export type NightRenderUploadMode = "json" | "multipart";
export type NightRenderApiProvider = "openai-compatible" | "runninghub";

export interface NightRenderApiConfig {
  baseUrl: string;
  token: string;
  timeoutMs: number;
  uploadMode: NightRenderUploadMode;
  provider: NightRenderApiProvider;
  imageGenerationEndpoint: string;
  chatCompletionsEndpoint: string;
  mediaUploadEndpoint: string;
  queryEndpoint: string;
  imageModel: string;
  promptModel: string;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RUNNINGHUB_BASE_URL = "https://www.runninghub.ai";
const DEFAULT_RUNNINGHUB_IMAGE_ENDPOINT =
  "/openapi/v2/rhart-imagine-image-quality/edit";
const DEFAULT_IMAGE_MODEL = "gpt-image-1";
const DEFAULT_PROMPT_MODEL = "gpt-4o-mini";
const LOCAL_BASE_URL_KEY = "yehuiai.api.baseUrl";
const LOCAL_TOKEN_KEY = "yehuiai.api.token";
const LOCAL_PROVIDER_KEY = "yehuiai.api.provider";
const LOCAL_IMAGE_ENDPOINT_KEY = "yehuiai.api.imageEndpoint";
const LOCAL_CHAT_ENDPOINT_KEY = "yehuiai.api.chatEndpoint";
const LOCAL_UPLOAD_ENDPOINT_KEY = "yehuiai.api.mediaUploadEndpoint";
const LOCAL_QUERY_ENDPOINT_KEY = "yehuiai.api.queryEndpoint";

function cleanBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}

function cleanEndpoint(value: string) {
  const trimmed = value.trim();
  const endpoint = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  if (endpoint.startsWith("/rhart-")) {
    return `/openapi/v2${endpoint}`;
  }

  return endpoint;
}

function readLocalOverride(key: string) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return (window.localStorage.getItem(key) ?? "").trim();
  } catch {
    return "";
  }
}

function readImageEndpointOverride() {
  const localEndpoint = readLocalOverride(LOCAL_IMAGE_ENDPOINT_KEY);

  if (
    localEndpoint.includes("rhart-image-x-official/edit") ||
    localEndpoint.includes("rhart-image-g-2-official/image-to-image")
  ) {
    return "";
  }

  return localEndpoint;
}

function readTimeoutMs(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function readUploadMode(value: string | undefined): NightRenderUploadMode {
  return value === "multipart" ? "multipart" : "json";
}

function readProvider(
  value: string | undefined,
  baseUrl: string,
  endpoint: string
): NightRenderApiProvider {
  if (value === "runninghub") {
    return "runninghub";
  }

  if (baseUrl.includes("runninghub.") || endpoint.startsWith("/openapi/v2/")) {
    return "runninghub";
  }

  return "openai-compatible";
}

export function getNightRenderApiConfig(): NightRenderApiConfig {
  const baseUrl = cleanBaseUrl(
    readLocalOverride(LOCAL_BASE_URL_KEY) ||
      import.meta.env.VITE_NIGHT_RENDER_API_BASE_URL ||
      DEFAULT_RUNNINGHUB_BASE_URL
  );
  const imageGenerationEndpoint = cleanEndpoint(
    readImageEndpointOverride() ||
      import.meta.env.VITE_NIGHT_RENDER_IMAGE_ENDPOINT ||
      DEFAULT_RUNNINGHUB_IMAGE_ENDPOINT
  );

  return {
    baseUrl,
    token:
      readLocalOverride(LOCAL_TOKEN_KEY) ||
      import.meta.env.VITE_NIGHT_RENDER_API_TOKEN ||
      "",
    timeoutMs: readTimeoutMs(import.meta.env.VITE_NIGHT_RENDER_API_TIMEOUT_MS),
    uploadMode: readUploadMode(import.meta.env.VITE_NIGHT_RENDER_API_UPLOAD_MODE),
    provider: readProvider(
      readLocalOverride(LOCAL_PROVIDER_KEY) ||
        import.meta.env.VITE_NIGHT_RENDER_API_PROVIDER ||
        "runninghub",
      baseUrl,
      imageGenerationEndpoint
    ),
    imageGenerationEndpoint,
    chatCompletionsEndpoint: cleanEndpoint(
      readLocalOverride(LOCAL_CHAT_ENDPOINT_KEY) ||
        import.meta.env.VITE_NIGHT_RENDER_CHAT_ENDPOINT ||
        "/v1/chat/completions"
    ),
    mediaUploadEndpoint: cleanEndpoint(
      readLocalOverride(LOCAL_UPLOAD_ENDPOINT_KEY) ||
        import.meta.env.VITE_NIGHT_RENDER_MEDIA_UPLOAD_ENDPOINT ||
        "/openapi/v2/media/upload/binary"
    ),
    queryEndpoint: cleanEndpoint(
      readLocalOverride(LOCAL_QUERY_ENDPOINT_KEY) ||
        import.meta.env.VITE_NIGHT_RENDER_QUERY_ENDPOINT ||
        "/openapi/v2/query"
    ),
    imageModel:
      import.meta.env.VITE_NIGHT_RENDER_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    promptModel:
      import.meta.env.VITE_NIGHT_RENDER_PROMPT_MODEL || DEFAULT_PROMPT_MODEL
  };
}

export function buildApiUrl(baseUrl: string, endpoint: string) {
  if (!baseUrl) {
    return endpoint;
  }

  return `${baseUrl}${cleanEndpoint(endpoint)}`;
}
