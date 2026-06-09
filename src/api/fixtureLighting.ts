import type {
  CanvasAnnotationSnapshot,
  CanvasGenerationContext
} from "../types/nightRender";

function isFixtureAnnotation(annotation: CanvasAnnotationSnapshot) {
  return (
    annotation.type === "fixtureLine" ||
    annotation.type === "fixtureDirection" ||
    annotation.type === "fixturePoint" ||
    annotation.type === "fixtureArea"
  );
}

export function hasFixtureLightingAnnotations(canvas: CanvasGenerationContext) {
  return canvas.annotations.some(isFixtureAnnotation);
}

function kelvinToRgb(kelvin: number) {
  const temperature = Math.min(7500, Math.max(2000, kelvin)) / 100;
  let red = 255;
  let green = 255;
  let blue = 255;

  if (temperature <= 66) {
    red = 255;
    green = 99.4708025861 * Math.log(temperature) - 161.1195681661;
    blue =
      temperature <= 19
        ? 0
        : 138.5177312231 * Math.log(temperature - 10) - 305.0447927307;
  } else {
    red = 329.698727446 * (temperature - 60) ** -0.1332047592;
    green = 288.1221695283 * (temperature - 60) ** -0.0755148492;
    blue = 255;
  }

  return {
    red: Math.round(Math.min(255, Math.max(0, red))),
    green: Math.round(Math.min(255, Math.max(0, green))),
    blue: Math.round(Math.min(255, Math.max(0, blue)))
  };
}

function rgba(colorTemperature: number, alpha: number) {
  const color = kelvinToRgb(colorTemperature);
  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (!source.startsWith("data:") && !source.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("灯光位置校准图片加载失败。"));
    image.src = source;
  });
}

async function makeLoadableSource(source: string) {
  if (source.startsWith("data:") || source.startsWith("blob:")) {
    return {
      source,
      revoke: () => undefined
    };
  }

  try {
    const response = await fetch(source, { mode: "cors" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    return {
      source: objectUrl,
      revoke: () => URL.revokeObjectURL(objectUrl)
    };
  } catch {
    return {
      source,
      revoke: () => undefined
    };
  }
}

function scalePoint(
  point: { x: number; y: number },
  viewBox: CanvasGenerationContext["viewBox"],
  width: number,
  height: number
) {
  return {
    x: (point.x / viewBox.width) * width,
    y: (point.y / viewBox.height) * height
  };
}

function drawRadialGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  colorTemperature: number,
  strength: number
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, rgba(colorTemperature, 0.42 * strength));
  gradient.addColorStop(0.36, rgba(colorTemperature, 0.16 * strength));
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = gradient;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function expandRectWithinCanvas(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
  ratio: number
) {
  const padX = Math.max(8, width * ratio);
  const padY = Math.max(8, height * ratio);
  const nextX = Math.max(0, x - padX);
  const nextY = Math.max(0, y - padY);
  const nextRight = Math.min(canvasWidth, x + width + padX);
  const nextBottom = Math.min(canvasHeight, y + height + padY);

  return {
    x: nextX,
    y: nextY,
    width: nextRight - nextX,
    height: nextBottom - nextY
  };
}

function drawSoftLine(
  context: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  colorTemperature: number,
  strength: number,
  width: number
) {
  context.save();
  context.globalCompositeOperation = "lighter";
  context.lineCap = "round";
  context.lineJoin = "round";

  for (const pass of [
    { alpha: 0.026, width: width * 7.2 },
    { alpha: 0.064, width: width * 3.8 },
    { alpha: 0.15, width: width * 1.22 }
  ]) {
    context.strokeStyle = rgba(colorTemperature, pass.alpha * strength);
    context.lineWidth = pass.width;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.restore();
}

function drawBeam(
  context: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  target: { x: number; y: number },
  colorTemperature: number,
  strength: number
) {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const startWidth = Math.max(5, length * 0.012);
  const endWidth = Math.max(18, length * 0.052);
  const gradient = context.createLinearGradient(origin.x, origin.y, target.x, target.y);

  gradient.addColorStop(0, rgba(colorTemperature, 0.14 * strength));
  gradient.addColorStop(0.38, rgba(colorTemperature, 0.06 * strength));
  gradient.addColorStop(1, "rgba(255, 255, 255, 0)");

  context.save();
  context.globalCompositeOperation = "lighter";
  context.fillStyle = gradient;
  context.beginPath();
  context.moveTo(origin.x + nx * startWidth, origin.y + ny * startWidth);
  context.lineTo(origin.x - nx * startWidth, origin.y - ny * startWidth);
  context.lineTo(target.x - nx * endWidth, target.y - ny * endWidth);
  context.lineTo(target.x + nx * endWidth, target.y + ny * endWidth);
  context.closePath();
  context.fill();
  drawSoftLine(context, origin, target, colorTemperature, strength * 0.38, startWidth);
  drawRadialGlow(
    context,
    origin.x,
    origin.y,
    Math.max(20, length * 0.05),
    colorTemperature,
    strength * 0.58
  );
  context.restore();
}

function drawAreaGlow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colorTemperature: number,
  strength: number
) {
  context.save();
  context.globalCompositeOperation = "lighter";
  context.shadowColor = rgba(colorTemperature, 0.36 * strength);
  context.shadowBlur = Math.max(10, Math.min(width, height) * 0.18);
  context.fillStyle = rgba(colorTemperature, 0.14 * strength);
  context.fillRect(x, y, width, height);
  context.shadowBlur = 0;
  context.strokeStyle = rgba(colorTemperature, 0.18 * strength);
  context.lineWidth = Math.max(2, Math.min(width, height) * 0.018);
  context.strokeRect(x, y, width, height);
  context.restore();
}

function drawFixtureLighting(
  context: CanvasRenderingContext2D,
  annotation: CanvasAnnotationSnapshot,
  viewBox: CanvasGenerationContext["viewBox"],
  width: number,
  height: number,
  colorTemperature: number,
  strength: number
) {
  if (!isFixtureAnnotation(annotation)) {
    return;
  }

  if (annotation.type === "fixtureLine") {
    const start = scalePoint({ x: annotation.x1, y: annotation.y1 }, viewBox, width, height);
    const end = scalePoint({ x: annotation.x2, y: annotation.y2 }, viewBox, width, height);
    const lineWidth =
      annotation.kind === "wash"
        ? Math.max(7, Math.min(width, height) * 0.012)
        : Math.max(4, Math.min(width, height) * 0.0075);
    drawSoftLine(context, start, end, colorTemperature, strength, lineWidth);

    if (annotation.kind === "wash") {
      drawRadialGlow(
        context,
        (start.x + end.x) / 2,
        (start.y + end.y) / 2,
        Math.max(48, Math.hypot(end.x - start.x, end.y - start.y) * 0.2),
        colorTemperature,
        strength * 0.26
      );
    }
  }

  if (annotation.type === "fixtureDirection") {
    const origin = scalePoint({ x: annotation.x, y: annotation.y }, viewBox, width, height);
    const target = scalePoint(
      { x: annotation.targetX, y: annotation.targetY },
      viewBox,
      width,
      height
    );
    drawBeam(context, origin, target, colorTemperature, strength);
  }

  if (annotation.type === "fixturePoint") {
    const point = scalePoint({ x: annotation.x, y: annotation.y }, viewBox, width, height);
    drawRadialGlow(
      context,
      point.x,
      point.y,
      Math.max(22, Math.min(width, height) * 0.04),
      colorTemperature,
      strength * 0.86
    );
  }

  if (annotation.type === "fixtureArea") {
    const origin = scalePoint({ x: annotation.x, y: annotation.y }, viewBox, width, height);
    const expandedRect = expandRectWithinCanvas(
      origin.x,
      origin.y,
      (annotation.width / viewBox.width) * width,
      (annotation.height / viewBox.height) * height,
      width,
      height,
      0.12
    );
    drawAreaGlow(
      context,
      expandedRect.x,
      expandedRect.y,
      expandedRect.width,
      expandedRect.height,
      colorTemperature,
      strength * 0.9
    );
  }
}

async function drawFixtureLightingImage(
  imageUrl: string,
  canvas: CanvasGenerationContext,
  colorTemperature: number,
  strength: number,
  mimeType: "image/jpeg" | "image/png",
  quality = 0.92
) {
  if (!hasFixtureLightingAnnotations(canvas)) {
    return imageUrl;
  }

  const loadable = await makeLoadableSource(imageUrl);

  try {
    const image = await loadImage(loadable.source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    const outputCanvas = document.createElement("canvas");
    const context = outputCanvas.getContext("2d");

    if (!context) {
      throw new Error("浏览器不支持灯位校准。");
    }

    outputCanvas.width = width;
    outputCanvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    for (const annotation of canvas.annotations) {
      drawFixtureLighting(
        context,
        annotation,
        canvas.viewBox,
        width,
        height,
        colorTemperature,
        strength
      );
    }

    return outputCanvas.toDataURL(mimeType, quality);
  } finally {
    loadable.revoke();
  }
}

export function createFixtureLightingGuideImage(
  sourceImageUrl: string,
  canvas: CanvasGenerationContext,
  colorTemperature: number
) {
  return drawFixtureLightingImage(
    sourceImageUrl,
    canvas,
    colorTemperature,
    0.34,
    "image/jpeg",
    0.9
  );
}

export function applyFixtureLightingToResult(
  resultImageUrl: string,
  canvas: CanvasGenerationContext,
  colorTemperature: number
) {
  return drawFixtureLightingImage(
    resultImageUrl,
    canvas,
    colorTemperature,
    0.18,
    "image/png",
    0.92
  );
}
