const DEFAULT_BASE_URL = "https://www.runninghub.cn";
const DEFAULT_IMAGE_ENDPOINT = "/openapi/v2/rhart-imagine-image-quality/edit";
const DEFAULT_UPLOAD_ENDPOINT = "/openapi/v2/media/upload/binary";
const DEFAULT_QUERY_ENDPOINT = "/openapi/v2/query";
const DEFAULT_UPSCALE_ENDPOINT = "";
const DEFAULT_TIMEOUT_MS = 180000;

function cleanBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function cleanEndpoint(value) {
  const endpoint = String(value || "").trim();
  return endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
}

function getConfig() {
  return {
    baseUrl: cleanBaseUrl(
      process.env.NIGHT_RENDER_API_BASE_URL ||
        process.env.VITE_NIGHT_RENDER_API_BASE_URL ||
        DEFAULT_BASE_URL
    ),
    imageEndpoint: cleanEndpoint(
      process.env.NIGHT_RENDER_IMAGE_ENDPOINT ||
        process.env.VITE_NIGHT_RENDER_IMAGE_ENDPOINT ||
        DEFAULT_IMAGE_ENDPOINT
    ),
    uploadEndpoint: cleanEndpoint(
      process.env.NIGHT_RENDER_MEDIA_UPLOAD_ENDPOINT ||
        process.env.VITE_NIGHT_RENDER_MEDIA_UPLOAD_ENDPOINT ||
        DEFAULT_UPLOAD_ENDPOINT
    ),
    queryEndpoint: cleanEndpoint(
      process.env.NIGHT_RENDER_QUERY_ENDPOINT ||
        process.env.VITE_NIGHT_RENDER_QUERY_ENDPOINT ||
        DEFAULT_QUERY_ENDPOINT
    ),
    upscaleEndpoint: process.env.NIGHT_RENDER_UPSCALE_ENDPOINT ||
      process.env.VITE_NIGHT_RENDER_UPSCALE_ENDPOINT ||
      DEFAULT_UPSCALE_ENDPOINT,
    timeoutMs: Number(
      process.env.NIGHT_RENDER_API_TIMEOUT_MS ||
        process.env.VITE_NIGHT_RENDER_API_TIMEOUT_MS ||
        DEFAULT_TIMEOUT_MS
    ),
    token:
      process.env.NIGHT_RENDER_API_TOKEN ||
      process.env.VITE_NIGHT_RENDER_API_TOKEN ||
      ""
  };
}

function buildUrl(config, endpoint) {
  return `${config.baseUrl}${cleanEndpoint(endpoint)}`;
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  return rawBody ? JSON.parse(rawBody) : {};
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/u.exec(String(dataUrl || ""));

  if (!match) {
    throw new Error("sourceImage.dataUrl is not a valid data URL.");
  }

  const mimeType = match[1] || "image/png";
  const isBase64 = Boolean(match[2]);
  const data = isBase64
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]), "utf8");

  return { data, mimeType };
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.msg ||
      payload?.errorMessage ||
      payload?.error ||
      text ||
      `HTTP ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function uploadSourceImage(config, sourceImage) {
  const { data, mimeType } = parseDataUrl(sourceImage?.dataUrl);
  const fileName = sourceImage?.fileName || `zerlum-source-${Date.now()}.png`;
  const formData = new FormData();
  formData.append("file", new Blob([data], { type: mimeType }), fileName);

  const payload = await fetchJson(buildUrl(config, config.uploadEndpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`
    },
    body: formData
  });
  const uploaded = payload?.data || payload;
  const imageUrl = uploaded?.download_url || uploaded?.downloadUrl || uploaded?.url;

  if (!imageUrl) {
    throw new Error("RunningHub upload response did not include download_url.");
  }

  return imageUrl;
}

function buildPrompt(request) {
  const composedPrompt = request.finalPrompt || request.prompt;

  return [
    composedPrompt,
    `Scene type: ${request.sceneType || "architectural night rendering"}.`,
    `Lighting style: ${request.template || "professional blue hour lighting"}.`,
    request.negativePrompts?.length
      ? `Hard constraints: ${request.negativePrompts.join(", ")}.`
      : "",
    "Turn the uploaded daytime architectural image into a professional night lighting rendering.",
    "Preserve the original architecture, perspective, paving, trees, people, window positions, and facade structure.",
    "Only change the night ambience, exterior lighting, interior glow, light beams, contrast, and atmosphere."
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
}

function toRunningHubResolution(size) {
  return size === "2K" ? "2k" : "2k";
}

function toUpscaleResolution(size) {
  const normalized = String(size || "4K").toUpperCase();

  if (normalized === "8K") {
    return "8k";
  }

  if (normalized === "6K") {
    return "6k";
  }

  if (normalized === "4K") {
    return "4k";
  }

  return "2k";
}

function getTaskId(payload) {
  return payload?.taskId || payload?.data?.taskId || payload?.data?.id || payload?.id;
}

function getResultUrl(payload) {
  const candidates = [
    payload?.resultImageUrl,
    payload?.imageUrl,
    payload?.url,
    payload?.data?.resultImageUrl,
    payload?.data?.imageUrl,
    payload?.data?.url,
    payload?.data?.download_url,
    payload?.results?.[0]?.url,
    payload?.results?.[0]?.fileUrl,
    payload?.data?.results?.[0]?.url,
    payload?.data?.results?.[0]?.fileUrl
  ];

  return candidates.find((value) => typeof value === "string" && value.length > 0);
}

function isFailedStatus(status) {
  return ["FAIL", "FAILED", "ERROR"].includes(String(status || "").toUpperCase());
}

async function wait(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollRunningHubResult(config, taskId) {
  const startedAt = Date.now();
  let lastPayload = null;

  while (Date.now() - startedAt < config.timeoutMs) {
    const payload = await fetchJson(buildUrl(config, config.queryEndpoint), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ taskId })
    });
    lastPayload = payload;

    const resultUrl = getResultUrl(payload);
    if (resultUrl) {
      return resultUrl;
    }

    if (isFailedStatus(payload?.status)) {
      throw new Error(payload?.errorMessage || "RunningHub task failed.");
    }

    await wait(2500);
  }

  throw new Error(
    lastPayload?.errorMessage ||
      `RunningHub task timed out after ${Math.round(config.timeoutMs / 1000)} seconds.`
  );
}

async function generateWithRunningHub(config, request) {
  const imageUrl = await uploadSourceImage(config, request.sourceImage);
  const prompt = buildPrompt(request);
  const taskPayload = await fetchJson(buildUrl(config, config.imageEndpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      imageUrl,
      aspectRatio: "auto",
      resolution: toRunningHubResolution(request.output?.size),
      numImages: "1",
      outputFormat: "jpeg"
    })
  });

  const directResultUrl = getResultUrl(taskPayload);
  if (directResultUrl) {
    return directResultUrl;
  }

  const taskId = getTaskId(taskPayload);
  if (!taskId) {
    throw new Error("RunningHub task response did not include taskId.");
  }

  return pollRunningHubResult(config, taskId);
}

async function upscaleWithRunningHub(config, request, imageUrl) {
  const shouldUpscale =
    request?.upscale?.enabled &&
    request?.upscale?.targetSize &&
    request.upscale.targetSize !== "2K" &&
    config.upscaleEndpoint;

  if (!shouldUpscale) {
    return {
      imageUrl,
      applied: false
    };
  }

  const prompt = request.finalPrompt || buildPrompt(request);
  const upscalePayload = await fetchJson(buildUrl(config, config.upscaleEndpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      imageUrl,
      prompt,
      resolution: toUpscaleResolution(request.upscale.targetSize),
      outputFormat: "jpeg"
    })
  });

  const directResultUrl = getResultUrl(upscalePayload);
  if (directResultUrl) {
    return {
      imageUrl: directResultUrl,
      applied: true
    };
  }

  const taskId = getTaskId(upscalePayload);
  if (!taskId) {
    throw new Error("RunningHub upscale response did not include taskId.");
  }

  return {
    imageUrl: await pollRunningHubResult(config, taskId),
    applied: true
  };
}

export default async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");

  if (request.method !== "POST") {
    response.status(405).json({ status: "failed", error: "Method not allowed." });
    return;
  }

  const config = getConfig();

  if (!config.token) {
    response.status(200).json({
      status: "failed",
      error: "NIGHT_RENDER_API_TOKEN is not configured."
    });
    return;
  }

  try {
    const body = await readJsonBody(request);

    if (!body?.sourceImage?.dataUrl) {
      response.status(400).json({
        status: "failed",
        error: "sourceImage.dataUrl is required."
      });
      return;
    }

    const generatedImageUrl = await generateWithRunningHub(config, body);
    const upscaleResult = await upscaleWithRunningHub(config, body, generatedImageUrl);
    response.status(200).json({
      status: "completed",
      provider: "api",
      resultImageUrl: upscaleResult.imageUrl,
      upscaleApplied: upscaleResult.applied,
      versionId: `rh-${Date.now()}`
    });
  } catch (error) {
    response.status(502).json({
      status: "failed",
      error: error instanceof Error ? error.message : "Night render API failed."
    });
  }
};
