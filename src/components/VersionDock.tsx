import {
  Copy,
  Download,
  FileStack,
  GitBranch,
  GitFork,
  RotateCcw,
  SquareStack
} from "lucide-react";
import type { ExportRequest, ProjectVersion } from "../types/nightRender";

interface VersionDockProps {
  selectedVersion: string;
  versions: ProjectVersion[];
  onExport: (type: ExportRequest["type"]) => void;
  onVersionSelect: (id: string) => void;
}

export function VersionDock({
  selectedVersion,
  versions,
  onExport,
  onVersionSelect
}: VersionDockProps) {
  return (
    <footer className="version-dock" aria-label="版本对比与导出">
      <div className="version-head">
        <div>
          <h2>版本树</h2>
          <p>每个版本可回退、复制、继续修改。</p>
        </div>
        <div className="dock-actions">
          <button className="ghost-button" type="button">
            <RotateCcw size={14} aria-hidden="true" />
            回退
          </button>
          <button className="ghost-button" type="button">
            <Copy size={14} aria-hidden="true" />
            复制
          </button>
          <button className="ghost-button" type="button">
            <GitFork size={14} aria-hidden="true" />
            继续修改
          </button>
        </div>
      </div>

      <div className="version-strip">
        {versions.map((version, index) => (
          <button
            className={version.id === selectedVersion ? "version-card is-active" : "version-card"}
            key={version.id}
            onClick={() => onVersionSelect(version.id)}
            type="button"
          >
            <span className="version-thumb" aria-hidden="true">
              <GitBranch size={13} />
              <i>{index + 1}</i>
            </span>
            <span>
              <strong>{version.title}</strong>
              <small>{version.note}</small>
            </span>
            <em>{version.status}</em>
          </button>
        ))}
      </div>

      <div className="export-bar">
        <span>
          <Download size={14} aria-hidden="true" />
          输出
        </span>
        {(["2K", "4K", "6K", "8K", "汇报版式", "对比图"] as const).map((type) => (
          <button className="export-button" key={type} type="button" onClick={() => onExport(type)}>
            {type === "汇报版式" ? <FileStack size={14} /> : <SquareStack size={14} />}
            {type}
          </button>
        ))}
      </div>
    </footer>
  );
}
