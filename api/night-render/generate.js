const DEFAULT_BASE_URL = "https://www.runninghub.cn";
const DEFAULT_IMAGE_ENDPOINT = "/rhart-imagine-image-quality/edit";
const DEFAULT_BANANA_IMAGE_ENDPOINT = "/rhart-image-n-pro/edit";
const DEFAULT_UPLOAD_ENDPOINT = "/openapi/v2/media/upload/binary";
const DEFAULT_QUERY_ENDPOINT = "/openapi/v2/query";
const DEFAULT_UPSCALE_ENDPOINT = "/run/workflow/2063804310617677826";
const DEFAULT_OPENAPI_PREFIX = "/openapi/v2";
const DEFAULT_TIMEOUT_MS = 180000;

let cachedUpscaleNodeIds = null;

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
    bananaImageEndpoint: cleanEndpoint(
      process.env.NIGHT_RENDER_BANANA_IMAGE_ENDPOINT ||
        process.env.VITE_NIGHT_RENDER_BANANA_IMAGE_ENDPOINT ||
        DEFAULT_BANANA_IMAGE_ENDPOINT
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
    upscaleEndpoint:
      process.env.NIGHT_RENDER_UPSCALE_ENDPOINT ||
      process.env.VITE_NIGHT_RENDER_UPSCALE_ENDPOINT ||
      DEFAULT_UPSCALE_ENDPOINT,
    openApiPrefix: cleanEndpoint(
      process.env.NIGHT_RENDER_OPENAPI_PREFIX ||
        process.env.VITE_NIGHT_RENDER_OPENAPI_PREFIX ||
        DEFAULT_OPENAPI_PREFIX
    ),
    upscaleLoadImageNodeId:
      process.env.NIGHT_RENDER_UPSCALE_LOAD_IMAGE_NODE_ID ||
      process.env.VITE_NIGHT_RENDER_UPSCALE_LOAD_IMAGE_NODE_ID ||
      "",
    upscaleValueNodeId:
      process.env.NIGHT_RENDER_UPSCALE_VALUE_NODE_ID ||
      process.env.VITE_NIGHT_RENDER_UPSCALE_VALUE_NODE_ID ||
      "",
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
  const cleanedEndpoint = cleanEndpoint(endpoint);
  const shouldPrefixOpenApi =
    cleanedEndpoint.startsWith("/rhart-") ||
    cleanedEndpoint.startsWith("/seedream-") ||
    cleanedEndpoint.startsWith("/qwen-") ||
    cleanedEndpoint.startsWith("/wan-");
  const finalEndpoint =
    shouldPrefixOpenApi && !cleanedEndpoint.startsWith(config.openApiPrefix)
      ? `${config.openApiPrefix}${cleanedEndpoint}`
      : cleanedEndpoint;

  return `${config.baseUrl}${finalEndpoint}`;
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

  if (
    payload &&
    typeof payload === "object" &&
    "code" in payload &&
    payload.code !== 0 &&
    payload.code !== "0"
  ) {
    throw new Error(
      payload.message ||
        payload.msg ||
        payload.errorMessage ||
        payload.error ||
        `RunningHub API returned code ${payload.code}.`
    );
  }

  return payload;
}

function readUploadedAsset(payload) {
  const uploaded = payload?.data || payload;
  const downloadUrl =
    uploaded?.download_url ||
    uploaded?.downloadUrl ||
    uploaded?.url ||
    uploaded?.fileUrl;
  const fileName = uploaded?.fileName || uploaded?.filename || uploaded?.name;

  if (!downloadUrl && !fileName) {
    throw new Error("RunningHub upload response did not include download_url or fileName.");
  }

  return {
    downloadUrl,
    fileName
  };
}

async function uploadBinaryImage(config, data, mimeType, fileName) {
  const formData = new FormData();
  formData.append("file", new Blob([data], { type: mimeType }), fileName);

  const payload = await fetchJson(buildUrl(config, config.uploadEndpoint), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`
    },
    body: formData
  });

  return readUploadedAsset(payload);
}

async function uploadSourceImage(config, sourceImage) {
  const { data, mimeType } = parseDataUrl(sourceImage?.dataUrl);
  const fileName = sourceImage?.fileName || `zerlum-source-${Date.now()}.png`;

  return uploadBinaryImage(config, data, mimeType, fileName);
}

async function uploadAnnotationReferenceImage(config, annotationReferenceImage) {
  if (!annotationReferenceImage?.dataUrl) {
    return null;
  }

  const { data, mimeType } = parseDataUrl(annotationReferenceImage.dataUrl);
  const fileName =
    annotationReferenceImage.fileName || `zerlum-fixture-annotations-${Date.now()}.png`;

  return uploadBinaryImage(config, data, mimeType, fileName);
}

async function uploadReferenceImages(config, referenceImages = []) {
  if (!Array.isArray(referenceImages) || referenceImages.length === 0) {
    return [];
  }

  const uploadableImages = referenceImages.filter((referenceImage) => referenceImage?.dataUrl);

  return Promise.all(
    uploadableImages.map(async (referenceImage, index) => {
      const { data, mimeType } = parseDataUrl(referenceImage.dataUrl);
      const fileName =
        referenceImage.fileName || `zerlum-visual-reference-${Date.now()}-${index + 1}.png`;
      const uploaded = await uploadBinaryImage(config, data, mimeType, fileName);

      return {
        ...uploaded,
        role: referenceImage.role || "style",
        label: referenceImage.label || "参考图"
      };
    })
  );
}

async function uploadImageUrlForWorkflow(config, imageUrl) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Unable to fetch generated image for upscale workflow: HTTP ${response.status}`);
  }

  const mimeType = response.headers.get("content-type") || "image/jpeg";
  const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const data = await response.arrayBuffer();

  return uploadBinaryImage(
    config,
    data,
    mimeType,
    `zerlum-generated-${Date.now()}.${extension}`
  );
}

function buildPrompt(request) {
  const composedPrompt = request.finalPrompt || request.prompt;
  const hasFixtureAnnotations =
    Array.isArray(request.annotations) &&
    request.annotations.some((annotation) => annotation?.category === "fixture");

  return [
    composedPrompt,
    `Scene type: ${request.sceneType || "architectural night rendering"}.`,
    `Lighting style: ${request.template || "professional blue hour lighting"}.`,
    request.negativePrompts?.length
      ? `Hard constraints: ${request.negativePrompts.join(", ")}.`
      : "",
    hasFixtureAnnotations
      ? "Fixture placement is provided through soft warm-white lighting previsualization in the input image, plus fixture type, range, and direction guidance. Treat the previsualization as a placement guide and refine it into subtle realistic architectural lighting. Do not render coordinate numbers, annotation numbers, labels, leader lines, arrows, dots, boxes, colored marks, UI overlays, or guide lines in the final result."
      : "",
    request.referenceImages?.length
      ? "Additional visual reference images are provided. Use them only for lighting mood, color grading, material feel, and overall render quality. Do not copy their layout or change the source architecture."
      : "",
    "Turn the uploaded daytime architectural image into a professional night lighting rendering.",
    "Preserve the original architecture, perspective, paving, trees, people, window positions, and facade structure.",
    "Only change the night ambience, exterior lighting, interior glow, light beams, contrast, and atmosphere.",
    "Lighting must stay aligned to the guided fixture positions, but keep the effect restrained and architectural. Avoid stage spotlights, oversized volumetric light columns, harsh beams, and overexposed hotspots. Do not invent strong spotlights or large light beams in unannotated areas.",
    "Annotation colors are identifiers for fixture type and position only. Do not use annotation colors as emitted light colors or color temperature. Default all fixtures to 3000K warm white unless the user's prompt explicitly specifies another color temperature.",
    "最终画面保持通透、明亮、蓝调干净，避免发灰、发暗、脏色、低饱和和阴影糊成一片。"
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

function toUpscaleValue(size) {
  const normalized = String(size || "4K").toUpperCase();

  if (normalized === "8K") {
    return 5;
  }

  if (normalized === "6K") {
    return 4;
  }

  if (normalized === "4K") {
    return 3;
  }

  return 2;
}

function getWorkflowIdFromEndpoint(endpoint) {
  const match = /\/run\/workflow\/([^/?#]+)/u.exec(String(endpoint || ""));
  return match?.[1] || "";
}

function getWorkflowCreateUrl(config, endpoint) {
  const workflowId = getWorkflowIdFromEndpoint(endpoint);

  return {
    workflowId,
    url: workflowId ? `${config.baseUrl}/task/openapi/create` : buildUrl(config, endpoint)
  };
}

function parseMaybeJson(value) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function collectWorkflowNodes(value, nodes = [], parentKey = "") {
  if (!value || typeof value !== "object") {
    return nodes;
  }

  if (value.inputs && typeof value.inputs === "object") {
    nodes.push({
      id: String(value.id || parentKey),
      title: String(value._meta?.title || value.title || value.name || ""),
      classType: String(value.class_type || value.classType || ""),
      inputNames: Object.keys(value.inputs)
    });
  }

  for (const [key, child] of Object.entries(value)) {
    if (child && typeof child === "object") {
      collectWorkflowNodes(child, nodes, key);
    }
  }

  return nodes;
}

async function resolveUpscaleNodeIds(config, workflowId) {
  if (!workflowId) {
    return {};
  }

  if (cachedUpscaleNodeIds) {
    return cachedUpscaleNodeIds;
  }

  try {
    const payload = await fetchJson(`${config.baseUrl}/api/openapi/getJsonApiFormat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        apiKey: config.token,
        workflowId
      })
    });
    const data = parseMaybeJson(payload?.data);
    const workflow = parseMaybeJson(data?.prompt || data?.workflow || data);
    const nodes = collectWorkflowNodes(workflow);
    const loadImageNode =
      nodes.find((node) =>
        /load\s*image|loadimage|加载图片|图片加载/iu.test(
          `${node.title} ${node.classType}`
        )
      ) || nodes.find((node) => node.inputNames.includes("image"));
    const valueNode =
      nodes.find((node) => /^value$/iu.test(node.title)) ||
      nodes.find((node) => node.inputNames.includes("value"));

    cachedUpscaleNodeIds = {
      loadImageNodeId: loadImageNode?.id,
      valueNodeId: valueNode?.id
    };
  } catch {
    cachedUpscaleNodeIds = {};
  }

  return cachedUpscaleNodeIds;
}

function getTaskId(payload) {
  const candidates = [
    payload?.taskId,
    payload?.task_id,
    payload?.taskID,
    payload?.id,
    payload?.data?.taskId,
    payload?.data?.task_id,
    payload?.data?.taskID,
    payload?.data?.id,
    payload?.result?.taskId,
    payload?.result?.task_id,
    payload?.results?.taskId,
    payload?.results?.task_id
  ];

  const value = candidates.find(
    (candidate) =>
      (typeof candidate === "string" && candidate.length > 0) ||
      typeof candidate === "number"
  );

  return value === undefined || value === null ? undefined : String(value);
}

function stringifyCompact(value) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getApiErrorMessage(payload) {
  return [
    payload?.errorMessage,
    payload?.error,
    payload?.message,
    payload?.msg,
    payload?.failedReason?.message,
    payload?.failedReason?.errorMessage,
    stringifyCompact(payload?.failedReason),
    payload?.data?.errorMessage,
    payload?.data?.error,
    payload?.data?.message,
    payload?.data?.msg
  ].find((value) => typeof value === "string" && value.trim().length > 0);
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
    payload?.data?.fileUrl,
    payload?.data?.outputUrl,
    payload?.data?.outputs?.[0]?.url,
    payload?.data?.outputs?.[0]?.fileUrl,
    payload?.data?.images?.[0]?.url,
    payload?.data?.result?.[0]?.url,
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

function isRetryableModelError(error) {
  const message = error instanceof Error ? error.message : String(error || "");

  return /busy|负载|retry later|稍后重试|timeout|timed out/i.test(message);
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
      body: JSON.stringify({ apiKey: config.token, taskId })
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
  const cleanImageUrl = request.sourceImage?.dataUrl;
  const isBananaEngine = request.renderEngine === "banana";
  const imageEndpoint =
    isBananaEngine
      ? config.bananaImageEndpoint
      : config.imageEndpoint;

  if (!cleanImageUrl) {
    throw new Error("sourceImage.dataUrl is required.");
  }

  // The rhart edit endpoint accepts data URLs directly. Keep media upload as a
  // fallback only for providers that reject inline images.
  async function uploadFallbackReferences() {
    const sourceImage = await uploadSourceImage(config, request.sourceImage);
    return sourceImage.downloadUrl;
  }

  // Keep the marked annotation image out of the primary edit input. The model
  // should edit the clean source only; fixture marks are converted into prompt
  // instructions so colored guide graphics do not appear in the generated image.
  const imageUrl = cleanImageUrl;

  if (!imageUrl) {
    throw new Error("RunningHub source image is empty.");
  }

  const prompt = buildPrompt(request);
  function buildTaskBody(inputImageUrl) {
    return {
      prompt,
      ...(isBananaEngine
        ? { imageUrls: [inputImageUrl] }
        : { imageUrl: inputImageUrl }),
      aspectRatio: isBananaEngine ? "16:9" : "auto",
      resolution: toRunningHubResolution(request.output?.size),
      numImages: "1",
      outputFormat: "jpeg"
    };
  }

  const baseTaskBody = buildTaskBody(imageUrl);
  const requestOptions = {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(baseTaskBody)
  };
  let taskPayload;

  try {
    taskPayload = await fetchJson(buildUrl(config, imageEndpoint), requestOptions);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (/failed to parse request body|parse request body|request body/i.test(message)) {
      taskPayload = await fetchJson(buildUrl(config, imageEndpoint), {
        ...requestOptions,
        body: JSON.stringify(buildTaskBody(cleanImageUrl))
      });
    } else if (!/imageUrl|url|image|base64|data/i.test(message)) {
      throw error;
    } else {
      const uploadedCleanImageUrl = await uploadFallbackReferences();
      const fallbackTaskBody = buildTaskBody(uploadedCleanImageUrl);

      taskPayload = await fetchJson(buildUrl(config, imageEndpoint), {
        ...requestOptions,
        body: JSON.stringify(fallbackTaskBody)
      });
    }
  }

  const directResultUrl = getResultUrl(taskPayload);
  if (directResultUrl) {
    return directResultUrl;
  }

  const taskId = getTaskId(taskPayload);
  if (!taskId) {
    throw new Error(
      getApiErrorMessage(taskPayload) ||
        `RunningHub task response did not include taskId. Response keys: ${Object.keys(
          taskPayload || {}
        ).join(", ")}`
    );
  }

  return pollRunningHubResult(config, taskId);
}

async function generateWithRunningHubRetry(config, request) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await generateWithRunningHub(config, request);
    } catch (error) {
      lastError = error;

      if (!isRetryableModelError(error) || attempt === maxAttempts) {
        break;
      }

      await wait(3000 * attempt);
    }
  }

  throw lastError || new Error("Night render API failed.");
}

async function upscaleWithRunningHub(config, request, imageUrl) {
  const shouldUpscale =
    request?.upscale?.enabled &&
    request?.upscale?.targetSize &&
    config.upscaleEndpoint;

  if (!shouldUpscale) {
    return {
      imageUrl,
      applied: false
    };
  }

  const prompt = request.finalPrompt || buildPrompt(request);
  let workflowImage;

  try {
    workflowImage = await uploadImageUrlForWorkflow(config, imageUrl);
  } catch {
    workflowImage = {
      fileName: imageUrl,
      downloadUrl: imageUrl
    };
  }

  const workflowImageValue = workflowImage.fileName || workflowImage.downloadUrl || imageUrl;
  const workflowTarget = getWorkflowCreateUrl(config, config.upscaleEndpoint);
  const workflowId = workflowTarget.workflowId;
  const workflowNodeIds = await resolveUpscaleNodeIds(config, workflowId);
  const upscaleValue = toUpscaleValue(request.upscale.targetSize);
  const loadImageNode = {
    nodeId:
      config.upscaleLoadImageNodeId ||
      workflowNodeIds.loadImageNodeId ||
      "Load Image",
    nodeName: "Load Image",
    fieldName: "image",
    fieldValue: workflowImageValue
  };
  const valueNode = {
    nodeId:
      config.upscaleValueNodeId ||
      workflowNodeIds.valueNodeId ||
      "value",
    nodeName: "value",
    fieldName: "value",
    fieldValue: upscaleValue
  };
  const upscalePayload = await fetchJson(workflowTarget.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      apiKey: config.token,
      workflowId,
      imageUrl,
      imageFileName: workflowImage.fileName,
      prompt,
      value: upscaleValue,
      resolution: toUpscaleResolution(request.upscale.targetSize),
      outputFormat: "jpeg",
      nodeInfoList: [loadImageNode, valueNode],
      inputs: {
        image: workflowImageValue,
        value: upscaleValue
      }
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
    throw new Error(
      getApiErrorMessage(upscalePayload) ||
        `RunningHub upscale response did not include taskId. Response keys: ${Object.keys(
          upscalePayload || {}
        ).join(", ")}`
    );
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

    const generatedImageUrl = await generateWithRunningHubRetry(config, body);
    let upscaleResult = {
      imageUrl: generatedImageUrl,
      applied: false,
      warning: ""
    };

    try {
      upscaleResult = {
        ...(await upscaleWithRunningHub(config, body, generatedImageUrl)),
        warning: ""
      };
    } catch (upscaleError) {
      upscaleResult.warning =
        upscaleError instanceof Error
          ? `放大工作流失败，已返回原始 API 生图：${upscaleError.message}`
          : "放大工作流失败，已返回原始 API 生图。";
    }

    response.status(200).json({
      status: "completed",
      provider: "api",
      resultImageUrl: upscaleResult.imageUrl,
      upscaleApplied: upscaleResult.applied,
      warning: upscaleResult.warning,
      versionId: `rh-${Date.now()}`
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Night render API failed.";

    response.status(502).json({
      status: "failed",
      error: isRetryableModelError(error)
        ? `模型服务当前繁忙，请稍后重试。${message}`
        : message
    });
  }
};
