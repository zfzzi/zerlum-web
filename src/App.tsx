import { useEffect, useState } from "react";
import {
  applyFixtureLightingToResult,
  createFixtureLightingGuideImage,
  hasFixtureLightingAnnotations
} from "./api/fixtureLighting";
import { resizeImageDataUrl } from "./api/imageData";
import { createLocalNightPreview } from "./api/localNightPreview";
import { generateNightRender } from "./api/nightRenderClient";
import { buildNightRenderApiPayload } from "./api/nightRenderPayload";
import {
  defaultReferences,
  initialPrompt,
  styleReferences
} from "./data";
import {
  addUserCredits,
  clearCurrentUser,
  consumeUserCredits,
  loadCurrentUser,
  type UserProfile
} from "./auth/userProfile";
import { AuthScreen } from "./components/AuthScreen";
import { CanvasStage } from "./components/CanvasStage";
import { InspectorPanel } from "./components/InspectorPanel";
import { LeftPanel } from "./components/LeftPanel";
import { TopBar } from "./components/TopBar";
import { WelcomeScreen } from "./components/WelcomeScreen";
import { InteractiveNebulaShader } from "./components/ui/liquid-shader";
import type {
  CanvasGenerationContext,
  CanvasTool,
  ExportRequest,
  GenerationHistoryItem,
  GenerationRequest,
  LightingMoodTemplate,
  ReferenceImage,
  SceneType
} from "./types/nightRender";
import "./styles.css";

type PreviewMode = "welcome" | "auth" | "workspace" | null;

const previewUser: UserProfile = {
  id: "preview-user",
  username: "Preview",
  email: "preview@zerlum.local",
  phone: "",
  plan: "试用版" as UserProfile["plan"],
  credits: 120,
  totalRecharged: 0,
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
  avatarInitial: "P",
  rechargeRecords: []
};

const initialCanvasContext: CanvasGenerationContext = {
  activeTool: "标注灯位",
  annotations: [],
  timeRange: "蓝调时刻 18:00-19:00",
  viewBox: {
    width: 1000,
    height: 560
  }
};

function readPreviewMode(): PreviewMode {
  if (typeof window === "undefined") {
    return null;
  }

  const mode = new URLSearchParams(window.location.search).get("preview");
  return mode === "welcome" || mode === "auth" || mode === "workspace" ? mode : null;
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("图片读取失败，请重新上传主图。"));
    reader.readAsDataURL(blob);
  });
}

async function sourceToDataUrl(reference: ReferenceImage) {
  if (reference.file) {
    return blobToDataUrl(reference.file);
  }

  if (!reference.previewUrl) {
    throw new Error("请先上传主图。");
  }

  if (reference.previewUrl.startsWith("data:")) {
    return reference.previewUrl;
  }

  const response = await fetch(reference.previewUrl);
  const blob = await response.blob();
  return blobToDataUrl(blob);
}

function shouldTryNightRenderApi() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem("zerlum.skipServerApi") !== "1";
}

function extractColorTemperatureFromPrompt(userPrompt: string) {
  const normalizedPrompt = userPrompt.trim();
  const explicitKelvin = normalizedPrompt.match(/(?:色温\s*[:：]?\s*)?([2-7]\d{3})\s*[kK]\b/);
  const explicitChinese = normalizedPrompt.match(/色温\s*[:：]?\s*([2-7]\d{3})/);
  const value = Number(explicitKelvin?.[1] ?? explicitChinese?.[1]);

  return Number.isFinite(value) && value >= 2000 && value <= 7500 ? value : null;
}

function buildColorTemperatureInstruction(userPrompt: string) {
  const explicitTemperature = extractColorTemperatureFromPrompt(userPrompt);

  if (explicitTemperature) {
    return {
      value: explicitTemperature,
      instruction: `用户提示词已明确指定灯光色温为 ${explicitTemperature}K，请按该色温生成灯光效果；标注线颜色只用于识别灯具类型和位置，不代表灯光颜色。`
    };
  }

  return {
    value: 3000,
    instruction:
      "用户提示词未明确指定色温，所有灯具默认使用 3000K 暖白光；标注线颜色只用于识别灯具类型和位置，不代表灯光颜色或色温。"
  };
}

function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => loadCurrentUser());
  const [authStage, setAuthStage] = useState<"welcome" | "auth">("welcome");
  const [previewMode, setPreviewMode] = useState<PreviewMode>(() => readPreviewMode());
  const [references, setReferences] = useState<ReferenceImage[]>(defaultReferences);
  const [selectedStyleReference, setSelectedStyleReference] = useState(styleReferences[0]);
  const [sceneType, setSceneType] = useState<SceneType>(styleReferences[0].sceneType);
  const [selectedTemplate, setSelectedTemplate] =
    useState<LightingMoodTemplate>(styleReferences[0].template);
  const [activeFixture, setActiveFixture] = useState("洗墙灯");
  const [negativePrompts] = useState([
    "不改变建筑结构",
    "不改变透视",
    "不改变窗户位置",
    "不改变地砖",
    "不过度曝光",
    "不失真",
    "不模糊",
    "不改变人物和树木"
  ]);
  const [activeTool, setActiveTool] = useState<CanvasTool>("标注灯位");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [outputSize, setOutputSize] = useState<ExportRequest["type"]>("4K");
  const [renderEngine, setRenderEngine] = useState<"image2" | "banana">("banana");
  const [resultImageUrl, setResultImageUrl] = useState<string>();
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [canvasContext, setCanvasContext] =
    useState<CanvasGenerationContext>(initialCanvasContext);
  const [generationHistory, setGenerationHistory] = useState<GenerationHistoryItem[]>([]);
  const [apiStatus, setApiStatus] = useState({
    state: "idle" as "idle" | "loading" | "error" | "success",
    message: "上传主图后可开始生成夜景测试预览。"
  });

  useEffect(() => {
    document.documentElement.dataset.theme = "dark";
    document.documentElement.dataset.appearance = "dark";
  }, []);

  useEffect(() => {
    function handlePreviewRouteChange() {
      setPreviewMode(readPreviewMode());
    }

    window.addEventListener("popstate", handlePreviewRouteChange);
    return () => window.removeEventListener("popstate", handlePreviewRouteChange);
  }, []);

  function navigatePreview(mode: PreviewMode) {
    const nextUrl = new URL(window.location.href);

    if (mode) {
      nextUrl.searchParams.set("preview", mode);
    } else {
      nextUrl.searchParams.delete("preview");
    }

    window.history.pushState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    setPreviewMode(mode);
  }

  function handleUpload(id: string, file: File) {
    const previewUrl = file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : undefined;
    const previousPreviewUrl = references.find((reference) => reference.id === id)?.previewUrl;

    if (previousPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    if (id === "primary") {
      setResultImageUrl(undefined);
    }

    setReferences((current) =>
      current.map((reference) =>
        reference.id === id
          ? {
              ...reference,
              file,
              fileName: file.name,
              previewUrl,
              status: "ready"
            }
          : reference
      )
    );
  }

  function handleRemoveUpload(id: string) {
    const previousPreviewUrl = references.find((reference) => reference.id === id)?.previewUrl;

    if (previousPreviewUrl?.startsWith("blob:")) {
      URL.revokeObjectURL(previousPreviewUrl);
    }

    if (id === "primary") {
      setResultImageUrl(undefined);
      setApiStatus({
        state: "idle",
        message: "主图已移除，可重新上传素材。"
      });
    }

    setReferences((current) =>
      current.map((reference) =>
        reference.id === id
          ? {
              ...reference,
              file: undefined,
              fileName: undefined,
              previewUrl: undefined,
              status: "missing"
            }
          : reference
      )
    );
  }

  async function handleGenerate() {
    const primaryReference = references.find(
      (reference) =>
        reference.role === "primary" &&
        reference.status === "ready" &&
        reference.previewUrl
    );

    if (!primaryReference?.previewUrl) {
      setApiStatus({
        state: "error",
        message: "请先上传主图，再开始生成夜景方案。"
      });
      return;
    }

    if (!activeUser) {
      return;
    }

    if (activeUser.credits < 6) {
      setApiStatus({
        state: "error",
        message: "积分不足，充值后可继续生成。"
      });
      return;
    }

    setApiStatus({
      state: "loading",
      message: "正在生成夜景效果图..."
    });
    setIsGeneratingImage(true);

    try {
      const generationCanvasContext = canvasContext;
      const sourceDataUrl = await resizeImageDataUrl(await sourceToDataUrl(primaryReference), {
        maxSide: 1800,
        mimeType: "image/jpeg",
        quality: 0.88
      });
      const uploadedReferenceImages = references.filter(
        (reference) =>
          reference.role !== "primary" &&
          reference.status === "ready" &&
          reference.previewUrl
      );
      const referenceImagePayloads = await Promise.all(
        uploadedReferenceImages.map(async (reference) => ({
          dataUrl: await resizeImageDataUrl(await sourceToDataUrl(reference), {
            maxSide: 1400,
            mimeType: "image/jpeg",
            quality: 0.86
          }),
          fileName: reference.fileName,
          mimeType: "image/jpeg",
          role: reference.role,
          label: reference.label
        }))
      );
      const referencePrompt =
        referenceImagePayloads.length > 0
          ? "用户额外上传了参考图，请仅参考其灯光氛围、色彩倾向、材质质感和画面完成度，不要改变主图建筑结构和透视。"
          : "";
      const styleBasePrompt = selectedStyleReference.basePrompt.trim();
      const userPrompt = prompt.trim();
      const colorTemperatureRule = buildColorTemperatureInstruction(userPrompt);
      const hasLightingGuides = hasFixtureLightingAnnotations(generationCanvasContext);
      const generationSourceDataUrl = hasLightingGuides
        ? await createFixtureLightingGuideImage(
            sourceDataUrl,
            generationCanvasContext,
            colorTemperatureRule.value
          )
        : sourceDataUrl;
      const promptForApi = [styleBasePrompt, userPrompt, colorTemperatureRule.instruction]
        .filter(Boolean)
        .join("\n");
      const apiPayload = primaryReference.file
        ? buildNightRenderApiPayload({
            projectId: "zerlum-night-render",
            imageFile: primaryReference.file,
            sceneType,
            template: selectedTemplate,
            styleReference: selectedStyleReference,
            canvas: generationCanvasContext,
            prompt: promptForApi,
            negativePrompts,
            outputSize
          })
        : undefined;
      const fallbackPrompt = [
        "将用户上传的建筑照片转换为专业夜景照明效果图。",
        `场景类型：${sceneType}。`,
        `风格模板：${selectedTemplate}。`,
        `场景底层提示词：${styleBasePrompt || "无"}。`,
        `用户补充提示词：${userPrompt || "无"}。`,
        `色温规则：${colorTemperatureRule.instruction}`,
        `输出分辨率：${outputSize}。`,
        `硬性保持约束：${negativePrompts.join("、")}。`,
        "根据用户标注的灯具位置和种类转换成真实灯光效果，不改变原图建筑结构、透视、树木、地面和人物。"
      ].join("\n");
      const finalPrompt = [apiPayload?.finalPrompt ?? fallbackPrompt, referencePrompt]
        .filter(Boolean)
        .join("\n");
      const request: GenerationRequest = {
        projectId: "zerlum-night-render",
        renderEngine,
        sourceImage: {
          dataUrl: generationSourceDataUrl,
          fileName: primaryReference.fileName,
          mimeType: "image/jpeg",
          size: primaryReference.file?.size
        },
        referenceImages: referenceImagePayloads,
        references: references.map((reference) => ({
          role: reference.role,
          fileName: reference.fileName,
          status: reference.status
        })),
        sceneType,
        template: selectedTemplate,
        params: {
          colorTemperature: colorTemperatureRule.value,
          brightness: 72,
          halo: 58,
          interiorGlow: 64,
          shadow: 66,
          blueTone: selectedTemplate.includes("暖") ? 48 : 78,
          warmLight: selectedTemplate.includes("冷") ? 42 : 70,
          glareControl: 78,
          overexposureRepair: 82,
          warmCoolContrast: "中"
        },
        prompt: finalPrompt,
        userPrompt,
        finalPrompt,
        negativePrompts,
        locks: ["建筑结构", "透视关系", "人物", "树木", "地面铺装", "灯具"],
        annotations: apiPayload?.annotations ?? [],
        apiPayload,
        styleReference: {
          id: selectedStyleReference.id,
          title: selectedStyleReference.title,
          template: selectedStyleReference.template
        },
        output: {
          size:
            outputSize === "2K" ||
            outputSize === "4K" ||
            outputSize === "6K" ||
            outputSize === "8K"
              ? outputSize
              : "4K",
          ratio: "自动适配",
          format: "PNG"
        },
        upscale: {
          enabled: true,
          targetSize:
            outputSize === "2K" ||
            outputSize === "4K" ||
            outputSize === "6K" ||
            outputSize === "8K"
              ? outputSize
              : "4K"
        }
      };

      let usedApi = false;
      let resultUrl: string | undefined;
      let apiWarning = "";
      let apiErrorMessage = "";

      if (shouldTryNightRenderApi()) {
        try {
          const response = await generateNightRender(request);

          if (response.status === "completed" && response.resultImageUrl) {
            usedApi = true;
            resultUrl = response.resultImageUrl;
            apiWarning = response.warning || "";
          } else {
            throw new Error(response.error || "生成服务暂未返回结果图。");
          }
        } catch (error) {
          apiErrorMessage =
            error instanceof Error ? error.message : "API 调用失败。";
          resultUrl = await createLocalNightPreview(primaryReference.previewUrl, {
            fixture: activeFixture,
            outputSize,
            prompt: finalPrompt,
            sceneType,
            template: selectedTemplate
          });
        }
      } else {
        resultUrl = await createLocalNightPreview(primaryReference.previewUrl, {
          fixture: activeFixture,
          outputSize,
          prompt: finalPrompt,
          sceneType,
          template: selectedTemplate
        });
      }

      if (!resultUrl) {
        throw new Error("没有可用的生成结果。");
      }

      let calibratedResultUrl = resultUrl;
      if (hasLightingGuides) {
        try {
          calibratedResultUrl = await applyFixtureLightingToResult(
            resultUrl,
            generationCanvasContext,
            colorTemperatureRule.value
          );
        } catch {
          apiWarning = [apiWarning, "灯位校准图层未能合成，已显示 API 原图。"]
            .filter(Boolean)
            .join("；");
        }
      }

      if (usedApi && activeUser.id !== previewUser.id) {
        const updatedUser = consumeUserCredits(activeUser.id, 6);
        if (updatedUser) {
          setCurrentUser(updatedUser);
        }
      }

      setResultImageUrl(calibratedResultUrl);
      setGenerationHistory((current) => {
        const nextItem: GenerationHistoryItem = {
          id: `history-${Date.now()}`,
          title: `${selectedStyleReference.title} · ${outputSize}`,
          imageUrl: calibratedResultUrl,
          outputSize,
          createdAt: new Date().toLocaleTimeString("zh-CN", {
            hour: "2-digit",
            minute: "2-digit"
          })
        };

        return [nextItem, ...current].slice(0, 12);
      });
      setApiStatus({
        state: "success",
        message: usedApi
          ? apiWarning
            ? `AI API 生成完成；${apiWarning}`
            : "AI API 生成完成，已扣除 6 积分。"
          : `本地夜景预览已生成；API 调用失败：${apiErrorMessage || "请检查接口配置。"}`
      });
    } catch (error) {
      setApiStatus({
        state: "error",
        message: error instanceof Error ? error.message : "生成失败，请重新上传主图后再试。"
      });
    } finally {
      setIsGeneratingImage(false);
    }
  }

  async function handleExport() {
    const imageUrl = resultImageUrl ?? primaryPreviewUrl;

    if (!imageUrl) {
      setApiStatus({
        state: "error",
        message: "请先上传主图并生成预览后再导出。"
      });
      return;
    }

    setApiStatus({
      state: "loading",
      message: `正在导出 ${outputSize} 预览图...`
    });

    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `夜绘AI-${outputSize}-夜景预览.png`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setApiStatus({
        state: "success",
        message: `${outputSize} 预览图已开始下载。`
      });
    } catch (error) {
      setApiStatus({
        state: "error",
        message:
          error instanceof Error
            ? "导出失败，请确认图片仍可访问后重试。"
            : "导出失败。"
      });
    }
  }

  function handleStyleSelect(style: typeof selectedStyleReference) {
    setSelectedStyleReference(style);
    setSceneType(style.sceneType);
    setSelectedTemplate(style.template);
  }

  function handleFixtureChange(fixture: string) {
    setActiveFixture(fixture);
    setActiveTool("标注灯位");
  }

  function handleRechargeCredits(amount: number) {
    if (!currentUser) {
      return;
    }

    const updatedUser = addUserCredits(currentUser.id, amount);
    if (updatedUser) {
      setCurrentUser(updatedUser);
    }
  }

  function handleLogout() {
    clearCurrentUser();
    setAuthStage("auth");
    setCurrentUser(null);
  }

  const primaryPreviewUrl = references.find(
    (reference) => reference.role === "primary"
  )?.previewUrl;
  const canGenerate = Boolean(primaryPreviewUrl);
  const canExport = Boolean(resultImageUrl);

  const activeUser = previewMode === "workspace" ? currentUser ?? previewUser : currentUser;

  if (previewMode === "welcome") {
    return <WelcomeScreen onContinue={() => navigatePreview(currentUser ? "workspace" : "auth")} />;
  }

  if (previewMode === "auth") {
    return (
      <AuthScreen
        onAuthenticated={(user) => {
          setCurrentUser(user);
          navigatePreview("workspace");
        }}
      />
    );
  }

  if (!activeUser) {
    return authStage === "welcome" ? (
      <WelcomeScreen onContinue={() => setAuthStage("auth")} />
    ) : (
      <AuthScreen onAuthenticated={setCurrentUser} />
    );
  }

  return (
    <div className="app-shell zerlum-workspace">
      <InteractiveNebulaShader
        animated={false}
        className="workspace-shader"
        disableCenterDimming
        maxPixelRatio={1}
      />
      <TopBar
        userProfile={activeUser}
        onBrandClick={() => navigatePreview("welcome")}
        onLogout={handleLogout}
        onRechargeCredits={handleRechargeCredits}
      />
      {apiStatus.state !== "idle" ? (
        <div className={`global-toast state-${apiStatus.state}`} role="status">
          <span>{apiStatus.message}</span>
        </div>
      ) : null}
      <div className="workspace">
        <LeftPanel
          references={references}
          selectedStyleId={selectedStyleReference.id}
          onStyleSelect={handleStyleSelect}
          onUpload={handleUpload}
          onRemoveUpload={handleRemoveUpload}
        />
        <CanvasStage
          activeFixture={activeFixture}
          activeTool={activeTool}
          generationMessage={apiStatus.message}
          isGenerating={isGeneratingImage}
          resultImageUrl={resultImageUrl}
          sourceImageUrl={primaryPreviewUrl}
          onCanvasContextChange={setCanvasContext}
          onFixtureChange={handleFixtureChange}
          onPrimaryImageUpload={(file) => handleUpload("primary", file)}
          onToolChange={setActiveTool}
        />
        <InspectorPanel
          apiStatus={apiStatus}
          canExport={canExport}
          history={generationHistory}
          outputSize={outputSize}
          prompt={prompt}
          renderEngine={renderEngine}
          canGenerate={canGenerate}
          onExport={handleExport}
          onGenerate={handleGenerate}
          onOutputSizeChange={setOutputSize}
          onPromptChange={setPrompt}
          onRenderEngineChange={setRenderEngine}
        />
      </div>
    </div>
  );
}

export default App;
