import {
  FileStack,
  Sparkles,
  Send,
  SquareStack
} from "lucide-react";
import { memo } from "react";
import type { ExportRequest, GenerationHistoryItem } from "../types/nightRender";
import { HistoryPanel } from "./HistoryPanel";

const outputSizes: ExportRequest["type"][] = [
  "2K",
  "4K",
  "6K",
  "8K"
];

const renderEngines = [
  { id: "image2" as const, label: "image2" },
  { id: "banana" as const, label: "banana" }
];

interface ApiStatus {
  state: "idle" | "loading" | "error" | "success";
  message: string;
}

interface InspectorPanelProps {
  apiStatus: ApiStatus;
  canExport: boolean;
  canGenerate: boolean;
  history: GenerationHistoryItem[];
  outputSize: ExportRequest["type"];
  prompt: string;
  renderEngine: "image2" | "banana";
  onExport: () => void;
  onGenerate: () => void;
  onOutputSizeChange: (size: ExportRequest["type"]) => void;
  onPromptChange: (prompt: string) => void;
  onRenderEngineChange: (engine: "image2" | "banana") => void;
}

function InspectorPanelComponent({
  apiStatus,
  canExport,
  canGenerate,
  history,
  outputSize,
  prompt,
  renderEngine,
  onExport,
  onGenerate,
  onOutputSizeChange,
  onPromptChange,
  onRenderEngineChange
}: InspectorPanelProps) {
  const isLoading = apiStatus.state === "loading";

  return (
    <aside className="panel inspector" aria-label="照明参数控制">
      <div className="panel-head">
        <div>
          <h2>生成设置</h2>
          <p>提示词、分辨率编辑</p>
        </div>
      </div>

      <section className="control-section output-section">
        <div className="section-title with-icon">
          <Sparkles size={14} aria-hidden="true" />
          出图模型
        </div>
        <div className="render-engine-grid" role="group" aria-label="选择出图模型">
          {renderEngines.map((engine) => (
            <button
              className={engine.id === renderEngine ? "export-button is-active" : "export-button"}
              key={engine.id}
              type="button"
              onClick={() => onRenderEngineChange(engine.id)}
            >
              <Sparkles size={14} aria-hidden="true" />
              {engine.label}
            </button>
          ))}
        </div>
      </section>

      <section className="control-section output-section">
        <div className="section-title with-icon">
          <SquareStack size={14} aria-hidden="true" />
          分辨率
        </div>
        <div className="output-size-grid" role="group" aria-label="选择输出尺寸">
          {outputSizes.map((type) => (
            <button
              className={type === outputSize ? "export-button is-active" : "export-button"}
              key={type}
              type="button"
              onClick={() => onOutputSizeChange(type)}
            >
              <SquareStack size={14} aria-hidden="true" />
              {type}
            </button>
          ))}
        </div>
      </section>

      <section className="control-section prompt-section">
        <div className="section-title">提示词：</div>
        <textarea
          className="prompt-box"
          value={prompt}
          placeholder="请输入提示词"
          rows={6}
          onChange={(event) => onPromptChange(event.currentTarget.value)}
        />
        <div className="prompt-actions">
          <button
            className="primary-button generate-button"
            disabled={!canGenerate || isLoading}
            onClick={onGenerate}
            type="button"
            title={canGenerate ? "生成夜景方案" : "请先上传主图"}
          >
            <Send size={15} aria-hidden="true" />
            {isLoading ? "生成中" : "生成夜景"}
          </button>
        </div>
      </section>

      <section className="control-section export-section">
        <button
          className="primary-button export-primary"
          disabled={!canExport || isLoading}
          type="button"
          onClick={onExport}
          title={canExport ? "导出当前预览图" : "生成预览后可导出"}
        >
          <FileStack size={15} aria-hidden="true" />
          导出当前图
        </button>
      </section>

      <HistoryPanel history={history} />
    </aside>
  );
}

export const InspectorPanel = memo(InspectorPanelComponent);
