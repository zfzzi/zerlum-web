import {
  FileImage,
  ImagePlus,
  Layers2,
  Map,
  Maximize2,
  Palette,
  Trash2,
  X
} from "lucide-react";
import { useState } from "react";
import { styleReferences } from "../data";
import type {
  GenerationHistoryItem,
  ReferenceImage,
  ReferenceImageRole,
  StyleReference
} from "../types/nightRender";

const roleIcons: Record<ReferenceImageRole, typeof FileImage> = {
  primary: ImagePlus,
  tone: Palette,
  fixturePlan: Layers2,
  style: FileImage,
  floorPlan: Map
};

interface LeftPanelProps {
  history: GenerationHistoryItem[];
  references: ReferenceImage[];
  selectedStyleId: string;
  onRemoveUpload: (id: string) => void;
  onStyleSelect: (style: StyleReference) => void;
  onUpload: (id: string, file: File) => void;
}

export function LeftPanel({
  history,
  references,
  selectedStyleId,
  onRemoveUpload,
  onStyleSelect,
  onUpload
}: LeftPanelProps) {
  const [dropTargetId, setDropTargetId] = useState<string>();
  const [expandedHistoryItem, setExpandedHistoryItem] =
    useState<GenerationHistoryItem | null>(null);

  return (
    <aside className="panel left-panel" aria-label="项目与素材">
      <div className="panel-head">
        <div>
          <h2>项目素材</h2>
          <p>上传主图，再选择场景参考。</p>
        </div>
      </div>

      <div className="upload-list">
        {references.map((reference) => {
          const Icon = roleIcons[reference.role];
          const previewUrl = reference.previewUrl ?? "";

          return (
            <div
              className={
                dropTargetId === reference.id
                  ? `upload-card status-${reference.status} is-drop-target`
                  : `upload-card status-${reference.status}`
              }
              key={reference.id}
              onDragEnter={(event) => {
                event.preventDefault();
                setDropTargetId(reference.id);
              }}
              onDragLeave={() => setDropTargetId(undefined)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                setDropTargetId(undefined);
                const file = event.dataTransfer.files?.[0];

                if (file) {
                  onUpload(reference.id, file);
                }
              }}
            >
              <label
                className={`upload-preview preview-${reference.role}`}
                htmlFor={`upload-${reference.id}`}
                aria-hidden="true"
              >
                {previewUrl ? (
                  <img src={previewUrl} alt="" />
                ) : (
                  <Icon size={20} aria-hidden="true" />
                )}
              </label>
              <label className="upload-copy" htmlFor={`upload-${reference.id}`}>
                <strong>{reference.label}</strong>
                <span>{reference.fileName ?? reference.hint}</span>
              </label>
              <div className="upload-actions">
                <label className="upload-action" htmlFor={`upload-${reference.id}`}>
                  {reference.status === "ready" ? "替换" : "上传"}
                </label>
                {reference.status === "ready" ? (
                  <button
                    className="upload-remove-button"
                    type="button"
                    aria-label={`删除${reference.label}`}
                    title={`删除${reference.label}`}
                    onClick={() => onRemoveUpload(reference.id)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
              <input
                id={`upload-${reference.id}`}
                className="visually-hidden"
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) {
                    onUpload(reference.id, file);
                    event.currentTarget.value = "";
                  }
                }}
              />
            </div>
          );
        })}
      </div>

      <section className="style-reference-panel" aria-label="场景参考">
        <div className="section-title">场景参考</div>
        <div className="style-reference-grid">
          {styleReferences.map((style) => (
            <button
              className={
                style.id === selectedStyleId
                  ? `style-reference-card scene-${style.tone} is-active`
                  : `style-reference-card scene-${style.tone}`
              }
              key={style.id}
              type="button"
              onClick={() => onStyleSelect(style)}
            >
              <span className="style-thumb scene-thumb" aria-hidden="true">
                {style.imageUrl ? (
                  <img src={style.imageUrl} alt="" />
                ) : (
                  <>
                    <span className="scene-sky" />
                    <span className="scene-mass scene-mass-a" />
                    <span className="scene-mass scene-mass-b" />
                    <span className="scene-light scene-light-a" />
                    <span className="scene-light scene-light-b" />
                    <span className="scene-ground" />
                  </>
                )}
              </span>
              <span className="style-copy">
                <strong>{style.title}</strong>
                <small>{style.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

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
                  <small>{item.outputSize} · {item.createdAt}</small>
                </span>
                <Maximize2 size={13} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <p className="history-empty">生成完成后会在这里显示缩略图。</p>
        )}
      </section>

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
              <span>{expandedHistoryItem.outputSize} · {expandedHistoryItem.createdAt}</span>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
