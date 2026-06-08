import { Maximize2, X } from "lucide-react";
import { useState } from "react";
import type { GenerationHistoryItem } from "../types/nightRender";

interface HistoryPanelProps {
  history: GenerationHistoryItem[];
}

export function HistoryPanel({ history }: HistoryPanelProps) {
  const [expandedHistoryItem, setExpandedHistoryItem] =
    useState<GenerationHistoryItem | null>(null);

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

      {expandedHistoryItem ? (
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
              <X size={16} aria-hidden="true" />
            </button>
            <img src={expandedHistoryItem.imageUrl} alt={expandedHistoryItem.title} />
            <div>
              <strong>{expandedHistoryItem.title}</strong>
              <span>
                {expandedHistoryItem.outputSize} · {expandedHistoryItem.createdAt}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
