import {
  Check,
  ChevronDown,
  FileImage,
  ImagePlus,
  Layers2,
  Map,
  Palette,
  Trash2
} from "lucide-react";
import { useState } from "react";
import { styleReferences } from "../data";
import type {
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
  references: ReferenceImage[];
  selectedStyleId: string;
  onRemoveUpload: (id: string) => void;
  onStyleSelect: (style: StyleReference) => void;
  onUpload: (id: string, file: File) => void;
}

export function LeftPanel({
  references,
  selectedStyleId,
  onRemoveUpload,
  onStyleSelect,
  onUpload
}: LeftPanelProps) {
  const [dropTargetId, setDropTargetId] = useState<string>();
  const primaryReferences = references.filter((reference) => reference.role === "primary");
  const visualReferences = references.filter((reference) => reference.role !== "primary");

  return (
    <aside className="panel left-panel" aria-label="项目与素材">
      <div className="panel-head">
        <div>
          <h2>项目素材</h2>
          <p>上传主图，再选择场景参考。</p>
        </div>
      </div>

      <div className="upload-list">
        {primaryReferences.map((reference) => {
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
              {reference.status === "ready" ? (
                <div className="upload-actions">
                  <button
                    className="upload-remove-button"
                    type="button"
                    aria-label={`删除${reference.label}`}
                    title={`删除${reference.label}`}
                    onClick={() => onRemoveUpload(reference.id)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              ) : null}
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
          {styleReferences.map((style) => {
            const isSelected = style.id === selectedStyleId;
            const hasPlaceholderMenu = style.id === "scene-facade" || style.id === "scene-outdoor";

            return (
              <button
                aria-pressed={isSelected}
                className={
                  isSelected
                    ? `style-reference-card scene-${style.tone} ${hasPlaceholderMenu ? "has-menu" : ""} is-active`
                    : `style-reference-card scene-${style.tone} ${hasPlaceholderMenu ? "has-menu" : ""}`
                }
                key={style.id}
                type="button"
                onClick={() => onStyleSelect(style)}
              >
                <span className="style-copy">
                  <strong>{style.title}</strong>
                  <small>{style.subtitle}</small>
                </span>
                {hasPlaceholderMenu ? (
                  <span className="scene-reference-menu-placeholder" aria-hidden="true">
                    <span />
                    <ChevronDown size={14} aria-hidden="true" />
                  </span>
                ) : null}
                {isSelected ? (
                  <span className="style-selected-indicator">
                    <Check size={12} aria-hidden="true" />
                    已选
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="reference-upload-panel" aria-label="添加参考图">
        <div className="section-title">添加参考图</div>
        <div className="reference-upload-grid">
          {visualReferences.map((reference) => {
            const previewUrl = reference.previewUrl ?? "";

            return (
              <div
                className={
                  dropTargetId === reference.id
                    ? "reference-upload-card is-drop-target"
                    : "reference-upload-card"
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

                  if (file?.type.startsWith("image/")) {
                    onUpload(reference.id, file);
                  }
                }}
              >
                <label className="reference-upload-box" htmlFor={`upload-${reference.id}`}>
                  {previewUrl ? (
                    <img src={previewUrl} alt={reference.label} />
                  ) : (
                    <span>
                      <ImagePlus size={24} aria-hidden="true" />
                      <strong>{reference.label}</strong>
                      <small>{reference.hint}</small>
                    </span>
                  )}
                </label>
                {reference.status === "ready" ? (
                  <button
                    className="reference-remove-button"
                    type="button"
                    aria-label={`删除${reference.label}`}
                    title={`删除${reference.label}`}
                    onClick={() => onRemoveUpload(reference.id)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                ) : null}
                <input
                  id={`upload-${reference.id}`}
                  className="visually-hidden"
                  type="file"
                  accept="image/*"
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
      </section>
    </aside>
  );
}
