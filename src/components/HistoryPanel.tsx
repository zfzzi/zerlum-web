import { Maximize2, X } from "lucide-react";
import {
  memo,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { createPortal } from "react-dom";
import type { GenerationHistoryItem } from "../types/nightRender";

interface HistoryPanelProps {
  history: GenerationHistoryItem[];
}

interface LightboxTransform {
  scale: number;
  x: number;
  y: number;
}

interface LightboxDragState {
  pointerId: number;
  clientX: number;
  clientY: number;
}

const DEFAULT_LIGHTBOX_TRANSFORM: LightboxTransform = {
  scale: 1,
  x: 0,
  y: 0
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function HistoryPanelComponent({ history }: HistoryPanelProps) {
  const [expandedHistoryItem, setExpandedHistoryItem] =
    useState<GenerationHistoryItem | null>(null);
  const [lightboxTransform, setLightboxTransform] = useState<LightboxTransform>(
    DEFAULT_LIGHTBOX_TRANSFORM
  );
  const [isLightboxDragging, setIsLightboxDragging] = useState(false);
  const lightboxMediaRef = useRef<HTMLDivElement | null>(null);
  const lightboxImageRef = useRef<HTMLImageElement | null>(null);
  const lightboxTransformRef = useRef<LightboxTransform>(DEFAULT_LIGHTBOX_TRANSFORM);
  const lightboxDragStateRef = useRef<LightboxDragState | null>(null);
  const lightboxWheelFrameRef = useRef<number | null>(null);
  const lightboxPanFrameRef = useRef<number | null>(null);
  const pendingLightboxWheelDeltaRef = useRef(0);
  const pendingLightboxPanDeltaRef = useRef({ x: 0, y: 0 });

  function setLightboxTransformImmediate(nextTransform: LightboxTransform) {
    lightboxTransformRef.current = nextTransform;
    setLightboxTransform(nextTransform);
  }

  function constrainLightboxTransform(transform: LightboxTransform): LightboxTransform {
    const scale = clamp(transform.scale, 1, 4);

    if (scale <= 1) {
      return { ...DEFAULT_LIGHTBOX_TRANSFORM };
    }

    const mediaElement = lightboxMediaRef.current;
    const imageElement = lightboxImageRef.current;

    if (!mediaElement || !imageElement) {
      return {
        scale,
        x: transform.x,
        y: transform.y
      };
    }

    const mediaBounds = mediaElement.getBoundingClientRect();
    const imageWidth = imageElement.offsetWidth || imageElement.naturalWidth || 0;
    const imageHeight = imageElement.offsetHeight || imageElement.naturalHeight || 0;
    const maxX = Math.max(0, (imageWidth * scale - mediaBounds.width) / 2);
    const maxY = Math.max(0, (imageHeight * scale - mediaBounds.height) / 2);

    return {
      scale,
      x: clamp(transform.x, -maxX, maxX),
      y: clamp(transform.y, -maxY, maxY)
    };
  }

  function updateLightboxTransform(
    updater: (currentTransform: LightboxTransform) => LightboxTransform
  ) {
    const nextTransform = constrainLightboxTransform(
      updater(lightboxTransformRef.current)
    );
    setLightboxTransformImmediate(nextTransform);
  }

  function applyPendingLightboxWheel() {
    const pendingDelta = pendingLightboxWheelDeltaRef.current;
    pendingLightboxWheelDeltaRef.current = 0;
    lightboxWheelFrameRef.current = null;

    if (pendingDelta === 0) {
      return;
    }

    const zoomFactor = Math.exp(-pendingDelta * 0.001);

    updateLightboxTransform((currentTransform) => ({
      ...currentTransform,
      scale: Number((currentTransform.scale * zoomFactor).toFixed(4))
    }));
  }

  function applyPendingLightboxPan() {
    const pendingDelta = pendingLightboxPanDeltaRef.current;
    pendingLightboxPanDeltaRef.current = { x: 0, y: 0 };
    lightboxPanFrameRef.current = null;

    if (pendingDelta.x === 0 && pendingDelta.y === 0) {
      return;
    }

    updateLightboxTransform((currentTransform) => {
      if (currentTransform.scale <= 1) {
        return currentTransform;
      }

      return {
        ...currentTransform,
        x: currentTransform.x + pendingDelta.x,
        y: currentTransform.y + pendingDelta.y
      };
    });
  }

  function scheduleLightboxPan(deltaX: number, deltaY: number) {
    if (Math.abs(deltaX) < 0.4 && Math.abs(deltaY) < 0.4) {
      return;
    }

    pendingLightboxPanDeltaRef.current.x += deltaX;
    pendingLightboxPanDeltaRef.current.y += deltaY;

    if (lightboxPanFrameRef.current === null) {
      lightboxPanFrameRef.current = requestAnimationFrame(applyPendingLightboxPan);
    }
  }

  function resetLightboxInteraction() {
    if (lightboxWheelFrameRef.current !== null) {
      cancelAnimationFrame(lightboxWheelFrameRef.current);
      lightboxWheelFrameRef.current = null;
    }

    if (lightboxPanFrameRef.current !== null) {
      cancelAnimationFrame(lightboxPanFrameRef.current);
      lightboxPanFrameRef.current = null;
    }

    pendingLightboxWheelDeltaRef.current = 0;
    pendingLightboxPanDeltaRef.current = { x: 0, y: 0 };
    lightboxDragStateRef.current = null;
    setIsLightboxDragging(false);
    setLightboxTransformImmediate({ ...DEFAULT_LIGHTBOX_TRANSFORM });
  }

  useEffect(() => {
    if (!expandedHistoryItem) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedHistoryItem(null);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [expandedHistoryItem]);

  useEffect(() => {
    resetLightboxInteraction();
  }, [expandedHistoryItem?.id]);

  useEffect(
    () => () => {
      if (lightboxWheelFrameRef.current !== null) {
        cancelAnimationFrame(lightboxWheelFrameRef.current);
      }

      if (lightboxPanFrameRef.current !== null) {
        cancelAnimationFrame(lightboxPanFrameRef.current);
      }
    },
    []
  );

  useEffect(() => {
    const mediaElement = lightboxMediaRef.current;

    if (!expandedHistoryItem || !mediaElement) {
      return;
    }

    function handleLightboxWheel(event: WheelEvent) {
      event.preventDefault();
      event.stopPropagation();

      pendingLightboxWheelDeltaRef.current += event.deltaY;

      if (lightboxWheelFrameRef.current === null) {
        lightboxWheelFrameRef.current = requestAnimationFrame(applyPendingLightboxWheel);
      }
    }

    mediaElement.addEventListener("wheel", handleLightboxWheel, { passive: false });

    return () => {
      mediaElement.removeEventListener("wheel", handleLightboxWheel);
    };
  }, [expandedHistoryItem]);

  function handleLightboxPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || lightboxTransformRef.current.scale <= 1) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    lightboxDragStateRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
    setIsLightboxDragging(true);
  }

  function handleLightboxPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = lightboxDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaX = event.clientX - dragState.clientX;
    const deltaY = event.clientY - dragState.clientY;
    lightboxDragStateRef.current = {
      ...dragState,
      clientX: event.clientX,
      clientY: event.clientY
    };
    scheduleLightboxPan(deltaX, deltaY);
  }

  function finishLightboxDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const dragState = lightboxDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    lightboxDragStateRef.current = null;
    setIsLightboxDragging(false);
  }

  const lightboxMediaClassName = [
    "history-lightbox-media",
    lightboxTransform.scale > 1 ? "is-zoomed" : "",
    isLightboxDragging ? "is-dragging" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const lightbox =
    expandedHistoryItem && typeof document !== "undefined"
      ? createPortal(
          <div
            className="history-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={expandedHistoryItem.title}
            onClick={() => setExpandedHistoryItem(null)}
          >
            <div className="history-lightbox-card" onClick={(event) => event.stopPropagation()}>
              <button
                className="history-lightbox-close"
                type="button"
                aria-label="关闭预览"
                onClick={() => setExpandedHistoryItem(null)}
              >
                <X size={18} aria-hidden="true" />
              </button>
              <div
                className={lightboxMediaClassName}
                ref={lightboxMediaRef}
                onPointerDown={handleLightboxPointerDown}
                onPointerMove={handleLightboxPointerMove}
                onPointerUp={finishLightboxDrag}
                onPointerCancel={finishLightboxDrag}
              >
                <img
                  ref={lightboxImageRef}
                  src={expandedHistoryItem.imageUrl}
                  alt={expandedHistoryItem.title}
                  draggable={false}
                  style={{
                    transform: `translate3d(${lightboxTransform.x}px, ${lightboxTransform.y}px, 0) scale(${lightboxTransform.scale})`
                  }}
                />
              </div>
              <div className="history-lightbox-meta">
                <strong>{expandedHistoryItem.title}</strong>
                <span>
                  {expandedHistoryItem.outputSize} · {expandedHistoryItem.createdAt}
                </span>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <section className="history-panel" aria-label="生成历史记录">
      <div className="section-title">生成历史</div>
      {history.length > 0 ? (
        <div className="history-grid">
          {history.map((item) => (
            <button
              className="history-thumb"
              key={item.id}
              type="button"
              onClick={() => setExpandedHistoryItem(item)}
            >
              <img src={item.imageUrl} alt={item.title} />
              <span>
                <strong>{item.title}</strong>
                <small>
                  {item.outputSize} · {item.createdAt}
                </small>
              </span>
              <Maximize2 size={13} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : (
        <div className="history-empty" role="status">
          <span>生成完成后会在这里显示缩略图。</span>
        </div>
      )}

      {lightbox}
    </section>
  );
}

export const HistoryPanel = memo(HistoryPanelComponent);
