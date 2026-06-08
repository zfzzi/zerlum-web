interface ResizeImageOptions {
  maxSide?: number;
  mimeType?: "image/jpeg" | "image/png" | "image/webp";
  quality?: number;
}

function loadImageDataUrl(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片处理失败，请重新上传图片。"));
    image.src = dataUrl;
  });
}

export async function resizeImageDataUrl(
  dataUrl: string,
  {
    maxSide = 1800,
    mimeType = "image/jpeg",
    quality = 0.88
  }: ResizeImageOptions = {}
) {
  const image = await loadImageDataUrl(dataUrl);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("浏览器不支持图片压缩处理。");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#05040b";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL(mimeType, quality);
}
