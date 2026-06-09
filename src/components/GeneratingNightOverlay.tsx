interface GeneratingNightOverlayProps {
  className?: string;
}

export function GeneratingNightOverlay({ className }: GeneratingNightOverlayProps) {
  const overlayClassName = ["canvas-generating-overlay", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={overlayClassName} role="status">
      <div className="canvas-generating-card">
        <div className="generating-z-mark" aria-hidden="true">
          <img className="generating-z-base" src="/generating-z-icon.png" alt="" />
          <img className="generating-z-glow z-back" src="/generating-z-back.png" alt="" />
          <img className="generating-z-glow z-front" src="/generating-z-front.png" alt="" />
        </div>
        <p>正在生成夜景效果图...</p>
      </div>
    </div>
  );
}
