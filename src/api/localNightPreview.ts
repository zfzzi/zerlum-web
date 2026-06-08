import type {
  ExportRequest,
  LightingMoodTemplate,
  SceneType
} from "../types/nightRender";

interface LocalNightPreviewOptions {
  fixture: string;
  outputSize: ExportRequest["type"];
  prompt: string;
  sceneType: SceneType;
  template: LightingMoodTemplate;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("本地预览图片加载失败。"));
    image.src = source;
  });
}

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function makeRandom(seed: number) {
  let state = seed || 1;

  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return ((state >>> 0) % 10000) / 10000;
  };
}

function drawGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
  alpha: number
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.35, color.replace(/[\d.]+\)$/u, `${alpha * 0.45})`));
  gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

export async function createLocalNightPreview(
  sourceImageUrl: string,
  options: LocalNightPreviewOptions
) {
  const image = await loadImage(sourceImageUrl);
  const maxSide = options.outputSize === "2K" ? 1600 : 2200;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("浏览器不支持 Canvas 预览。");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  context.globalCompositeOperation = "multiply";
  const dusk = context.createLinearGradient(0, 0, width, height);
  dusk.addColorStop(0, "rgba(3, 8, 24, 0.8)");
  dusk.addColorStop(0.44, "rgba(5, 18, 42, 0.62)");
  dusk.addColorStop(1, "rgba(0, 0, 0, 0.76)");
  context.fillStyle = dusk;
  context.fillRect(0, 0, width, height);

  context.globalCompositeOperation = "screen";
  const seed = hashText(
    `${options.prompt}|${options.sceneType}|${options.template}|${options.fixture}`
  );
  const random = makeRandom(seed);
  const coldColor = options.template.includes("暖")
    ? "rgba(95, 180, 255, 0.52)"
    : "rgba(72, 145, 255, 0.62)";
  const warmColor = options.template.includes("冷")
    ? "rgba(255, 214, 128, 0.42)"
    : "rgba(255, 196, 92, 0.7)";

  drawGlow(context, width * 0.5, height * 0.82, width * 0.5, coldColor, 0.62);
  drawGlow(context, width * 0.2, height * 0.92, width * 0.34, warmColor, 0.58);
  drawGlow(context, width * 0.82, height * 0.64, width * 0.26, warmColor, 0.42);

  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";

  for (let index = 0; index < 12; index += 1) {
    const x = width * (0.1 + random() * 0.8);
    const y = height * (0.36 + random() * 0.46);
    const lineLength = width * (0.06 + random() * 0.16);
    const angle = (random() - 0.5) * 0.85;
    const gradient = context.createLinearGradient(
      x,
      y,
      x + Math.cos(angle) * lineLength,
      y + Math.sin(angle) * lineLength
    );
    gradient.addColorStop(0, "rgba(255, 245, 210, 0)");
    gradient.addColorStop(0.35, "rgba(255, 228, 154, 0.46)");
    gradient.addColorStop(1, "rgba(98, 210, 255, 0)");
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(2, width * (0.002 + random() * 0.004));
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(
      x + Math.cos(angle) * lineLength,
      y + Math.sin(angle) * lineLength
    );
    context.stroke();
  }

  const windowCount = 30 + Math.round(random() * 28);
  for (let index = 0; index < windowCount; index += 1) {
    const x = width * (0.12 + random() * 0.76);
    const y = height * (0.18 + random() * 0.55);
    const w = Math.max(3, width * (0.004 + random() * 0.01));
    const h = Math.max(4, height * (0.006 + random() * 0.018));
    context.fillStyle =
      random() > 0.34 ? "rgba(255, 219, 138, 0.45)" : "rgba(104, 196, 255, 0.32)";
    context.shadowColor = context.fillStyle;
    context.shadowBlur = Math.max(6, width * 0.006);
    context.fillRect(x, y, w, h);
  }

  context.shadowBlur = 0;
  context.globalCompositeOperation = "source-over";
  const vignette = context.createRadialGradient(
    width * 0.5,
    height * 0.5,
    width * 0.12,
    width * 0.5,
    height * 0.5,
    width * 0.74
  );
  vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
  vignette.addColorStop(1, "rgba(0, 0, 0, 0.42)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);

  return canvas.toDataURL("image/png", 0.92);
}
