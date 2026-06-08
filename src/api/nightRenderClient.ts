import type {
  ExportRequest,
  GenerationRequest,
  GenerationResponse,
  ProjectVersion,
  PromptOptimizationResponse
} from "../types/nightRender";

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function requestJson<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(endpoint, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {})
      },
      ...options
    });
  } catch {
    throw new ApiClientError("API 服务尚未连接，请接入后端后重试。");
  }

  if (!response.ok) {
    throw new ApiClientError(
      `生成服务返回 ${response.status}，请检查后端任务服务。`,
      response.status
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiClientError("API 响应不是有效 JSON。");
  }
}

export function generateNightRender(
  request: GenerationRequest
): Promise<GenerationResponse> {
  return requestJson<GenerationResponse>("/api/night-render/generate", {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export function optimizePrompt(
  prompt: string
): Promise<PromptOptimizationResponse> {
  return requestJson<PromptOptimizationResponse>(
    "/api/night-render/prompt/optimize",
    {
      method: "POST",
      body: JSON.stringify({ prompt })
    }
  );
}

export function getProjectVersions(
  projectId: string
): Promise<ProjectVersion[]> {
  return requestJson<ProjectVersion[]>(`/api/projects/${projectId}/versions`);
}

export function exportProject(request: ExportRequest): Promise<{ jobId: string }> {
  return requestJson<{ jobId: string }>("/api/exports", {
    method: "POST",
    body: JSON.stringify(request)
  });
}
