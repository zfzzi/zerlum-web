import {
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent,
  type SyntheticEvent,
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

interface CanvasStageProps {
  activeFixture: string;
  activeTool: CanvasTool;
  generationMessage?: string;
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

type AreaTool = Extract<CanvasTool, "局部重绘" | "遮罩选择" | "禁止修改">;
type AreaKind = "repaint" | "mask" | "avoid";
type FixtureLineKind = "wash" | "linear";
type FixtureMarkMode = "line" | "direction" | "point" | "area";
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
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
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

function distance(x1: number, y1: number, x2: number, y2: number) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function labelWidth(label: string) {
  return Math.max(70, label.length * 12 + 18);
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

  return undefined;
}

function getFixtureMarkMode(fixture: string): FixtureMarkMode {
  if (getFixtureLineKind(fixture)) {
    return "line";
  }

  if (fixture === "点光源") {
    return "point";
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

  if (fixture === "点光源") {
    return "点光源：点击布置发光点位";
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
  const x = Math.min(draft.startX, draft.currentX);
  const y = Math.min(draft.startY, draft.currentY);
  const width = Math.abs(draft.currentX - draft.startX);
  const height = Math.abs(draft.currentY - draft.startY);

  return {
    x: clamp(x, 8, viewBox.width - 8),
    y: clamp(y, 56, viewBox.height - 8),
    width,
    height
  };
}

function normalizeFixtureArea(draft: DraftFixture) {
  const x = Math.min(draft.startX, draft.currentX);
  const y = Math.min(draft.startY, draft.currentY);
  const width = Math.abs(draft.currentX - draft.startX);
  const height = Math.abs(draft.currentY - draft.startY);

  return {
    x: clamp(x, 8, viewBox.width - 8),
    y: clamp(y, 56, viewBox.height - 8),
    width,
    height
  };
}

function moveAnnotation(
  annotation: CanvasAnnotationItem,
  deltaX: number,
  deltaY: number
): CanvasAnnotationItem {
  if (annotation.type === "area") {
    return {
      ...annotation,
      x: clamp(annotation.x + deltaX, 8, viewBox.width - annotation.width - 8),
      y: clamp(annotation.y + deltaY, 56, viewBox.height - annotation.height - 8)
    };
  }

  if (annotation.type === "fixtureLine") {
    return {
      ...annotation,
      x1: clamp(annotation.x1 + deltaX, 24, viewBox.width - 24),
      y1: clamp(annotation.y1 + deltaY, 72, viewBox.height - 34),
      x2: clamp(annotation.x2 + deltaX, 24, viewBox.width - 24),
      y2: clamp(annotation.y2 + deltaY, 72, viewBox.height - 34)
    };
  }

  if (annotation.type === "fixturePoint") {
    return {
      ...annotation,
      x: clamp(annotation.x + deltaX, 24, viewBox.width - 24),
      y: clamp(annotation.y + deltaY, 72, viewBox.height - 34)
    };
  }

  if (annotation.type === "fixtureArea") {
    return {
      ...annotation,
      x: clamp(annotation.x + deltaX, 8, viewBox.width - annotation.width - 8),
      y: clamp(annotation.y + deltaY, 56, viewBox.height - annotation.height - 8)
    };
  }

  return {
    ...annotation,
    x: clamp(annotation.x + deltaX, 24, viewBox.width - 24),
    y: clamp(annotation.y + deltaY, 72, viewBox.height - 34),
    targetX: clamp(annotation.targetX + deltaX, 24, viewBox.width - 24),
    targetY: clamp(annotation.targetY + deltaY, 72, viewBox.height - 34)
  };
}

export function CanvasStage({
  activeFixture,
  activeTool,
  generationMessage,
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
  const [dragState, setDragState] = useState<{
    id: string;
    lastX: number;
    lastY: number;
  } | null>(null);
  const [panState, setPanState] = useState<{
    lastClientX: number;
    lastClientY: number;
  } | null>(null);
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
    setAnnotationItems([]);
    setSelectedAnnotationId(undefined);
    setDraftArea(null);
    setDraftFixture(null);
    setDragState(null);
    setPanState(null);
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
      const bounds = observedFrame.getBoundingClientRect();
      setFrameSize({
        width: bounds.width,
        height: bounds.height
      });
    }

    updateFrameSize();
    const resizeObserver = new ResizeObserver(updateFrameSize);
    resizeObserver.observe(observedFrame);

    return () => resizeObserver.disconnect();
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
      const zoomFactor = event.deltaY > 0 ? 0.88 : 1.12;

      setCanvasView((current) => ({
        ...current,
        scale: clamp(current.scale * zoomFactor, 0.35, 6)
      }));
    }

    frame.addEventListener("wheel", handleWheel, { passive: false });
    return () => frame.removeEventListener("wheel", handleWheel);
  }, [hasSource]);

  function getSvgPoint(event: PointerEvent<SVGElement>) {
    const bounds = svgRef.current?.getBoundingClientRect();

    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return { x: 0, y: 0 };
    }

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
      y: ((event.clientY - bounds.top) / bounds.height) * viewBox.height
    };
  }

  function resetCanvasView() {
    setCanvasView({
      scale: 1,
      x: 0,
      y: 0
    });
  }

  function updateCanvasScale(nextScale: number) {
    setCanvasView((current) => ({
      ...current,
      scale: clamp(nextScale, 0.35, 6)
    }));
  }

  function handleSourceImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;

    setImageSize({
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height
    });
  }

  function updateCompareFromClientX(clientX: number) {
    const bounds = viewportContentRef.current?.getBoundingClientRect();

    if (!bounds || bounds.width === 0) {
      return;
    }

    const nextCompare = ((clientX - bounds.left) / bounds.width) * 100;
    setCompare(Math.round(clamp(nextCompare, 0, 100)));
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

    if ((event.shiftKey || event.button === 1) && canvasView.scale !== 1) {
      setSelectedAnnotationId(undefined);
      setPanState({
        lastClientX: event.clientX,
        lastClientY: event.clientY
      });
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    const point = getSvgPoint(event);
    setSelectedAnnotationId(id);
    setDragState({ id, lastX: point.x, lastY: point.y });
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function handleAnnotationPointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = getSvgPoint(event);

    if (panState) {
      event.preventDefault();
      const deltaX = event.clientX - panState.lastClientX;
      const deltaY = event.clientY - panState.lastClientY;

      setCanvasView((current) => ({
        ...current,
        x: current.x + deltaX,
        y: current.y + deltaY
      }));
      setPanState({
        lastClientX: event.clientX,
        lastClientY: event.clientY
      });
      return;
    }

    if (dragState) {
      event.preventDefault();
      const deltaX = point.x - dragState.lastX;
      const deltaY = point.y - dragState.lastY;

      setAnnotationItems((current) =>
        current.map((annotation) =>
          annotation.id === dragState.id
            ? moveAnnotation(annotation, deltaX, deltaY)
            : annotation
        )
      );
      setDragState({ ...dragState, lastX: point.x, lastY: point.y });
      return;
    }

    if (draftArea) {
      event.preventDefault();
      setDraftArea({ ...draftArea, currentX: point.x, currentY: point.y });
      return;
    }

    if (draftFixture) {
      event.preventDefault();
      setDraftFixture({ ...draftFixture, currentX: point.x, currentY: point.y });
    }
  }

  function handleAnnotationPointerUp(event: PointerEvent<SVGSVGElement>) {
    if (svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }

    if (draftArea) {
      const area = normalizeArea(draftArea);

      if (area.width >= 18 && area.height >= 18) {
        const sameKindCount =
          annotationItems.filter(
            (annotation) =>
              annotation.type === "area" && annotation.kind === draftArea.kind
          ).length + 1;
        const id = `${draftArea.kind}-${Date.now()}`;

        setAnnotationItems((current) => [
          ...current,
          {
            id,
            type: "area",
            kind: draftArea.kind,
            label: `${draftArea.label} ${sameKindCount}`,
            x: area.x,
            y: area.y,
            width: area.width,
            height: area.height
          }
        ]);
        setSelectedAnnotationId(id);
      }
    }

    if (draftFixture) {
      const length = distance(
        draftFixture.startX,
        draftFixture.startY,
        draftFixture.currentX,
        draftFixture.currentY
      );
      const fixtureCount =
        annotationItems.filter(
          (annotation) =>
            (annotation.type === "fixtureLine" ||
              annotation.type === "fixtureDirection" ||
              annotation.type === "fixturePoint" ||
              annotation.type === "fixtureArea") &&
            annotation.fixture === draftFixture.fixture
        ).length + 1;
      const id = `fixture-${Date.now()}`;

      if (draftFixture.mode === "line" && draftFixture.kind && length >= 18) {
        const lineKind = draftFixture.kind;

        setAnnotationItems((current) => [
          ...current,
          {
            id,
            type: "fixtureLine",
            kind: lineKind,
            fixture: draftFixture.fixture,
            label: `${draftFixture.fixture} ${fixtureCount}`,
            x1: clamp(draftFixture.startX, 24, viewBox.width - 24),
            y1: clamp(draftFixture.startY, 72, viewBox.height - 34),
            x2: clamp(draftFixture.currentX, 24, viewBox.width - 24),
            y2: clamp(draftFixture.currentY, 72, viewBox.height - 34)
          }
        ]);
        setSelectedAnnotationId(id);
      }

      if (draftFixture.mode === "point") {
        setAnnotationItems((current) => [
          ...current,
          {
            id,
            type: "fixturePoint",
            fixture: draftFixture.fixture,
            label: `${draftFixture.fixture} ${fixtureCount}`,
            x: clamp(draftFixture.startX, 24, viewBox.width - 24),
            y: clamp(draftFixture.startY, 72, viewBox.height - 34)
          }
        ]);
        setSelectedAnnotationId(id);
      }

      if (draftFixture.mode === "area") {
        const area = normalizeFixtureArea(draftFixture);

        if (area.width >= 18 && area.height >= 18) {
          setAnnotationItems((current) => [
            ...current,
            {
              id,
              type: "fixtureArea",
              fixture: draftFixture.fixture,
              label: `${draftFixture.fixture} ${fixtureCount}`,
              x: area.x,
              y: area.y,
              width: area.width,
              height: area.height
            }
          ]);
          setSelectedAnnotationId(id);
        }
      }

      if (draftFixture.mode === "direction") {
        const targetX =
          length >= 18 ? draftFixture.currentX : draftFixture.startX + 52;
        const targetY =
          length >= 18 ? draftFixture.currentY : draftFixture.startY - 22;

        setAnnotationItems((current) => [
          ...current,
          {
            id,
            type: "fixtureDirection",
            fixture: draftFixture.fixture,
            label: `${draftFixture.fixture} ${fixtureCount}`,
            x: clamp(draftFixture.startX, 24, viewBox.width - 24),
            y: clamp(draftFixture.startY, 72, viewBox.height - 34),
            targetX: clamp(targetX, 24, viewBox.width - 24),
            targetY: clamp(targetY, 72, viewBox.height - 34)
          }
        ]);
        setSelectedAnnotationId(id);
      }
    }

    setDraftArea(null);
    setDraftFixture(null);
    setDragState(null);
    setPanState(null);
  }

  function handleAnnotationCanvasPointerDown(
    event: PointerEvent<SVGSVGElement>
  ) {
    if (!hasSource || event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    const point = getSvgPoint(event);

    if ((event.shiftKey || event.button === 1) && canvasView.scale !== 1) {
      setSelectedAnnotationId(undefined);
      setDraftArea(null);
      setDraftFixture(null);
      setPanState({
        lastClientX: event.clientX,
        lastClientY: event.clientY
      });
      svgRef.current?.setPointerCapture(event.pointerId);
      return;
    }

    if (activeTool === "标注灯位") {
      const lineKind = getFixtureLineKind(activeFixture);
      setSelectedAnnotationId(undefined);
      setDraftFixture({
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
      setDraftArea({
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
    setDraftArea(null);
    setDraftFixture(null);
    setDragState(null);
  }

  function deleteAllAnnotations() {
    setAnnotationItems([]);
    setSelectedAnnotationId(undefined);
    setDraftArea(null);
    setDraftFixture(null);
    setDragState(null);
  }

  function renderAreaAnnotation(annotation: Extract<CanvasAnnotationItem, { type: "area" }>) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelLength = labelWidth(annotation.label);
    const labelX = clamp(annotation.x + 10, 10, viewBox.width - labelLength - 10);
    const labelY = clamp(annotation.y - 32, 48, viewBox.height - 34);
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
              x={annotation.x - 7}
              y={annotation.y - 7}
              width={annotation.width + 14}
              height={annotation.height + 14}
              rx="7"
            />
            <circle className="annotation-handle" cx={annotation.x} cy={annotation.y} r="5" />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y}
              r="5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x}
              cy={annotation.y + annotation.height}
              r="5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y + annotation.height}
              r="5"
            />
          </>
        ) : null}
        <rect
          className="annotation-text-bg"
          x={labelX}
          y={labelY}
          width={labelLength}
          height="21"
          rx="5"
        />
        <text className="annotation-svg-label" x={labelX + 8} y={labelY + 15}>
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderFixtureLineAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixtureLine" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelLength = labelWidth(annotation.label);
    const midX = (annotation.x1 + annotation.x2) / 2;
    const midY = (annotation.y1 + annotation.y2) / 2;
    const labelX = clamp(midX + 10, 10, viewBox.width - labelLength - 10);
    const labelY = clamp(midY - 34, 52, viewBox.height - 34);
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
        <line
          className="fixture-line-path"
          x1={annotation.x1}
          y1={annotation.y1}
          x2={annotation.x2}
          y2={annotation.y2}
        />
        {isSelected ? (
          <>
            <circle className="annotation-handle" cx={annotation.x1} cy={annotation.y1} r="5" />
            <circle className="annotation-handle" cx={annotation.x2} cy={annotation.y2} r="5" />
          </>
        ) : null}
        <rect
          className="annotation-text-bg"
          x={labelX}
          y={labelY}
          width={labelLength}
          height="21"
          rx="5"
        />
        <text className="annotation-svg-label" x={labelX + 8} y={labelY + 15}>
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderFixtureDirectionAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixtureDirection" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelLength = labelWidth(annotation.label);
    const labelX = clamp(annotation.x + 15, 10, viewBox.width - labelLength - 10);
    const labelY = clamp(annotation.y - 40, 56, viewBox.height - 34);
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
        <circle className="fixture-point-pulse" cx={annotation.x} cy={annotation.y} r="15" />
        <circle className="fixture-point" cx={annotation.x} cy={annotation.y} r="8" />
        <circle className="fixture-direction-target" cx={annotation.targetX} cy={annotation.targetY} r="4" />
        <rect
          className="annotation-text-bg"
          x={labelX}
          y={labelY}
          width={labelLength}
          height="21"
          rx="5"
        />
        <text className="annotation-svg-label" x={labelX + 8} y={labelY + 15}>
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderFixturePointAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixturePoint" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelLength = labelWidth(annotation.label);
    const labelX = clamp(annotation.x + 14, 10, viewBox.width - labelLength - 10);
    const labelY = clamp(annotation.y - 34, 52, viewBox.height - 34);
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
        <circle className="fixture-point-pulse" cx={annotation.x} cy={annotation.y} r="14" />
        <circle className="fixture-point" cx={annotation.x} cy={annotation.y} r="7" />
        <rect
          className="annotation-text-bg"
          x={labelX}
          y={labelY}
          width={labelLength}
          height="21"
          rx="5"
        />
        <text className="annotation-svg-label" x={labelX + 8} y={labelY + 15}>
          {annotation.label}
        </text>
      </g>
    );
  }

  function renderFixtureAreaAnnotation(
    annotation: Extract<CanvasAnnotationItem, { type: "fixtureArea" }>
  ) {
    const isSelected = annotation.id === selectedAnnotationId;
    const labelLength = labelWidth(annotation.label);
    const labelX = clamp(annotation.x + 10, 10, viewBox.width - labelLength - 10);
    const labelY = clamp(annotation.y - 32, 48, viewBox.height - 34);
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
              x={annotation.x - 7}
              y={annotation.y - 7}
              width={annotation.width + 14}
              height={annotation.height + 14}
              rx="7"
            />
            <circle className="annotation-handle" cx={annotation.x} cy={annotation.y} r="5" />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y}
              r="5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x}
              cy={annotation.y + annotation.height}
              r="5"
            />
            <circle
              className="annotation-handle"
              cx={annotation.x + annotation.width}
              cy={annotation.y + annotation.height}
              r="5"
            />
          </>
        ) : null}
        <rect
          className="annotation-text-bg"
          x={labelX}
          y={labelY}
          width={labelLength}
          height="21"
          rx="5"
        />
        <text className="annotation-svg-label" x={labelX + 8} y={labelY + 15}>
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

    if (draftFixture.mode === "line" && draftFixture.kind) {
      return (
        <g
          className={`annotation-draft annotation-fixture-line fixture-line-${draftFixture.kind}`}
          style={getFixtureStyle(draftFixture.fixture)}
        >
          <line
            className="fixture-line-path"
            x1={draftFixture.startX}
            y1={draftFixture.startY}
            x2={draftFixture.currentX}
            y2={draftFixture.currentY}
          />
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
            r="13"
          />
          <circle className="fixture-point" cx={draftFixture.startX} cy={draftFixture.startY} r="7" />
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
        <circle className="fixture-point" cx={draftFixture.startX} cy={draftFixture.startY} r="8" />
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
    isAreaTool(activeTool) ? "is-box-selecting" : ""
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
                  onToolChange("标注灯位");
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
                onClick={() => onToolChange(tool)}
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
          className={hasSource ? "image-frame" : "image-frame is-empty"}
          ref={imageFrameRef}
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
                    onPointerLeave={handleAnnotationPointerUp}
                    onPointerMove={handleAnnotationPointerMove}
                    onPointerUp={handleAnnotationPointerUp}
                  >
                    <defs>
                      <marker
                        id="fixture-arrow"
                        markerHeight="6"
                        markerWidth="6"
                        orient="auto"
                        refX="5"
                        refY="3"
                        viewBox="0 0 6 6"
                      >
                        <path className="fixture-arrow-head" d="M0 0 L6 3 L0 6 Z" />
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
                <div className="canvas-generating-overlay" role="status">
                  <div className="canvas-generating-card">
                    <span className="generating-orb" aria-hidden="true" />
                    <div>
                      <strong>图片正在生成中</strong>
                      <p>{generationMessage || "正在解析画面、匹配灯位并生成夜景效果。"}</p>
                    </div>
                    <div className="generation-progress" aria-hidden="true">
                      <span />
                    </div>
                  </div>
                </div>
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
            {activeTool === "标注灯位"
              ? getFixtureGuide(activeFixture)
              : "原图已就绪，滚轮缩放，按住 Shift 可拖动画布"}
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
