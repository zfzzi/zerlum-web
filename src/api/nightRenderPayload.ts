import type {
  CanvasAnnotationSnapshot,
  CanvasGenerationContext,
  CanvasTool,
  ExportRequest,
  LightingMoodTemplate,
  NightRenderTimeRange,
  SceneType,
  StyleReference
} from "../types/nightRender";
import { fixtureColorMap } from "../data";

export interface NightRenderPayloadInput {
  projectId: string;
  imageFile: File;
  sceneType: SceneType;
  template: LightingMoodTemplate;
  styleReference: StyleReference;
  canvas: CanvasGenerationContext;
  prompt: string;
  negativePrompts: string[];
  outputSize: ExportRequest["type"];
}

export interface ApiPoint {
  x: number;
  y: number;
}

export interface ApiFixtureAnnotation {
  id: string;
  label: string;
  category: "fixture" | "edit";
  type: "point" | "line" | "direction" | "area";
  fixtureType?: string;
  color: string;
  placementDescription?: string;
  influenceDescription?: string;
  size: {
    radius?: number;
    width?: number;
    height?: number;
    length?: number;
    strokeWidth?: number;
  };
  coordinates: {
    point?: ApiPoint;
    points?: ApiPoint[];
    rect?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  guide?: {
    points: ApiPoint[];
    normalizedPoints: ApiPoint[];
  };
  normalizedCoordinates: unknown;
}

export interface NightRenderApiPayload {
  projectId: string;
  sourceImage: {
    name: string;
    type: string;
    size: number;
  };
  sceneType: SceneType;
  template: LightingMoodTemplate;
  timeRange: NightRenderTimeRange;
  prompt: string;
  finalPrompt: string;
  negativePrompts: string[];
  preserveConstraints: string[];
  annotations: ApiFixtureAnnotation[];
  output: {
    resolution: ExportRequest["type"];
    size: string;
    ratio: "自动适配";
    format: "PNG";
  };
  styleReference: {
    id: string;
    title: string;
    template: LightingMoodTemplate;
  };
  tools: {
    active: CanvasTool;
    enabled: CanvasTool[];
  };
}

const preserveConstraints = [
  "不改变建筑结构",
  "不改变原图视角",
  "不改变透视关系",
  "不改变树木",
  "不改变地砖和地面铺装",
  "不改变人物",
  "不改变窗户位置",
  "不增加多余建筑构件"
];

const outputSizeMap: Record<ExportRequest["type"], string> = {
  "2K": "2048x1152",
  "4K": "3840x2160",
  "6K": "6144x3456",
  "8K": "7680x4320",
  汇报版式: "1920x1080",
  对比图: "3840x2160"
};

const canvasToolPrompts: Record<CanvasTool, string> = {
  查看: "当前未启用标注工具，画布上的已有标注仍参与生成。",
  局部重绘: "局部重绘区域只允许调整灯光、亮度、氛围和内透，不改变原始结构。",
  遮罩选择: "遮罩选择区域是重点生成区域，需要优先响应用户的灯光和氛围要求。",
  标注灯位: "标注灯位表示灯具安装位置、范围和照射方向，生成时必须按对应灯具类型呈现光效。",
  禁止修改: "禁止修改区域必须保持原图内容不变，不替换材质、不移动元素、不改变形体。"
};

const fixtureColorLegend = Object.entries(fixtureColorMap)
  .map(([fixture, color]) => `${fixture}=${color}`)
  .join("，");

const colorTemperatureRule =
  "色温规则：标注颜色仅用于区分灯具类型和标注位置，不代表灯光颜色或色温；除非用户提示词明确写出色温数值，否则所有灯具默认使用 3000K 暖白光。";

const areaKindPrompts: Record<"repaint" | "mask" | "avoid", string> = {
  repaint: "局部重绘",
  mask: "遮罩选择",
  avoid: "禁止修改"
};

const editColorMap: Record<string, string> = {
  repaint: "#FACC15",
  mask: "#22D3EE",
  avoid: "#A855F7"
};

function isFiniteNumber(value: unknown): value is number {
  return Number.isFinite(value);
}

function roundCoordinate(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizePoint(point: ApiPoint, width: number, height: number) {
  return {
    x: roundCoordinate(point.x / width),
    y: roundCoordinate(point.y / height)
  };
}

function getChineseOrdinal(index: number) {
  const ordinals = [
    "第一处",
    "第二处",
    "第三处",
    "第四处",
    "第五处",
    "第六处",
    "第七处",
    "第八处",
    "第九处",
    "第十处",
    "第十一处",
    "第十二处"
  ];

  return ordinals[index] ?? "另一处";
}

function getHorizontalPhrase(x: number, width: number) {
  const ratio = x / width;

  if (ratio <= 0.04) {
    return "最左边缘";
  }

  if (ratio >= 0.96) {
    return "最右边缘";
  }

  if (ratio < 0.22) {
    return "左侧";
  }

  if (ratio < 0.42) {
    return "中左";
  }

  if (ratio < 0.58) {
    return "中央";
  }

  if (ratio < 0.78) {
    return "中右";
  }

  return "右侧";
}

function getVerticalPhrase(y: number, height: number) {
  const ratio = y / height;

  if (ratio <= 0.05) {
    return "顶部边缘";
  }

  if (ratio >= 0.95) {
    return "底部边缘";
  }

  if (ratio < 0.24) {
    return "上部";
  }

  if (ratio < 0.44) {
    return "中上部";
  }

  if (ratio < 0.62) {
    return "中部";
  }

  if (ratio < 0.82) {
    return "中下部";
  }

  return "下部";
}

function describePointPosition(
  point: ApiPoint,
  viewBox: CanvasGenerationContext["viewBox"]
) {
  return `${getHorizontalPhrase(point.x, viewBox.width)}${getVerticalPhrase(
    point.y,
    viewBox.height
  )}`;
}

function describeDirection(start: ApiPoint, end: ApiPoint) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const horizontal =
    Math.abs(deltaX) < 16 ? "" : deltaX > 0 ? "右" : "左";
  const vertical =
    Math.abs(deltaY) < 16 ? "" : deltaY > 0 ? "下" : "上";

  return horizontal || vertical ? `照向${horizontal}${vertical}方` : "围绕点位柔和扩散";
}

function describeLinePlacement(
  points: ApiPoint[],
  viewBox: CanvasGenerationContext["viewBox"]
) {
  const [start, end] = points;
  const lengthRatio =
    Math.hypot(end.x - start.x, end.y - start.y) /
    Math.hypot(viewBox.width, viewBox.height);
  const span = lengthRatio > 0.42 ? "长距离" : lengthRatio > 0.2 ? "中等距离" : "短距离";

  return `${span}线性范围，从${describePointPosition(
    start,
    viewBox
  )}延伸到${describePointPosition(end, viewBox)}`;
}

function describeAreaPlacement(
  rect: { x: number; y: number; width: number; height: number },
  viewBox: CanvasGenerationContext["viewBox"]
) {
  const center = {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
  const areaRatio = (rect.width * rect.height) / (viewBox.width * viewBox.height);
  const size = areaRatio > 0.16 ? "大范围" : areaRatio > 0.05 ? "中等范围" : "小范围";

  return `${size}矩形区域，中心位于${describePointPosition(center, viewBox)}`;
}

function getLineLength(points: ApiPoint[]) {
  if (points.length < 2) {
    return 0;
  }

  return Math.round(Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y));
}

function getLineInfluence(annotation: Extract<CanvasAnnotationSnapshot, { type: "fixtureLine" }>) {
  if (annotation.kind === "wash") {
    return "洗墙灯按整段墙面形成连续、柔和、较宽的洗亮范围";
  }

  if (annotation.kind === "dot") {
    return "点光源按拖拽路径形成一串独立小圆点发光，不连成实线";
  }

  if (annotation.kind === "pixel") {
    return "像素灯按拖拽路径形成间隔更密的像素点阵发光，颜色和点光源区分，不连成连续线";
  }

  return "线性灯按整段线条形成连续、清晰但不过曝的光带";
}

function getLineStrokeWidth(annotation: Extract<CanvasAnnotationSnapshot, { type: "fixtureLine" }>) {
  if (annotation.kind === "wash") {
    return 9;
  }

  if (annotation.kind === "dot" || annotation.kind === "pixel") {
    return 6;
  }

  return 7;
}

function buildLineAnnotation(
  annotation: Extract<CanvasAnnotationSnapshot, { type: "fixtureLine" }>,
  viewBox: CanvasGenerationContext["viewBox"]
): ApiFixtureAnnotation | null {
  const points = [
    { x: annotation.x1, y: annotation.y1 },
    { x: annotation.x2, y: annotation.y2 }
  ];

  if (!points.every((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y))) {
    return null;
  }
  const guidePoints =
    annotation.kind === "wash" &&
    isFiniteNumber(annotation.guideX1) &&
    isFiniteNumber(annotation.guideY1) &&
    isFiniteNumber(annotation.guideX2) &&
    isFiniteNumber(annotation.guideY2)
      ? [
          { x: annotation.guideX1, y: annotation.guideY1 },
          { x: annotation.guideX2, y: annotation.guideY2 }
        ]
      : undefined;
  const guideDescription = guidePoints
    ? `，洗墙方向由${describePointPosition(guidePoints[0], viewBox)}指向${describePointPosition(
        guidePoints[1],
        viewBox
      )}`
    : "";

  return {
    id: annotation.id,
    label: annotation.label,
    category: "fixture",
    type: "line",
    fixtureType: annotation.fixture,
    color: fixtureColorMap[annotation.fixture] ?? "#A78BFA",
    placementDescription: `${describeLinePlacement(points, viewBox)}${guideDescription}`,
    influenceDescription: getLineInfluence(annotation),
    size: {
      length: getLineLength(points),
      strokeWidth: getLineStrokeWidth(annotation)
    },
    coordinates: {
      points: points.map((point) => ({
        x: roundCoordinate(point.x),
        y: roundCoordinate(point.y)
      }))
    },
    guide: guidePoints
      ? {
          points: guidePoints.map((point) => ({
            x: roundCoordinate(point.x),
            y: roundCoordinate(point.y)
          })),
          normalizedPoints: guidePoints.map((point) =>
            normalizePoint(point, viewBox.width, viewBox.height)
          )
        }
      : undefined,
    normalizedCoordinates: {
      points: points.map((point) =>
        normalizePoint(point, viewBox.width, viewBox.height)
      )
    }
  };
}

function buildDirectionAnnotation(
  annotation: Extract<CanvasAnnotationSnapshot, { type: "fixtureDirection" }>,
  viewBox: CanvasGenerationContext["viewBox"]
): ApiFixtureAnnotation | null {
  const points = [
    { x: annotation.x, y: annotation.y },
    { x: annotation.targetX, y: annotation.targetY }
  ];

  if (!points.every((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y))) {
    return null;
  }

  return {
    id: annotation.id,
    label: annotation.label,
    category: "fixture",
    type: "direction",
    fixtureType: annotation.fixture,
    color: fixtureColorMap[annotation.fixture] ?? "#A78BFA",
    placementDescription: `${describePointPosition(
      points[0],
      viewBox
    )}安装点，${describeDirection(points[0], points[1])}`,
    influenceDescription:
      "按点位到照射方向形成柔和的扇形照明，范围比箭头更宽但禁止形成舞台光柱",
    size: {
      radius: 12,
      length: getLineLength(points),
      strokeWidth: 5
    },
    coordinates: {
      points: points.map((point) => ({
        x: roundCoordinate(point.x),
        y: roundCoordinate(point.y)
      }))
    },
    normalizedCoordinates: {
      origin: normalizePoint(points[0], viewBox.width, viewBox.height),
      target: normalizePoint(points[1], viewBox.width, viewBox.height)
    }
  };
}

function buildPointAnnotation(
  annotation: Extract<CanvasAnnotationSnapshot, { type: "fixturePoint" }>,
  viewBox: CanvasGenerationContext["viewBox"]
): ApiFixtureAnnotation | null {
  const point = { x: annotation.x, y: annotation.y };

  if (!isFiniteNumber(point.x) || !isFiniteNumber(point.y)) {
    return null;
  }

  return {
    id: annotation.id,
    label: annotation.label,
    category: "fixture",
    type: "point",
    fixtureType: annotation.fixture,
    color: fixtureColorMap[annotation.fixture] ?? "#A78BFA",
    placementDescription: `${describePointPosition(point, viewBox)}点位`,
    influenceDescription:
      "围绕点位形成小范围柔和发光，不带箭头，不外扩成明显光束",
    size: {
      radius: 12
    },
    coordinates: {
      point: {
        x: roundCoordinate(point.x),
        y: roundCoordinate(point.y)
      }
    },
    normalizedCoordinates: {
      point: normalizePoint(point, viewBox.width, viewBox.height)
    }
  };
}

function buildAreaAnnotation(
  annotation: Extract<CanvasAnnotationSnapshot, { type: "fixtureArea" | "area" }>,
  viewBox: CanvasGenerationContext["viewBox"]
): ApiFixtureAnnotation | null {
  if (
    ![annotation.x, annotation.y, annotation.width, annotation.height].every(isFiniteNumber) ||
    annotation.width <= 0 ||
    annotation.height <= 0
  ) {
    return null;
  }

  const isFixtureArea = annotation.type === "fixtureArea";
  const fixtureType = isFixtureArea ? annotation.fixture : undefined;
  const color = isFixtureArea
    ? fixtureColorMap[annotation.fixture] ?? "#A78BFA"
    : editColorMap[annotation.kind] ?? "#A78BFA";
  const rect = {
    x: annotation.x,
    y: annotation.y,
    width: annotation.width,
    height: annotation.height
  };

  return {
    id: annotation.id,
    label: annotation.label,
    category: isFixtureArea ? "fixture" : "edit",
    type: "area",
    fixtureType,
    color,
    placementDescription: isFixtureArea
      ? describeAreaPlacement(rect, viewBox)
      : undefined,
    influenceDescription: isFixtureArea
      ? "按框选面形成均匀发光面，边缘柔和扩散到框外一档，禁止出现彩色框线"
      : undefined,
    size: {
      width: Math.round(annotation.width),
      height: Math.round(annotation.height)
    },
    coordinates: {
      rect: {
        x: roundCoordinate(rect.x),
        y: roundCoordinate(rect.y),
        width: roundCoordinate(rect.width),
        height: roundCoordinate(rect.height)
      }
    },
    normalizedCoordinates: {
      rect: {
        x: roundCoordinate(annotation.x / viewBox.width),
        y: roundCoordinate(annotation.y / viewBox.height),
        width: roundCoordinate(annotation.width / viewBox.width),
        height: roundCoordinate(annotation.height / viewBox.height)
      }
    }
  };
}

export function buildApiAnnotations(canvas: CanvasGenerationContext) {
  return canvas.annotations.flatMap((annotation) => {
    if (annotation.type === "fixtureLine") {
      const item = buildLineAnnotation(annotation, canvas.viewBox);
      return item ? [item] : [];
    }

    if (annotation.type === "fixtureDirection") {
      const item = buildDirectionAnnotation(annotation, canvas.viewBox);
      return item ? [item] : [];
    }

    if (annotation.type === "fixturePoint") {
      const item = buildPointAnnotation(annotation, canvas.viewBox);
      return item ? [item] : [];
    }

    const item = buildAreaAnnotation(annotation, canvas.viewBox);
    return item ? [item] : [];
  });
}

function buildFixtureAnnotationInstruction(annotations: ApiFixtureAnnotation[]) {
  const fixtureAnnotations = annotations.filter(
    (annotation) => annotation.category === "fixture"
  );

  if (fixtureAnnotations.length === 0) {
    return "未添加灯具标注时，请根据建筑立面和场景参考生成克制、专业的夜景照明，不自行增加过多灯具。";
  }

  const fixtureTypes = Array.from(
    new Set(fixtureAnnotations.map((annotation) => annotation.fixtureType || "灯具"))
  );
  const placementSummary = fixtureAnnotations
    .map((annotation, index) => {
      const placement = annotation.placementDescription || "按用户标注位置";
      const influence = annotation.influenceDescription || "按标注范围柔和扩展一档";

      return `${getChineseOrdinal(index)}${annotation.fixtureType || "灯具"}：${placement}，${influence}`;
    })
    .join("；");

  return [
    `灯具类型包含：${fixtureTypes.join("、")}。`,
    `灯具位置摘要仅用于定位，禁止作为画面文字出现：${placementSummary}。`,
    "灯具位置已经通过输入主图中的暖白灯光预演效果体现，请严格按预演光的位置、范围和方向生成真实建筑照明。",
    "每个灯具标注的有效影响范围要比用户画出的点、线或框更宽一些，边缘标注也必须作用到画面最边缘的建筑或景观位置。",
    "不要在画面中绘制任何坐标数字、标注编号、引线、文字标签、箭头、框线或色点。",
    "标注识别色只用于系统区分灯具类型，不代表灯光颜色或色温。",
    "灯光表现要克制、专业、贴合建筑表皮，避免舞台探照灯、粗大光柱和过曝光束；未标注位置不要自行增加强投光。"
  ].join("");
}

function buildEditAnnotationInstruction(annotations: ApiFixtureAnnotation[]) {
  const editAnnotations = annotations.filter(
    (annotation) => annotation.category === "edit"
  );

  if (editAnnotations.length === 0) {
    return "未添加局部重绘、遮罩或禁止修改框选时，按全图整体处理。";
  }

  return editAnnotations
    .map((annotation) => {
      const kind =
        annotation.label.includes("局部重绘")
          ? "repaint"
          : annotation.label.includes("遮罩")
            ? "mask"
            : "avoid";
      return `${areaKindPrompts[kind]} 使用 ${annotation.color} 标注，位置 ${JSON.stringify(
        annotation.normalizedCoordinates
      )}。${canvasToolPrompts[
        kind === "repaint"
          ? "局部重绘"
          : kind === "mask"
            ? "遮罩选择"
            : "禁止修改"
      ]}`;
    })
    .join("；");
}

function buildToolInstruction(activeTool: CanvasTool) {
  return [
    `当前选中的功能按钮：${activeTool}。${canvasToolPrompts[activeTool]}`,
    `默认工具规则：${Object.entries(canvasToolPrompts)
      .map(([tool, instruction]) => `${tool}=${instruction}`)
      .join("；")}`
  ].join("\n");
}

export function buildFinalPrompt(payload: Omit<NightRenderApiPayload, "finalPrompt">) {
  return [
    "将用户上传的白天建筑照片转换为专业夜景照明效果图。",
    `时间段：${payload.timeRange}。`,
    `场景类型：${payload.sceneType}。`,
    `风格模板：${payload.template}。`,
    `用户提示词：${payload.prompt || "无"}。`,
    "生成接口会以包含暖白灯光预演的主图作为位置引导；灯具标注只转换为灯具类型、范围和方向说明，不向模型输出坐标数字。",
    `灯具标注颜色图例（仅用于识别灯具类型，不代表灯光颜色或色温）：${fixtureColorLegend}。`,
    colorTemperatureRule,
    `功能按钮规则：${buildToolInstruction(payload.tools.active)}。`,
    `灯具标注要求：${buildFixtureAnnotationInstruction(payload.annotations)}。`,
    `局部编辑标注要求：${buildEditAnnotationInstruction(payload.annotations)}。`,
    `输出分辨率：${payload.output.resolution}，目标尺寸 ${payload.output.size}。`,
    `硬性保持约束：${payload.preserveConstraints.join("、")}。`,
    `负面约束：${payload.negativePrompts.join("、")}。`,
    "如果输入主图已经包含暖白灯光预演效果，请把它理解为灯具位置引导图：保留建筑结构并把预演光效自然化、真实化，不要把它当成标注、文字或装饰元素。",
    "根据灯具预演光位置和灯具种类形成对应灯光效果。标注只作为灯位和灯具类型参考，最终图中绝对不要出现坐标数字、标注编号、引线、文字标签、彩色标注线、箭头、框线、色点或任何UI痕迹。",
    "强投光、线性光带、点光源和灯箱光效必须优先贴合预演光位置；光束要柔和克制，禁止舞台探照灯效果、粗大体积光柱和局部过曝；未标注位置只允许生成基础环境光、内透光和必要的弱补光。",
    "绝对不能改变原图建筑结构、视角、树木、地砖、人物和透视关系。只调整夜景光环境、灯具光效、室内透光和整体氛围。"
  ].join("\n");
}

export function buildNightRenderApiPayload(input: NightRenderPayloadInput) {
  const annotations = buildApiAnnotations(input.canvas);
  const basePayload: Omit<NightRenderApiPayload, "finalPrompt"> = {
    projectId: input.projectId,
    sourceImage: {
      name: input.imageFile.name,
      type: input.imageFile.type,
      size: input.imageFile.size
    },
    sceneType: input.sceneType,
    template: input.template,
    timeRange: input.canvas.timeRange,
    prompt: input.prompt.trim(),
    negativePrompts: input.negativePrompts,
    preserveConstraints,
    annotations,
    output: {
      resolution: input.outputSize,
      size: outputSizeMap[input.outputSize] ?? outputSizeMap["2K"],
      ratio: "自动适配",
      format: "PNG"
    },
    styleReference: {
      id: input.styleReference.id,
      title: input.styleReference.title,
      template: input.styleReference.template
    },
    tools: {
      active: input.canvas.activeTool,
      enabled: ["标注灯位"]
    }
  };

  return {
    ...basePayload,
    finalPrompt: buildFinalPrompt(basePayload)
  };
}
