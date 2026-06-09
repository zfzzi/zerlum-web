import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
  memo,
  useEffect,
  useRef,
  useState
} from "react";
import {
  ChevronDown,
  Crosshair,
  Eraser,
  ImagePlus,
  Lightbulb,
  Maximize2,
  Trash2,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { fixtureColorMap, fixtureGroups } from "../data";
import type {
  CanvasAnnotationSnapshot,
  CanvasGenerationContext,
  CanvasTool,
  NightRenderTimeRange
} from "../types/nightRender";
import { GeneratingNightOverlay } from "./GeneratingNightOverlay";

interface CanvasStageProps {
  activeFixture: string;
  activeTool: CanvasTool;
  isGenerating: boolean;
  resultImageUrl?: string;
  sourceImageUrl?: string;
  onCanvasContextChange: (context: CanvasGenerationContext) => void;
  onFixtureChange: (fixture: string) => void;
  onPrimaryImageUpload: (file: File) => void;
  onToolChange: (tool: CanvasTool) => void;
}

const toolIcons: Array<{ tool: CanvasTool; icon: typeof Crosshair }> = [
  { tool: "标注灯位", icon: Crosshair }
];

const defaultTimeRange: NightRenderTimeRange = "蓝调时刻 18:00-19:00";

const viewBox = {
  width: 1000,
  height: 560
};

const annotationBounds = {
  minX: 0,
  minY: 0,
  maxX: viewBox.width,
  maxY: viewBox.height
};

type AreaTool = Extract<CanvasTool, "局部重绘" | "遮罩选择" | "禁止修改">;
type AreaKind = "repaint" | "mask" | "avoid";
type FixtureLineKind = "wash" | "linear" | "dot" | "pixel";
type FixtureMarkMode = "line" | "washDirection" | "direction" | "point" | "area";
type ResultViewMode = "generated" | "compare" | "source";

type CanvasAnnotationItem = CanvasAnnotationSnapshot;

interface DraftArea {
  kind: AreaKind;
  label: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface DraftFixture {
  mode: FixtureMarkMode;
  kind?: FixtureLineKind;
  fixture: string;
  label?: string;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  lineStartX?: number;
  lineStartY?: number;
  lineEndX?: number;
  lineEndY?: number;
  isSettingDirection?: boolean;
}

interface DragState {
  id: string;
  lastX: number;
  lastY: number;
}

interface PanState {
  lastClientX: number;
  lastClientY: number;
}

const areaToolMeta: Record<AreaTool, { kind: AreaKind; label: string }> = {
  局部重绘: {
    kind: "repaint",
    label: "局部重绘"
  },
  遮罩选择: {
    kind: "mask",
    label: "遮罩"
  },
  禁止修改: {
    kind: "avoid",
    label: "禁止修改"
  }
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampToAnnotationBounds(point: { x: number; y: number }) {
  return {
    x: clamp(point.x, annotationBounds.minX, annotationBounds.maxX),
    y: clamp(point.y, annotationBounds.minY, annotationBounds.maxY)
  };
}

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function labelWidth(label: string) {
  return Math.max(50, label.length * 10.5 + 4);
}

function getEndpointLabelPosition(label: string, x: number, y: number) {
  return {
    x: clamp(x + 8, 8, viewBox.width - labelWidth(label) - 8),
    y: clamp(y - 7, 16, viewBox.height - 8)
  };
}

function getLineSamplePoints(
  start: { x: number; y: number },
  end: { x: number; y: number },
  spacing: number
) {
  const length = distance(start.x, start.y, end.x, end.y);
  const steps = Math.max(1, Math.round(length / spacing));

  return Array.from({ length: steps + 1 }, (_, index) => {
    const progress = index / steps;

    return {
      x: start.x + (end.x - start.x) * progress,
      y: start.y + (end.y - start.y) * progress
    };
  });
}

function getWashDirectionGuide(
  start: { x: number; y: number },
  end: { x: number; y: number }
) {
  const length = distance(start.x, start.y, end.x, end.y);
  const center = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2
  };

  if (length < 1) {
    return { start: center, end: center };
  }

  const offset = 46;
  const normalX = -((end.y - start.y) / length);
  const normalY = (end.x - start.x) / length;

  return {
    start: center,
    end: clampToAnnotationBounds({
      x: center.x + normalX * offset,
      y: center.y + normalY * offset
    })
  };
}

function getWashGuideCenter(line: {
  lineStartX: number;
  lineStartY: number;
  lineEndX: number;
  lineEndY: number;
}) {
  return {
    x: (line.lineStartX + line.lineEndX) / 2,
    y: (line.lineStartY + line.lineEndY) / 2
  };
}

function buildWashGuideFromDirection(
  line: {
    lineStartX: number;
    lineStartY: number;
    lineEndX: number;
    lineEndY: number;
  },
  target: { x: number; y: number }
) {
  const center = getWashGuideCenter(line);
  const defaultGuide = getWashDirectionGuide(
    { x: line.lineStartX, y: line.lineStartY },
    { x: line.lineEndX, y: line.lineEndY }
  );
  const guideTarget =
    distance(center.x, center.y, target.x, target.y) >= 10
      ? clampToAnnotationBounds(target)
      : defaultGuide.end;

  return {
    start: center,
    end: guideTarget
  };
}

function isWashDirectionDraft(
  draft: DraftFixture
): draft is DraftFixture & {
  mode: "washDirection";
  lineStartX: number;
  lineStartY: number;
  lineEndX: number;
  lineEndY: number;
  label: string;
} {
  return (
    draft.mode === "washDirection" &&
    typeof draft.lineStartX === "number" &&
    typeof draft.lineStartY === "number" &&
    typeof draft.lineEndX === "number" &&
    typeof draft.lineEndY === "number" &&
    typeof draft.label === "string"
  );
}

function toPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function isAreaTool(tool: CanvasTool): tool is AreaTool {
  return tool === "局部重绘" || tool === "遮罩选择" || tool === "禁止修改";
}

function getFixtureLineKind(fixture: string): FixtureLineKind | undefined {
  if (fixture === "洗墙灯") {
    return "wash";
  }

  if (fixture === "线性灯" || fixture === "线性灯带") {
    return "linear";
  }

  if (fixture === "点光源") {
    return "dot";
  }

  if (fixture === "像素灯") {
    return "pixel";
  }

  return undefined;
}

function getFixtureMarkMode(fixture: string): FixtureMarkMode {
  if (getFixtureLineKind(fixture)) {
    return "line";
  }

  if (fixture === "灯箱") {
    return "area";
  }

  return "direction";
}

function getFixtureGuide(fixture: string) {
  const lineKind = getFixtureLineKind(fixture);

  if (lineKind === "wash") {
    return "洗墙灯：拖拽绘制洗墙范围";
  }

  if (lineKind === "linear") {
    return `${fixture}：拖拽绘制线性灯走向`;
  }

  if (lineKind === "dot") {
    return "点光源：拖拽绘制点光源排列";
  }

  if (lineKind === "pixel") {
    return "像素灯：拖拽绘制像素点阵走向";
  }

  if (fixture === "灯箱") {
    return "灯箱：拖拽框选发光范围";
  }

  return `${fixture}：点击点位并拖拽照射方向`;
}

function getFixtureColor(fixture: string) {
  return fixtureColorMap[fixture] ?? "#A78BFA";
}

function getFixtureStyle(fixture: string) {
  return {
    "--fixture-color": getFixtureColor(fixture)
  } as CSSProperties;
}

function normalizeArea(draft: DraftArea) {
  const start = clampToAnnotationBounds({ x: draft.startX, y: draft.startY });
  const current = clampToAnnotationBounds({
    x: draft.currentX,
    y: draft.currentY
  });
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  return {
    x,
    y,
    width,
    height
  };
}

function normalizeFixtureArea(draft: DraftFixture) {
  const start = clampToAnnotationBounds({ x: draft.startX, y: draft.startY });
  const current = clampToAnnotationBounds({
    x: draft.currentX,
    y: draft.currentY
  });
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  return {
    x,
    y,
    width,
    height
  };
}

function snapFixtureDraftPoint(
  draft: DraftFixture,
  point: { x: number; y: number },
  shouldSnap: boolean
) {
  if (!shouldSnap || (draft.mode !== "line" && draft.mode !== "direction")) {
    return point;
  }

  const deltaX = point.x - draft.startX;
  const deltaY = point.y - draft.startY;

  return clampToAnnotationBounds(
    Math.abs(deltaX) >= Math.abs(deltaY)
      ? { x: point.x, y: draft.startY }
      : { x: draft.startX, y: point.y }
  );
}

function clampMoveDelta(
  delta: number,
  minPosition: number,
  maxPosition: number,
  minBound: number,
  maxBound: number
) {
  return clamp(delta, minBound - minPosition, maxBound - maxPosition);
}

function moveAnnotation(
  annotation: CanvasAnnotationItem,
  deltaX: number,
  deltaY: number
): CanvasAnnotationItem {
  if (annotation.type === "area") {
    const safeDeltaX = clampMoveDelta(
      deltaX,
      annotation.x,
      annotation.x + annotation.width,
      annotationBounds.minX,
      annotationBounds.maxX
    );
    const safeDeltaY = clampMoveDelta(
      deltaY,
      annotation.y,
      annotation.y + annotation.height,
      annotationBounds.minY,
      annotationBounds.maxY
    );

    return {
      ...annotation,
      x: annotation.x + safeDeltaX,
      y: annotation.y + safeDeltaY
    };
  }

  if (annotation.type === "fixtureLine") {
    const safeDeltaX = clampMoveDelta(
      deltaX,
      Math.min(annotation.x1, annotation.x2),
      Math.max(annotation.x1, annotation.x2),
      annotationBounds.minX,
      annotationBounds.maxX
    );
    const safeDeltaY = clampMoveDelta(
      deltaY,
      Math.min(annotation.y1, annotation.y2),
      Math.max(annotation.y1, annotation.y2),
      annotationBounds.minY,
      annotationBounds.maxY
    );

    return {
      ...annotation,
      x1: annotation.x1 + safeDeltaX,
      y1: annotation.y1 + safeDeltaY,
      x2: annotation.x2 + safeDeltaX,
      y2: annotation.y2 + safeDeltaY,
      guideX1:
        typeof annotation.guideX1 === "number"
          ? annotation.guideX1 + safeDeltaX
          : annotation.guideX1,
      guideY1:
        typeof annotation.guideY1 === "number"
          ? annotation.guideY1 + safeDeltaY
          : annotation.guideY1,
      guideX2:
        typeof annotation.guideX2 === "number"
          ? annotation.guideX2 + safeDeltaX
          : annotation.guideX2,
      guideY2:
        typeof annotation.guideY2 === "number"
          ? annotation.guideY2 + safeDeltaY
          : annotation.guideY2
    };
  }

  if (annotation.type === "fixturePoint") {
    const point = clampToAnnotationBounds({
      x: annotation.x + deltaX,
      y: annotation.y + deltaY
    });

    return {
      ...annotation,
      x: point.x,
      y: point.y
    };
  }

  if (annotation.type === "fixtureArea") {
    const safeDeltaX = clampMoveDelta(
      deltaX,
      annotation.x,
      annotation.x + annotation.width,
      annotationBounds.minX,
      annotationBounds.maxX
    );
    const safeDeltaY = clampMoveDelta(
      deltaY,
      annotation.y,
      annotation.y + annotation.height,
      annotationBounds.minY,
      annotationBounds.maxY
    );

    return {
      ...annotation,
      x: annotation.x + safeDeltaX,
      y: annotation.y + safeDeltaY
    };
  }

  const safeDeltaX = clampMoveDelta(
    deltaX,
    Math.min(annotation.x, annotation.targetX),
    Math.max(annotation.x, annotation.targetX),
    annotationBounds.minX,
    annotationBounds.maxX
  );
  const safeDeltaY = clampMoveDelta(
    deltaY,
    Math.min(annotation.y, annotation.targetY),
    Math.max(annotation.y, annotation.targetY),
    annotationBounds.minY,
    annotationBounds.maxY
  );

  return {
    ...annotation,
    x: annotation.x + safeDeltaX,
    y: annotation.y + safeDeltaY,
    targetX: annotation.targetX + safeDeltaX,
    targetY: annotation.targetY + safeDeltaY
  };
}

function CanvasStageComponent({
  activeFixture,
  activeTool,
  isGenerating,
  resultImageUrl,
  sourceImageUrl,
  onCanvasContextChange,
  onFixtureChange,
  onPrimaryImageUpload,
  onToolChange
}: CanvasStageProps) {
  const hasSource = Boolean(sourceImageUrl);
  const hasResult = Boolean(resultImageUrl);
  const emptyUploadInputRef = useRef<HTMLInputElement | null>(null);
  const imageFrameRef = useRef<HTMLDivElement | null>(null);
  const viewportContentRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [annotationItems, setAnnotationItems] = useState<CanvasAnnotationItem[]>([]);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string>();
  const [isCompareDragging, setIsCompareDragging] = useState(false);
  const [compare, setCompare] = useState(48);
  const [resultViewMode, setResultViewMode] = useState<ResultViewMode>("generated");
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [panState, setPanState] = useState<PanState | null>(null);
  const [canvasView, setCanvasView] = useState({
    scale: 1,
    x: 0,
    y: 0
  });
  const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(
    null
  );
  const [draftArea, setDraftArea] = useState<DraftArea | null>(null);
  const [draftFixture, setDraftFixture] = useState<DraftFixture | null>(null);
  const compareFrameRef = useRef<number | null>(null);
  const pendingCompareClientXRef = useRef<number | null>(null);
  const panStateRef = useRef<PanState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const draftAreaRef = useRef<DraftArea | null>(null);
  const draftFixtureRef = useRef<DraftFixture | null>(null);
  const panFrameRef = useRef<number | null>(null);
  const pendingPanDeltaRef = useRef({ x: 0, y: 0 });
  const annotationMoveFrameRef = useRef<number | null>(null);
  const pendingAnnotationMoveRef = useRef<{
    id: string;
    deltaX: number;
    deltaY: number;
  } | null>(null);
  const draftFrameRef = useRef<number | null>(null);
  const frameResizeFrameRef = useRef<number | null>(null);
  const svgBoundsRef = useRef<DOMRectReadOnly | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const pendingWheelDeltaRef = useRef(0);

  function setDragStateImmediate(nextState: DragState | null) {
    dragStateRef.current = nextState;
    setDragState(nextState);
  }

  function setPanStateImmediate(nextState: PanState | null) {
    panStateRef.current = nextState;
    setPanState(nextState);
  }

  function setDraftAreaImmediate(nextDraft: DraftArea | null) {
    draftAreaRef.current = nextDraft;
    setDraftArea(nextDraft);
  }

  function setDraftFixtureImmediate(nextDraft: DraftFixture | null) {
    draftFixtureRef.current = nextDraft;
    setDraftFixture(nextDraft);
  }

  function applyPendingCompare() {
    const clientX = pendingCompareClientXRef.current;
    pendingCompareClientXRef.current = null;
    compareFrameRef.current = null;

    if (clientX === null) {
      return;
    }

    const bounds = viewportContentRef.current?.getBoundingClientRect();

    if (!bounds || bounds.width === 0) {
      return;
    }

    const nextCompare = Math.round(
      clamp(((clientX - bounds.left) / bounds.width) * 100, 0, 100)
    );
    setCompare((current) => (current === nextCompare ? current : nextCompare));
  }

  function flushPendingCompare() {
    if (compareFrameRef.current !== null) {
      cancelAnimationFrame(compareFrameRef.current);
    }

    applyPendingCompare();
  }

  function schedulePanMove(deltaX: number, deltaY: number) {
    if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) {
      return;
    }

    pendingPanDeltaRef.current.x += deltaX;
    pendingPanDeltaRef.current.y += deltaY;

    if (panFrameRef.current !== null) {
      return;
    }

    panFrameRef.current = requestAnimationFrame(applyPendingPanMove);
  }

  function applyPendingPanMove() {
    panFrameRef.current = null;
    const pending = pendingPanDeltaRef.current;
    pendingPanDeltaRef.current = { x: 0, y: 0 };

    if (pending.x === 0 && pending.y === 0) {
      return;
    }

    setCanvasView((current) =>
      constrainCanvasView({
        ...current,
        x: current.x + pending.x,
        y: current.y + pending.y
      })
    );
  }

  function flushPendingPanMove() {
    if (panFrameRef.current !== null) {
      cancelAnimationFrame(panFrameRef.current);
    }

    applyPendingPanMove();
  }

  function applyPendingAnnotationMove() {
    const pending = pendingAnnotationMoveRef.current;
    pendingAnnotationMoveRef.current = null;
    annotationMoveFrameRef.current = null;

    if (!pending) {
      return;
    }

    setAnnotationItems((current) =>
      current.map((annotation) =>
        annotation.id === pending.id
          ? moveAnnotation(annotation, pending.deltaX, pending.deltaY)
          : annotation
      )
    );
  }

  function flushPendingAnnotationMove() {
    if (annotationMoveFrameRef.current !== null) {
      cancelAnimationFrame(annotationMoveFrameRef.current);
    }

    applyPendingAnnotationMove();
  }

  function scheduleAnnotationMove(id: string, deltaX: number, deltaY: number) {
    if (Math.abs(deltaX) < 0.25 && Math.abs(deltaY) < 0.25) {
      return;
    }

    const pending = pendingAnnotationMoveRef.current;

    if (pending && pending.id !== id) {
      flushPendingAnnotationMove();
    }

    const nextPending = pendingAnnotationMoveRef.current;

    if (nextPending) {
      nextPending.deltaX += deltaX;
      nextPending.deltaY += deltaY;
    } else {
      pendingAnnotationMoveRef.current = { id, deltaX, deltaY };
    }

    if (annotationMoveFrameRef.current !== null) {
      return;
    }

    annotationMoveFrameRef.current = requestAnimationFrame(applyPendingAnnotationMove);
  }

  function applyPendingDraft() {
    draftFrameRef.current = null;
    setDraftArea(draftAreaRef.current);
    setDraftFixture(draftFixtureRef.current);
  }

  function scheduleDraftArea(nextDraft: DraftArea) {
    draftAreaRef.current = nextDraft;

    if (draftFrameRef.current === null) {
      draftFrameRef.current = requestAnimationFrame(applyPendingDraft);
    }
  }

  function scheduleDraftFixture(nextDraft: DraftFixture) {
    draftFixtureRef.current = nextDraft;

    if (draftFrameRef.current === null) {
      draftFrameRef.current = requestAnimationFrame(applyPendingDraft);
    }
  }

  function refreshSvgBounds() {
    const bounds = svgRef.current?.getBoundingClientRect() ?? null;
    svgBoundsRef.current =
      bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null;
    return svgBoundsRef.current;
  }

  function getFittedCanvasSize() {
    if (!imageSize || !frameSize || imageSize.width <= 0 || imageSize.height <= 0) {
      return null;
    }

    const imageRatio = imageSize.width / imageSize.height;
    const frameRatio = frameSize.width / frameSize.height;
    const width =
      frameRatio > imageRatio ? frameSize.height * imageRatio : frameSize.width;
    const height =
      frameRatio > imageRatio ? frameSize.height : frameSize.width / imageRatio;

    return { width, height };
  }

  function constrainCanvasView(view: typeof canvasView) {
    const scale = clamp(view.scale, 0.35, 6);

    if (scale <= 1) {
      return { scale, x: 0, y: 0 };
    }

    const fittedSize = getFittedCanvasSize();

    if (!fittedSize || !frameSize) {
      return { scale, x: view.x, y: view.y };
    }

    const maxX = Math.max(0, (fittedSize.width * scale - frameSize.width) / 2);
    const maxY = Math.max(0, (fittedSize.height * scale - frameSize.height) / 2);

    return {
      scale,
      x: clamp(view.x, -maxX, maxX),
      y: clamp(view.y, -maxY, maxY)
    };
  }

  function applyPendingWheelZoom() {
    const pendingDelta = pendingWheelDeltaRef.current;
    pendingWheelDeltaRef.current = 0;
    wheelFrameRef.current = null;

    if (pendingDelta === 0) {
      return;
    }

    const zoomFactor = Math.exp(-pendingDelta * 0.001);

    setCanvasView((current) => {
      const nextView = constrainCanvasView({
        ...current,
        scale: Number((current.scale * zoomFactor).toFixed(4))
      });

      return nextView.scale === current.scale &&
        nextView.x === current.x &&
        nextView.y === current.y
        ? current
        : nextView;
    });
  }

  useEffect(() => {
    return () => {
      const frameIds = [
        compareFrameRef.current,
        panFrameRef.current,
        annotationMoveFrameRef.current,
        draftFrameRef.current,
        frameResizeFrameRef.current,
        wheelFrameRef.current
      ];

      for (const frameId of frameIds) {
        if (frameId !== null) {
          cancelAnimationFrame(frameId);
        }
      }
    };
  }, []);

  useEffect(() => {
    if (dragState || draftArea || draftFixture || panState) {
      return;
    }

    onCanvasContextChange({
      activeTool,
      annotations: annotationItems,
      timeRange: defaultTimeRange,
      viewBox
    });
  }, [
    activeTool,
    annotationItems,
    dragState,
    draftArea,
    draftFixture,
    onCanvasContextChange,
    panState
  ]);

  useEffect(() => {
    const currentDraftFixture = draftFixtureRef.current;

    if (activeTool !== "标注灯位" && currentDraftFixture && isWashDirectionDraft(currentDraftFixture)) {
      setDraftFixtureImmediate(null);
    }
  }, [activeTool]);

  useEffect(() => {
    setAnnotationItems([]);
    setSelectedAnnotationId(undefined);
    setDraftAreaImmediate(null);
    setDraftFixtureImmediate(null);
    setDragStateImmediate(null);
    setPanStateImmediate(null);
    setCompare(48);
    setResultViewMode("generated");
    setImageSize(null);
    resetCanvasView();
  }, [sourceImageUrl]);

  useEffect(() => {
    if (resultImageUrl) {
      setCompare(48);
      setResultViewMode("generated");
    }
  }, [resultImageUrl]);

  useEffect(() => {
    const frame = imageFrameRef.current;

    if (!frame) {
      return;
    }

    const observedFrame = frame;

    function updateFrameSize() {
      if (frameResizeFrameRef.current !== null) {
        return;
      }

      frameResizeFrameRef.current = requestAnimationFrame(() => {
        frameResizeFrameRef.current = null;
        const bounds = observedFrame.getBoundingClientRect();
        const width = Math.round(bounds.width);
        const height = Math.round(bounds.height);

        setFrameSize((current) =>
          current?.width === width && current?.height === height
            ? current
            : { width, height }
        );
      });
    }

    updateFrameSize();
    const resizeObserver = new ResizeObserver(updateFrameSize);
    resizeObserver.observe(observedFrame);

    return () => {
      resizeObserver.disconnect();
      if (frameResizeFrameRef.current !== null) {
        cancelAnimationFrame(frameResizeFrameRef.current);
        frameResizeFrameRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isEditing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";

      if (
        selectedAnnotationId &&
        !isEditing &&
        (event.key === "Delete" || event.key === "Backspace")
      ) {
        event.preventDefault();
        deleteSelectedAnnotation();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedAnnotationId]);

  useEffect(() => {
    const frame = imageFrameRef.current;

    if (!frame || !hasSource) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      pendingWheelDeltaRef.current += event.deltaY;

      if (wheelFrameRef.current === null) {
        wheelFrameRef.current = requestAnimationFrame(applyPendingWheelZoom);
      }
    }

    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      frame.removeEventListener("wheel", handleWheel);
      if (wheelFrameRef.current !== null) {
        cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
      pendingWheelDeltaRef.current = 0;
    };
  }, [hasSource]);

  function getSvgPoint(event: PointerEvent<SVGElement>) {
    const bounds = svgBoundsRef.current ?? refreshSvgBounds();

    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return { x: 0, y: 0 };
    }

    return clampToAnnotationBounds({
      x: ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
      y: ((event.clientY - bounds.top) / bounds.height) * viewBox.height
    });
  }

  function getLabelScaleX() {
    if (!imageSize || imageSize.width <= 0 || imageSize.height <= 0) {
      return 1;
    }

    const viewBoxRatio = viewBox.width / viewBox.height;
    const imageRatio = imageSize.width / imageSize.height;

    return clamp(viewBoxRatio / imageRatio, 0.55, 1.85);
  }

  function getLabelTransform(x: number, y: number) {
    const scaleX = getLabelScaleX();

    if (Math.abs(scaleX - 1) < 0.015) {
      return undefined;
    }

    return `translate(${x} ${y}) scale(${scaleX} 1) translate(${-x} ${-y})`;
  }

  function resetCanvasView() {
    setCanvasView({
      scale: 1,
      x: 0,
      y: 0
    });
  }

  function updateCanvasScale(nextScale: number) {
    setCanvasView((current) => {
      const nextView = constrainCanvasView({ ...current, scale: nextScale });
      return nextView.scale === current.scale &&
        nextView.x === current.x &&
        nextView.y === current.y
        ? current
        : nextView;
    });
  }

  function canStartCanvasPan(event: PointerEvent<Element>, allowPrimaryButton = false) {
    return (
      hasSource &&
      canvasView.scale > 1 &&
      (event.button === 1 || event.shiftKey || (allowPrimaryButton && event.button === 0))
    );
  }

  function startCanvasPan(event: PointerEvent<Element>) {
    event.preventDefault();
    event.stopPropagation();
    const captureTarget =
      event.currentTarget instanceof SVGElement && svgRef.current
        ? svgRef.current
        : event.currentTarget;

    setSelectedAnnotationId(undefined);
    setDraftAreaImmediate(null);
    setDraftFixtureImmediate(null);
    setPanStateImmediate({
      lastClientX: event.clientX,
      lastClientY: event.clientY
    });
    captureTarget.setPointerCapture(event.pointerId);
  }

  function handleImageFramePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (showAnnotationLayer || !canStartCanvasPan(event, true)) {
      return;
    }

    const target = event.target as HTMLElement | null;

    if (target?.closest(".compare-line, button, input, select, textarea")) {
      return;
    }

    startCanvasPan(event);
  }

  function handleImageFramePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (showAnnotationLayer) {
      return;
    }

    const currentPanState = panStateRef.current;

    if (!currentPanState) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX = event.clientX - currentPanState.lastClientX;
    const deltaY = event.clientY - currentPanState.lastClientY;
    currentPanState.lastClientX = event.clientX;
    currentPanState.lastClientY = event.clientY;
    schedulePanMove(deltaX, deltaY);
  }

  function handleImageFramePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (showAnnotationLayer || !panStateRef.current) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    flushPendingPanMove();
    setPanStateImmediate(null);
  }

  function handleSourceImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;

    setImageSize((current) =>
      current?.width === width && current?.height === height ? current : { width, height }
    );
  }

  function updateCompareFromClientX(clientX: number) {
    pendingCompareClientXRef.current = clientX;

    if (compareFrameRef.current === null) {
      compareFrameRef.current = requestAnimationFrame(applyPendingCompare);
    }
  }

  function handleComparePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!hasResult) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setIsCompareDragging(true);
    updateCompareFromClientX(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleComparePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!isCompareDragging) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    updateCompareFromClientX(event.clientX);
  }

  function handleComparePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    flushPendingCompare();
    setIsCompareDragging(false);
  }

  function handleCompareKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    setCompare((current) => clamp(current + direction * 4, 0, 100));
  }

  function handleAnnotationPointerDown(
    id: string,
    event: PointerEvent<SVGElement>
  ) {
    event.preventDefault();
    event.stopPropagation();
    refreshSvgBounds();

    if ((event.shiftKey || event.button === 1) && canStartCanvasPan(event)) {
      startCanvasPan(event);
      return;
    }

    const point = getSvgPoint(event);
    setSelectedAnnotationId(id);
    setDragStateImmediate({ id, lastX: point.x, lastY: point.y });
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function handleAnnotationPointerMove(event: PointerEvent<SVGSVGElement>) {
    const currentPanState = panStateRef.current;
    const currentDragState = dragStateRef.current;
    const currentDraftArea = draftAreaRef.current;
    const currentDraftFixture = draftFixtureRef.current;

    if (currentPanState) {
      event.preventDefault();
      event.stopPropagation();
      const deltaX = event.clientX - currentPanState.lastClientX;
      const deltaY = event.clientY - currentPanState.lastClientY;
      currentPanState.lastClientX = event.clientX;
      currentPanState.lastClientY = event.clientY;
      schedulePanMove(deltaX, deltaY);
      return;
    }

    if (!currentDragState && !currentDraftArea && !currentDraftFixture) {
      return;
    }

    const point = getSvgPoint(event);

    if (currentDragState) {
      event.preventDefault();
      const deltaX = point.x - currentDragState.lastX;
      const deltaY = point.y - currentDragState.lastY;
      currentDragState.lastX = point.x;
      currentDragState.lastY = point.y;
      scheduleAnnotationMove(currentDragState.id, deltaX, deltaY);
      return;
    }

    if (currentDraftArea) {
      event.preventDefault();
      scheduleDraftArea({ ...currentDraftArea, currentX: point.x, currentY: point.y });
      return;
    }

    if (currentDraftFixture) {
      if (
        isWashDirectionDraft(currentDraftFixture) &&
        !currentDraftFixture.isSettingDirection
      ) {
        return;
      }

      event.preventDefault();
      const fixturePoint = snapFixtureDraftPoint(
        currentDraftFixture,
        point,
        event.shiftKey
      );
      scheduleDraftFixture({
        ...currentDraftFixture,
        currentX: fixturePoint.x,
        currentY: fixturePoint.y
      });
    }
  }

  function handleAnnotationPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }

    flushPendingAnnotationMove();
    flushPendingPanMove();
    const releasePoint = getSvgPoint(event);
    const finalDraftArea = draftAreaRef.current
      ? {
          ...draftAreaRef.current,
          currentX: releasePoint.x,
          currentY: releasePoint.y
        }
      : null;
    const snappedFixtureReleasePoint = draftFixtureRef.current
      ? snapFixtureDraftPoint(draftFixtureRef.current, releasePoint, event.shiftKey)
      : null;
    const finalDraftFixture = draftFixtureRef.current
      ? {
          ...draftFixtureRef.current,
          currentX: snappedFixtureReleasePoint?.x ?? releasePoint.x,
          currentY: snappedFixtureReleasePoint?.y ?? releasePoint.y
        }
      : null;
    let nextDraftFixture: DraftFixture | null = null;

    if (finalDraftArea) {
      const area = normalizeArea(finalDraftArea);

      if (area.width >= 18 && area.height >= 18) {
        const sameKindCount =
          annotationItems.filter(
            (annotation) =>
              annotation.type === "area" && annotation.kind === finalDraftArea.kind
          ).length + 1;
        const id = `${finalDraftArea.kind}-${Date.now()}`;

        setAnnotationItems((current) => [
          ...current,
          {
            id,
            type: "area",
            kind: finalDraftArea.kind,
            label: `${finalDraftArea.label} ${sameKindCount}`,
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height
          }
        ]);
        setSelectedAnnotationId(id);
      }
    }

    if (finalDraftFixture) {
      const length = distance(
        finalDraftFixture.startX,
        finalDraftFixture.startY,
        finalDraftFixture.currentX,
        finalDraftFixture.currentY
      );
      const fixtureCount =
        annotationItems.filter(
          (annotation) =>
            (annotation.type === "fixtureLine" ||
              annotation.type === "fixtureDirection" ||
              annotation.type === "fixturePoint" ||
              annotation.type === "fixtureArea") &&
            annotation.fixture === finalDraftFixture.fixture
        ).length + 1;
      const id = `fixture-${Date.now()}`;

      if (isWashDirectionDraft(finalDraftFixture)) {
        if (finalDraftFixture.isSettingDirection) {
          const guide = buildWashGuideFromDirection(finalDraftFixture, {
            x: finalDraftFixture.currentX,
            y: finalDraftFixture.currentY
          });

          setAnnotationItems((current) => [
            ...current,
            {
              id,
              type: "fixtureLine",
              kind: "wash",
              fixture: finalDraftFixture.fixture,
              label: finalDraftFixture.label,
              x1: finalDraftFixture.lineStartX,
              y1: finalDraftFixture.lineStartY,
              x2: finalDraftFixture.lineEndX,
              y2: finalDraftFixture.lineEndY,
              guideX1: guide.start.x,
              guideY1: guide.start.y,
              guideX2: guide.end.x,
              guideY2: guide.end.y
            }
          ]);
          setSelectedAnnotationId(id);
        } else {
          nextDraftFixture = finalDraftFixture;
        }
      }

      if (finalDraftFixture.mode === "line" && finalDraftFixture.kind && length >= 18) {
        const lineKind = finalDraftFixture.kind;
        const start = clampToAnnotationBounds({
          x: finalDraftFixture.startX,
          y: finalDraftFixture.startY
        });
        const end = clampToAnnotationBounds({
          x: finalDraftFixture.currentX,
          y: finalDraftFixture.currentY
        });

        if (lineKind === "wash") {
          const defaultGuide = getWashDirectionGuide(start, end);
          nextDraftFixture = {
            mode: "washDirection",
            kind: "wash",
            fixture: finalDraftFixture.fixture,
            label: `${finalDraftFixture.fixture} ${fixtureCount}`,
            lineStartX: start.x,
            lineStartY: start.y,
            lineEndX: end.x,
            lineEndY: end.y,
            startX: defaultGuide.start.x,
            startY: defaultGuide.start.y,
            currentX: defaultGuide.end.x,
            currentY: defaultGuide.end.y,
            isSettingDirection: false
          };
          setSelectedAnnotationId(undefined);
        } else {
          setAnnotationItems((current) => [
            ...current,
            {
              id,
              type: "fixtureLine",
              kind: lineKind,
              fixture: finalDraftFixture.fixture,
              label: `${finalDraftFixture.fixture} ${fixtureCount}`,
              x1: start.x,
              y1: start.y,
              x2: end.x,
              y2: end.y
            }
          ]);
          setSelectedAnnotationId(id);
        }
      }

      if (finalDraftFixture.mode === "point") {
        const point = clampToAnnotationBounds({
          x: finalDraftFixture.startX,
          y: finalDraftFixture.startY
        });

        setAnnotationItems((current) => [
          ...current,
          {
            id,
            type: "fixturePoint",
            fixture: finalDraftFixture.fixture,
            label: `${finalDraftFixture.fixture} ${fixtureCount}`,
            x: point.x,
            y: point.y
          }
        ]);
        setSelectedAnnotationId(id);
      }

      if (finalDraftFixture.mode === "area") {
        const area = normalizeFixtureArea(finalDraftFixture);

        if (area.width >= 18 && area.height >= 18) {
          setAnnotationItems((current) => [
            ...current,
            {
              id,
              type: "fixtureArea",
              fixture: finalDraftFixture.fixture,
              label: `${finalDraftFixture.fixture} ${fixtureCount}`,
              x: area.x,
              y: area.y,
              width: area.width,
              height: area.height
            }
          ]);
          setSelectedAnnotationId(id);
        }
      }

      if (finalDraftFixture.mode === "direction") {
        const targetX =
          length >= 18 ? finalDraftFixture.currentX : finalDraftFixture.startX + 52;
        const targetY =
          length >= 18 ? finalDraftFixture.currentY : finalDraftFixture.startY - 22;
        const start = clampToAnnotationBounds({
          x: finalDraftFixture.startX,
          y: finalDraftFixture.startY
        });
        const target = clampToAnnotationBounds({
          x: targetX,
          y: targetY
        });

        setAnnotationItems((current) => [
          ...current,
          {
            id,
            type: "fixtureDirection",
            fixture: finalDraftFixture.fixture,
            label: `${finalDraftFixture.fixture} ${fixtureCount}`,
            x: start.x,
            y: start.y,
            targetX: target.x,
            targetY: target.y
          }
        ]);
        setSelectedAnnotationId(id);
      }
    }

    setDraftAreaImmediate(null);
    setDraftFixtureImmediate(nextDraftFixture);
    setDragStateImmediate(null);
    setPanStateImmediate(null);
    svgBoundsRef.current = null;
  }

  function handleAnnotationCanvasPointerDown(
    event: PointerEvent<SVGSVGElement>
  ) {
    if (!hasSource || event.target !== event.currentTarget) {
      return;
    }

    if (canStartCanvasPan(event)) {
      startCanvasPan(event);
      return;
    }

    event.preventDefault();
    refreshSvgBounds();
    const point = getSvgPoint(event);
    const pendingWashDirection = draftFixtureRef.current;

    if (pendingWashDirection && isWashDirectionDraft(pendingWashDirection)) {
      const guide = buildWashGuideFromDirection(pendingWashDirection, point);
      setDraftFixtureImmediate({
        ...pendingWashDirection,
        isSettingDirection: true,
        startX: guide.start.x,
        startY: guide.start.y,
        currentX: guide.end.x,
        currentY: guide.end.y
      });
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (activeTool === "标注灯位") {
      const lineKind = getFixtureLineKind(activeFixture);
      setSelectedAnnotationId(undefined);
      setDraftFixtureImmediate({
        mode: getFixtureMarkMode(activeFixture),
        kind: lineKind,
        fixture: activeFixture,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y
      });
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (isAreaTool(activeTool)) {
      const meta = areaToolMeta[activeTool];
      setSelectedAnnotationId(undefined);
      setDraftAreaImmediate({
        ...meta,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y
      });
      svgRef.current?.setPointerCapture(event.pointerId);
    }
  }

  function deleteSelectedAnnotation() {
    if (!selectedAnnotationId) {
      return;
    }

    setAnnotationItems((current) =>
      current.filter((annotation) => annotation.id !== selectedAnnotationId)
    );
    setSelectedAnnotationId(undefined);
    setDraftAreaImmediate(null);
    setDraftFixtureImmediate(null);
    setDragStateImmediate(null);
  }

  function deleteAllAnnotations() {
    setAnnotationItems([]);
    setSelectedAnnotationId(undefined);
    setDraftAreaImmediate(null);
    setDraftFixtureImmediate(null);
    setDragStateImmediate(null);
  }

  function renderAreaAnnotation(annotation: Extract<CanvasAnnotationItem, { type: "area" }>) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelPosition = getEndpointLabelPosition(
      annotation.label,
      annotation.x + annotation.width,
      annotation.y
    );
    const groupClassName = isSelected
      ? `annotation-node annotation-area area-${annotation.kind} is-selected`
      : `annotation-node annotation-area area-${annotation.kind}`;

    return (
      <g
        className={groupClassName}
        data-annotation-id={annotation.id}
        data-annotation-kind={annotation.kind}
        key={annotation.id}
        onPointerDown={(event) => handleAnnotationPointerDown(annotation.id, event)}
      >
        <rect
          className="annotation-area-hit"
          x={annotation.x - 8}
          y={annotation.y - 8}
          width={annotation.width + 16}
          height={annotation.height + 16}
          rx="6"
        />
        <rect
          className="annotation-area-rect"
          x={annotation.x}
          y={annotation.y}
          width={annotation.width}
          height={annotation.height}
          rx="4"
        />
        {isSelected ? (
          <>
            <rect
              className="annotation-selection-outline"
              x={annotation.x - 4}
              y={annotation.y - 4}
              width={annotation.width + 8}
              height={annotation.height + 8}
              rx="5"
            />
            <circle className="annotation-handle" cx={annotation.x} cy={annotation.y} r="3.5" />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y}
              r="3.5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x}
              cy={annotation.y + annotation.height}
              r="3.5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y + annotation.height}
              r="3.5"
            />
          </>
        ) : null}
        <text
          className="annotation-svg-label"
          transform={getLabelTransform(labelPosition.x, labelPosition.y)}
          x={labelPosition.x}
          y={labelPosition.y}
        >
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderFixtureLineAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixtureLine" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelPosition = getEndpointLabelPosition(
      annotation.label,
      annotation.x2,
      annotation.y2
    );
    const groupClassName = isSelected
      ? `annotation-node annotation-fixture-line fixture-line-${annotation.kind} is-selected`
      : `annotation-node annotation-fixture-line fixture-line-${annotation.kind}`;

    return (
      <g
        className={groupClassName}
        data-annotation-id={annotation.id}
        data-annotation-kind="fixture-line"
        data-fixture={annotation.fixture}
        data-line-kind={annotation.kind}
        key={annotation.id}
        style={getFixtureStyle(annotation.fixture)}
        onPointerDown={(event) => handleAnnotationPointerDown(annotation.id, event)}
      >
        <line
          className="fixture-line-hit"
          x1={annotation.x1}
          y1={annotation.y1}
          x2={annotation.x2}
          y2={annotation.y2}
        />
        {annotation.kind === "dot" || annotation.kind === "pixel" ? (
          renderFixtureDotLine(
            annotation.id,
            annotation.kind,
            { x: annotation.x1, y: annotation.y1 },
            { x: annotation.x2, y: annotation.y2 }
          )
        ) : (
          <line
            className="fixture-line-path"
            x1={annotation.x1}
            y1={annotation.y1}
            x2={annotation.x2}
            y2={annotation.y2}
          />
        )}
        {annotation.kind === "wash"
          ? renderWashDirectionGuide(
              typeof annotation.guideX1 === "number" &&
                typeof annotation.guideY1 === "number" &&
                typeof annotation.guideX2 === "number" &&
                typeof annotation.guideY2 === "number"
                ? {
                    start: { x: annotation.guideX1, y: annotation.guideY1 },
                    end: { x: annotation.guideX2, y: annotation.guideY2 }
                  }
                : getWashDirectionGuide(
                    { x: annotation.x1, y: annotation.y1 },
                    { x: annotation.x2, y: annotation.y2 }
                  )
            )
          : null}
        {isSelected ? (
          <>
            <circle className="annotation-handle" cx={annotation.x1} cy={annotation.y1} r="3.5" />
            <circle className="annotation-handle" cx={annotation.x2} cy={annotation.y2} r="3.5" />
          </>
        ) : null}
        <text
          className="annotation-svg-label"
          transform={getLabelTransform(labelPosition.x, labelPosition.y)}
          x={labelPosition.x}
          y={labelPosition.y}
        >
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderWashDirectionGuide(guide: {
    start: { x: number; y: number };
    end: { x: number; y: number };
  }) {
    return (
      <line
        className="fixture-wash-direction-guide"
        markerEnd="url(#fixture-arrow)"
        x1={guide.start.x}
        y1={guide.start.y}
        x2={guide.end.x}
        y2={guide.end.y}
      />
    );
  }

  function renderFixtureDotLine(
    id: string,
    kind: Extract<FixtureLineKind, "dot" | "pixel">,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) {
    return (
      <g className="fixture-dot-line">
        {getLineSamplePoints(start, end, kind === "pixel" ? 18 : 24).map(
          (point, index) => (
            <circle
              className="fixture-dot-line-dot"
              cx={point.x}
              cy={point.y}
              key={`${id}-${index}`}
              r="3"
            />
          )
        )}
      </g>
    );
  }

  function renderFixtureDirectionAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixtureDirection" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelPosition = getEndpointLabelPosition(
      annotation.label,
      annotation.targetX,
      annotation.targetY
    );
    const groupClassName = isSelected
      ? "annotation-node annotation-fixture-direction is-selected"
      : "annotation-node annotation-fixture-direction";

    return (
      <g
        className={groupClassName}
        data-annotation-id={annotation.id}
        data-annotation-kind="fixture-direction"
        data-fixture={annotation.fixture}
        key={annotation.id}
        style={getFixtureStyle(annotation.fixture)}
        onPointerDown={(event) => handleAnnotationPointerDown(annotation.id, event)}
      >
        <circle className="fixture-point-hit" cx={annotation.x} cy={annotation.y} r="12" />
        <line
          className="fixture-direction-hit"
          x1={annotation.x}
          y1={annotation.y}
          x2={annotation.targetX}
          y2={annotation.targetY}
        />
        <line
          className="fixture-direction-line"
          markerEnd="url(#fixture-arrow)"
          x1={annotation.x}
          y1={annotation.y}
          x2={annotation.targetX}
          y2={annotation.targetY}
        />
        <circle className="fixture-point-pulse" cx={annotation.x} cy={annotation.y} r="6" />
        <circle className="fixture-point" cx={annotation.x} cy={annotation.y} r="3.5" />
        <circle className="fixture-direction-target" cx={annotation.targetX} cy={annotation.targetY} r="2" />
        <text
          className="annotation-svg-label"
          transform={getLabelTransform(labelPosition.x, labelPosition.y)}
          x={labelPosition.x}
          y={labelPosition.y}
        >
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderFixturePointAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixturePoint" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelPosition = getEndpointLabelPosition(
      annotation.label,
      annotation.x,
      annotation.y
    );
    const groupClassName = isSelected
      ? "annotation-node annotation-fixture-point is-selected"
      : "annotation-node annotation-fixture-point";

    return (
      <g
        className={groupClassName}
        data-annotation-id={annotation.id}
        data-annotation-kind="fixture-point"
        data-fixture={annotation.fixture}
        key={annotation.id}
        style={getFixtureStyle(annotation.fixture)}
        onPointerDown={(event) => handleAnnotationPointerDown(annotation.id, event)}
      >
        <circle className="fixture-point-hit" cx={annotation.x} cy={annotation.y} r="12" />
        <circle className="fixture-point-pulse" cx={annotation.x} cy={annotation.y} r="6" />
        <circle className="fixture-point" cx={annotation.x} cy={annotation.y} r="3.5" />
        <text
          className="annotation-svg-label"
          transform={getLabelTransform(labelPosition.x, labelPosition.y)}
          x={labelPosition.x}
          y={labelPosition.y}
        >
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderFixtureAreaAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixtureArea" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelPosition = getEndpointLabelPosition(
      annotation.label,
      annotation.x + annotation.width,
      annotation.y
    );
    const groupClassName = isSelected
      ? "annotation-node annotation-fixture-area is-selected"
      : "annotation-node annotation-fixture-area";

    return (
      <g
        className={groupClassName}
        data-annotation-id={annotation.id}
        data-annotation-kind="fixture-area"
        data-fixture={annotation.fixture}
        key={annotation.id}
        style={getFixtureStyle(annotation.fixture)}
        onPointerDown={(event) => handleAnnotationPointerDown(annotation.id, event)}
      >
        <rect
          className="annotation-area-hit"
          x={annotation.x - 8}
          y={annotation.y - 8}
          width={annotation.width + 16}
          height={annotation.height + 16}
          rx="6"
        />
        <rect
          className="annotation-area-rect"
          x={annotation.x}
          y={annotation.y}
          width={annotation.width}
          height={annotation.height}
          rx="4"
        />
        {isSelected ? (
          <>
            <rect
              className="annotation-selection-outline"
              x={annotation.x - 4}
              y={annotation.y - 4}
              width={annotation.width + 8}
              height={annotation.height + 8}
              rx="5"
            />
            <circle className="annotation-handle" cx={annotation.x} cy={annotation.y} r="3.5" />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y}
              r="3.5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x}
              cy={annotation.y + annotation.height}
              r="3.5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y + annotation.height}
              r="3.5"
            />
          </>
        ) : null}
        <text
          className="annotation-svg-label"
          transform={getLabelTransform(labelPosition.x, labelPosition.y)}
          x={labelPosition.x}
          y={labelPosition.y}
        >
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderAnnotation(annotation: CanvasAnnotationItem) {
    if (annotation.type === "area") {
      return renderAreaAnnotation(annotation);
    }

    if (annotation.type === "fixtureLine") {
      return renderFixtureLineAnnotation(annotation);
    }

    if (annotation.type === "fixtureDirection") {
      return renderFixtureDirectionAnnotation(annotation);
    }

    if (annotation.type === "fixturePoint") {
      return renderFixturePointAnnotation(annotation);
    }

    return renderFixtureAreaAnnotation(annotation);
  }

  function renderDraftFixture() {
    if (!draftFixture) {
      return null;
    }

    if (isWashDirectionDraft(draftFixture)) {
      const guide = buildWashGuideFromDirection(draftFixture, {
        x: draftFixture.currentX,
        y: draftFixture.currentY
      });

      return (
        <g
          className="annotation-draft annotation-fixture-line fixture-line-wash is-setting-direction"
          style={getFixtureStyle(draftFixture.fixture)}
        >
          <line
            className="fixture-line-path"
            x1={draftFixture.lineStartX}
            y1={draftFixture.lineStartY}
            x2={draftFixture.lineEndX}
            y2={draftFixture.lineEndY}
          />
          {renderWashDirectionGuide(guide)}
        </g>
      );
    }

    if (draftFixture.mode === "line" && draftFixture.kind) {
      const isDotLine = draftFixture.kind === "dot" || draftFixture.kind === "pixel";

      return (
        <g
          className={`annotation-draft annotation-fixture-line fixture-line-${draftFixture.kind}`}
          style={getFixtureStyle(draftFixture.fixture)}
        >
          {isDotLine ? (
            <g className="fixture-dot-line">
              {getLineSamplePoints(
                { x: draftFixture.startX, y: draftFixture.startY },
                { x: draftFixture.currentX, y: draftFixture.currentY },
                draftFixture.kind === "pixel" ? 18 : 24
              ).map((point, index) => (
                <circle
                  className="fixture-dot-line-dot"
                  cx={point.x}
                  cy={point.y}
                  key={`${draftFixture.fixture}-${index}`}
                  r="3"
                />
              ))}
            </g>
          ) : (
            <line
              className="fixture-line-path"
              x1={draftFixture.startX}
              y1={draftFixture.startY}
              x2={draftFixture.currentX}
              y2={draftFixture.currentY}
            />
          )}
        </g>
      );
    }

    if (draftFixture.mode === "area") {
      const area = normalizeFixtureArea(draftFixture);

      return (
        <g
          className="annotation-draft annotation-fixture-area"
          style={getFixtureStyle(draftFixture.fixture)}
        >
          <rect
            className="annotation-area-rect"
            x={area.x}
            y={area.y}
            width={area.width}
            height={area.height}
            rx="4"
          />
        </g>
      );
    }

    if (draftFixture.mode === "point") {
      return (
        <g
          className="annotation-draft annotation-fixture-point"
          style={getFixtureStyle(draftFixture.fixture)}
        >
          <circle
            className="fixture-point-pulse"
            cx={draftFixture.startX}
            cy={draftFixture.startY}
            r="8"
          />
          <circle className="fixture-point" cx={draftFixture.startX} cy={draftFixture.startY} r="3.5" />
        </g>
      );
    }

    return (
      <g
        className="annotation-draft annotation-fixture-direction"
        style={getFixtureStyle(draftFixture.fixture)}
      >
        <line
          className="fixture-direction-line"
          markerEnd="url(#fixture-arrow)"
          x1={draftFixture.startX}
          y1={draftFixture.startY}
          x2={draftFixture.currentX}
          y2={draftFixture.currentY}
        />
        <circle className="fixture-point" cx={draftFixture.startX} cy={draftFixture.startY} r="3.5" />
      </g>
    );
  }

  const draftAreaRect = draftArea ? normalizeArea(draftArea) : null;
  const activeResultViewMode = hasResult ? resultViewMode : "source";
  const showGeneratedImage = hasResult && activeResultViewMode !== "source";
  const showCompareLayer = hasResult && activeResultViewMode === "compare";
  const showAnnotationLayer = !hasResult || activeResultViewMode === "source";
  const annotationLayerClassName = [
    "annotation-layer",
    activeTool === "标注灯位" ? "is-marking" : "",
    isAreaTool(activeTool) ? "is-box-selecting" : "",
    canvasView.scale > 1 ? "is-pannable" : "",
    panState ? "is-panning" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const imageFrameClassName = [
    "image-frame",
    hasSource ? "" : "is-empty",
    hasSource && canvasView.scale > 1 ? "is-pannable" : "",
    panState ? "is-panning" : ""
  ]
    .filter(Boolean)
    .join(" ");
  const canvasViewportStyle: CSSProperties = {
    transform: `translate3d(${canvasView.x}px, ${canvasView.y}px, 0) scale(${canvasView.scale})`
  };

  if (imageSize && frameSize && imageSize.width > 0 && imageSize.height > 0) {
    const imageRatio = imageSize.width / imageSize.height;
    const frameRatio = frameSize.width / frameSize.height;
    const fittedWidth =
      frameRatio > imageRatio ? frameSize.height * imageRatio : frameSize.width;
    const fittedHeight =
      frameRatio > imageRatio ? frameSize.height : frameSize.width / imageRatio;

    canvasViewportStyle.width = `${fittedWidth}px`;
    canvasViewportStyle.height = `${fittedHeight}px`;
    canvasViewportStyle.left = `${(frameSize.width - fittedWidth) / 2}px`;
    canvasViewportStyle.top = `${(frameSize.height - fittedHeight) / 2}px`;
  }

  return (
    <main className="canvas-shell">
      <div className="canvas-head">
        <div>
          <h1>编辑器</h1>
          <p>上传主图后可标注灯位、锁定结构，最终生成夜景效果图</p>
        </div>
      </div>

      <div className="canvas-board">
        <div className="canvas-control-row">
          <div className="canvas-toolbar" aria-label="画布工具">
            <label
              className="fixture-select-control"
              style={getFixtureStyle(activeFixture)}
            >
              <span className="fixture-color-dot" aria-hidden="true" />
              <span className="visually-hidden">选择灯具类型</span>
              <select
                aria-label="选择灯具类型"
                value={activeFixture}
                onChange={(event) => {
                  onFixtureChange(event.currentTarget.value);
                }}
              >
                {fixtureGroups.map((group) => (
                  <optgroup key={group.title} label={group.title}>
                    {group.items.map((fixture) => (
                      <option key={fixture} value={fixture}>
                        {fixture}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <ChevronDown size={14} aria-hidden="true" />
            </label>
            {toolIcons.map(({ tool, icon: Icon }) => (
              <button
                className={tool === activeTool ? "tool-button is-active" : "tool-button"}
                key={tool}
                type="button"
                onClick={() => onToolChange(activeTool === tool ? "查看" : tool)}
                title={tool}
                aria-label={tool}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{tool}</span>
              </button>
            ))}
            <button
              aria-label="删除选中标注"
              className="tool-button danger"
              disabled={!selectedAnnotationId}
              onClick={deleteSelectedAnnotation}
              title="删除选中标注"
              type="button"
            >
              <Trash2 size={16} aria-hidden="true" />
              <span>删除</span>
            </button>
            <button
              aria-label="全部删除标注"
              className="tool-button danger"
              disabled={annotationItems.length === 0}
              onClick={deleteAllAnnotations}
              title="全部删除标注"
              type="button"
            >
              <Eraser size={16} aria-hidden="true" />
              <span>全部删除</span>
            </button>
          </div>

          <div className="canvas-control-cluster">
            <div className="canvas-zoom-controls" aria-label="画布缩放">
              <button
                aria-label="缩小画布"
                className="icon-button compact"
                disabled={!hasSource}
                onClick={() => updateCanvasScale(canvasView.scale * 0.85)}
                title="缩小画布"
                type="button"
              >
                <ZoomOut size={15} aria-hidden="true" />
              </button>
              <span className="zoom-value">{toPercent(canvasView.scale)}</span>
              <button
                aria-label="放大画布"
                className="icon-button compact"
                disabled={!hasSource}
                onClick={() => updateCanvasScale(canvasView.scale * 1.18)}
                title="放大画布"
                type="button"
              >
                <ZoomIn size={15} aria-hidden="true" />
              </button>
              <button
                aria-label="适应窗口完整显示"
                className="view-fit-button"
                disabled={!hasSource}
                onClick={resetCanvasView}
                title="适应窗口完整显示"
                type="button"
              >
                <Maximize2 size={14} aria-hidden="true" />
                适应
              </button>
            </div>
            {hasResult ? (
              <div className="result-view-controls" aria-label="结果查看模式">
                {[
                  { id: "generated" as const, label: "生成图" },
                  { id: "compare" as const, label: "对比原图" },
                  { id: "source" as const, label: "显示原图" }
                ].map((mode) => (
                  <button
                    className={
                      activeResultViewMode === mode.id
                        ? "view-mode-button is-active"
                        : "view-mode-button"
                    }
                    key={mode.id}
                    type="button"
                    onClick={() => setResultViewMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={imageFrameClassName}
          ref={imageFrameRef}
          onPointerCancel={handleImageFramePointerUp}
          onPointerDown={handleImageFramePointerDown}
          onPointerMove={handleImageFramePointerMove}
          onPointerUp={handleImageFramePointerUp}
        >
          {hasSource ? (
            <>
              <div
                ref={viewportContentRef}
                className={
                  hasResult
                    ? "canvas-viewport-content has-result-preview"
                    : "canvas-viewport-content"
                }
                style={canvasViewportStyle}
              >
                <img
                  className="render-image source-image"
                  src={sourceImageUrl}
                  alt="用户上传的主图"
                  onLoad={handleSourceImageLoad}
                />
                {showGeneratedImage ? (
                  <>
                    <img
                      className="render-image generated"
                      src={resultImageUrl}
                      alt="生成后的夜景测试预览"
                    />
                  </>
                ) : null}
                {showCompareLayer ? (
                  <>
                    <img
                      className="render-image before-layer"
                      src={sourceImageUrl}
                      alt=""
                      style={{ clipPath: `inset(0 ${100 - compare}% 0 0)` }}
                      aria-hidden="true"
                    />
                    <div
                      aria-label="拖动查看原图与生成图对比"
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={Math.round(compare)}
                      className={
                        isCompareDragging ? "compare-line is-dragging" : "compare-line"
                      }
                      onKeyDown={handleCompareKeyDown}
                      onPointerCancel={handleComparePointerUp}
                      onPointerDown={handleComparePointerDown}
                      onPointerMove={handleComparePointerMove}
                      onPointerUp={handleComparePointerUp}
                      role="slider"
                      style={{ left: `${compare}%` }}
                      tabIndex={0}
                    >
                      <span className="compare-handle" aria-hidden="true" />
                    </div>
                  </>
                ) : null}

                {showAnnotationLayer ? (
                  <svg
                    aria-label="画布标注层"
                    className={annotationLayerClassName}
                    ref={svgRef}
                    role="group"
                    preserveAspectRatio="none"
                    viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
                    onPointerDown={handleAnnotationCanvasPointerDown}
                    onPointerCancel={handleAnnotationPointerUp}
                    onPointerMove={handleAnnotationPointerMove}
                    onPointerUp={handleAnnotationPointerUp}
                  >
                    <defs>
                      <marker
                        id="fixture-arrow"
                        markerHeight="3"
                        markerWidth="3"
                        orient="auto"
                        refX="2.65"
                        refY="1.5"
                        viewBox="0 0 3 3"
                      >
                        <path className="fixture-arrow-head" d="M0 0 L3 1.5 L0 3 Z" />
                      </marker>
                    </defs>
                    {annotationItems.map(renderAnnotation)}
                    {draftArea && draftAreaRect ? (
                      <g className={`annotation-draft area-${draftArea.kind}`}>
                        <rect
                          className="annotation-area-rect"
                          x={draftAreaRect.x}
                          y={draftAreaRect.y}
                          width={draftAreaRect.width}
                          height={draftAreaRect.height}
                          rx="4"
                        />
                      </g>
                    ) : null}
                    {renderDraftFixture()}
                  </svg>
                ) : (
                  <svg
                    aria-hidden="true"
                    className="annotation-layer is-hidden"
                    ref={svgRef}
                    preserveAspectRatio="none"
                    viewBox={`0 0 ${viewBox.width} ${viewBox.height}`}
                  />
                )}
              </div>

              {isGenerating ? (
                <GeneratingNightOverlay />
              ) : null}

            </>
          ) : (
            <>
              <button
                className="empty-canvas-state"
                type="button"
                onClick={() => emptyUploadInputRef.current?.click()}
              >
                <div className="empty-canvas-mark" aria-hidden="true">
                  <ImagePlus size={26} />
                </div>
                <h2>上传主图开始生成夜景</h2>
                <p>支持建筑、景观、室内和装置照片。上传后可标注灯位并设置生成参数。</p>
                <div className="empty-canvas-steps">
                  <span>1 上传主图</span>
                  <span>2 选择参考风格</span>
                  <span>3 标注灯光区域</span>
                </div>
              </button>
              <input
                ref={emptyUploadInputRef}
                className="visually-hidden"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) {
                    onPrimaryImageUpload(file);
                    event.currentTarget.value = "";
                  }
                }}
              />
            </>
          )}
        </div>

        {hasSource && !hasResult ? (
          <div className="result-pending" role="status">
            <Lightbulb size={15} aria-hidden="true" />
            {draftFixture && isWashDirectionDraft(draftFixture)
              ? "洗墙灯：拖拽确定洗墙方向"
              : activeTool === "标注灯位"
              ? getFixtureGuide(activeFixture)
              : "原图已就绪，点击“标注灯位”后可在图上标注"}
          </div>
        ) : null}

        {showCompareLayer ? (
          <div className="compare-control">
          <input
            aria-label="前后对比滑杆"
            type="range"
            min="0"
            max="100"
            value={compare}
            onChange={(event) => setCompare(Number(event.currentTarget.value))}
          />
          </div>
        ) : null}
      </div>
    </main>
  );
}

export const CanvasStage = memo(CanvasStageComponent);
