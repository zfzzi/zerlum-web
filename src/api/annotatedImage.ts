import { fixtureColorMap } from "../data";
import type {
  CanvasAnnotationSnapshot,
  CanvasGenerationContext
} from "../types/nightRender";

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("标注参考图加载失败，请重新上传主图。"));
    image.src = source;
  });
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

function getFixtureColor(fixture: string) {
  return fixtureColorMap[fixture] ?? "#A78BFA";
}

function drawLabel(
  context: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
  width: number,
  height: number
) {
  const fontSize = Math.max(14, Math.round(Math.min(width, height) * 0.018));
  context.font = `700 ${fontSize}px Arial, sans-serif`;
  const paddingX = Math.round(fontSize * 0.62);
  const paddingY = Math.round(fontSize * 0.42);
  const textWidth = context.measureText(label).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const boxX = Math.min(Math.max(8, x), width - boxWidth - 8);
  const boxY = Math.min(Math.max(8, y - boxHeight - 8), height - boxHeight - 8);

  context.save();
  context.fillStyle = "rgba(5, 3, 16, 0.82)";
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(boxX, boxY, boxWidth, boxHeight, 8);
  context.fill();
  context.stroke();
  context.fillStyle = "#ffffff";
  context.fillText(label, boxX + paddingX, boxY + paddingY + fontSize * 0.78);
  context.restore();
}

function drawArrowHead(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  size: number
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  context.save();
  context.fillStyle = color;
  context.translate(to.x, to.y);
  context.rotate(angle);
  context.beginPath();
  context.moveTo(0, 0);
  context.lineTo(-size, size * 0.46);
  context.lineTo(-size, -size * 0.46);
  context.closePath();
  context.fill();
  context.restore();
}

function drawFixtureAnnotation(
  context: CanvasRenderingContext2D,
  annotation: CanvasAnnotationSnapshot,
  viewBox: CanvasGenerationContext["viewBox"],
  width: number,
  height: number
) {
  if (annotation.type === "area") {
    return;
  }

  const color = getFixtureColor(annotation.fixture);
  const strokeWidth = Math.max(4, Math.round(Math.min(width, height) * 0.008));

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.shadowColor = color;
  context.shadowBlur = Math.max(8, strokeWidth * 2);

  if (annotation.type === "fixtureLine") {
    const start = scalePoint(
      { x: annotation.x1, y: annotation.y1 },
      viewBox,
      width,
      height
    );
    const end = scalePoint(
      { x: annotation.x2, y: annotation.y2 },
      viewBox,
      width,
      height
    );
    context.lineWidth = annotation.kind === "wash" ? strokeWidth * 1.35 : strokeWidth;
    context.setLineDash(annotation.kind === "wash" ? [strokeWidth * 3, strokeWidth * 1.6] : []);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.setLineDash([]);
    drawLabel(context, annotation.label, start.x + 10, start.y - 8, color, width, height);
  }

  if (annotation.type === "fixtureDirection") {
    const start = scalePoint({ x: annotation.x, y: annotation.y }, viewBox, width, height);
    const end = scalePoint(
      { x: annotation.targetX, y: annotation.targetY },
      viewBox,
      width,
      height
    );
    context.lineWidth = strokeWidth;
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    drawArrowHead(context, start, end, color, strokeWidth * 4.2);
    context.beginPath();
    context.arc(start.x, start.y, strokeWidth * 2.4, 0, Math.PI * 2);
    context.fill();
    drawLabel(context, annotation.label, start.x + 14, start.y - 12, color, width, height);
  }

  if (annotation.type === "fixturePoint") {
    const point = scalePoint({ x: annotation.x, y: annotation.y }, viewBox, width, height);
    context.beginPath();
    context.arc(point.x, point.y, strokeWidth * 2.5, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = Math.max(2, strokeWidth * 0.5);
    context.strokeStyle = "#ffffff";
    context.stroke();
    drawLabel(context, annotation.label, point.x + 14, point.y - 12, color, width, height);
  }

  if (annotation.type === "fixtureArea") {
    const origin = scalePoint({ x: annotation.x, y: annotation.y }, viewBox, width, height);
    const rectWidth = (annotation.width / viewBox.width) * width;
    const rectHeight = (annotation.height / viewBox.height) * height;
    context.lineWidth = strokeWidth;
    context.fillStyle = `${color}2d`;
    context.strokeStyle = color;
    context.beginPath();
    context.roundRect(origin.x, origin.y, rectWidth, rectHeight, strokeWidth * 1.8);
    context.fill();
    context.stroke();
    drawLabel(context, annotation.label, origin.x + 10, origin.y - 8, color, width, height);
  }

  context.restore();
}

export async function createAnnotatedFixtureReferenceImage(
  sourceImageUrl: string,
  canvas: CanvasGenerationContext
) {
  const image = await loadImage(sourceImageUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const outputCanvas = document.createElement("canvas");
  const context = outputCanvas.getContext("2d");

  if (!context) {
    throw new Error("浏览器不支持生成标注参考图。");
  }

  outputCanvas.width = width;
  outputCanvas.height = height;
  context.drawImage(image, 0, 0, width, height);

  for (const annotation of canvas.annotations) {
    drawFixtureAnnotation(context, annotation, canvas.viewBox, width, height);
  }

  return outputCanvas.toDataURL("image/jpeg", 0.9);
}
