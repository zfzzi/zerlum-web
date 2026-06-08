import { type FormEvent, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Github,
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Phone,
  ShieldCheck,
  Sparkles,
  User,
  Wand2
} from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import {
  createRegisteredUser,
  resolveLoginUser,
  type UserProfile
} from "../auth/userProfile";
import { cn } from "../lib/utils";
import { InteractiveNebulaShader } from "./ui/liquid-shader";

type AuthMode = "login" | "register";
type FieldName =
  | "identifier"
  | "loginPassword"
  | "username"
  | "email"
  | "phone"
  | "password"
  | "confirmPassword"
  | "agreement";

interface AuthScreenProps {
  onAuthenticated: (profile: UserProfile) => void;
}

interface FieldState {
  value: string;
  touched: boolean;
}

interface FieldConfig {
  name: FieldName;
  label: string;
  type?: string;
  inputMode?: "email" | "tel" | "text";
  autoComplete?: string;
  icon: typeof Mail;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^1[3-9]\d{9}$/;
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

const loginFields: FieldConfig[] = [
  {
    name: "identifier",
    label: "邮箱或手机号",
    inputMode: "email",
    autoComplete: "email",
    icon: Mail
  },
  {
    name: "loginPassword",
    label: "密码",
    type: "password",
    autoComplete: "current-password",
    icon: LockKeyhole
  }
];

const registerFields: FieldConfig[] = [
  {
    name: "username",
    label: "用户名",
    autoComplete: "username",
    icon: User
  },
  {
    name: "email",
    label: "邮箱",
    inputMode: "email",
    autoComplete: "email",
    icon: Mail
  },
  {
    name: "phone",
    label: "手机号",
    inputMode: "tel",
    autoComplete: "tel",
    icon: Phone
  },
  {
    name: "password",
    label: "密码",
    type: "password",
    autoComplete: "new-password",
    icon: LockKeyhole
  },
  {
    name: "confirmPassword",
    label: "确认密码",
    type: "password",
    autoComplete: "new-password",
    icon: ShieldCheck
  }
];

const initialFields: Record<FieldName, FieldState> = {
  identifier: { value: "", touched: false },
  loginPassword: { value: "", touched: false },
  username: { value: "", touched: false },
  email: { value: "", touched: false },
  phone: { value: "", touched: false },
  password: { value: "", touched: false },
  confirmPassword: { value: "", touched: false },
  agreement: { value: "", touched: false }
};

function validateField(
  name: FieldName,
  value: string,
  fields: Record<FieldName, FieldState>,
  agreementAccepted: boolean
) {
  if (name === "identifier") {
    if (!value.trim()) {
      return "请输入邮箱或手机号";
    }

    if (!emailPattern.test(value) && !phonePattern.test(value)) {
      return "请输入有效邮箱或中国大陆手机号";
    }
  }

  if (name === "loginPassword" && value.length < 6) {
    return "密码至少 6 位";
  }

  if (name === "username") {
    if (!value.trim()) {
      return "请输入用户名";
    }

    if (value.trim().length < 2 || value.trim().length > 20) {
      return "用户名需为 2 到 20 个字符";
    }
  }

  if (name === "email" && !emailPattern.test(value)) {
    return "请输入有效邮箱";
  }

  if (name === "phone" && !phonePattern.test(value)) {
    return "请输入有效手机号";
  }

  if (name === "password" && !passwordPattern.test(value)) {
    return "密码至少 8 位，需包含字母和数字";
  }

  if (name === "confirmPassword" && value !== fields.password.value) {
    return "两次输入的密码不一致";
  }

  if (name === "agreement" && !agreementAccepted) {
    return "请先同意用户协议";
  }

  return "";
}

function AuthField({
  config,
  field,
  error,
  showFeedback,
  onBlur,
  onChange
}: {
  config: FieldConfig;
  field: FieldState;
  error: string;
  showFeedback: boolean;
  onBlur: () => void;
  onChange: (value: string) => void;
}) {
  const Icon = config.icon;
  const isPassword = config.type === "password";
  const [isVisible, setIsVisible] = useState(false);
  const isFilled = field.value.length > 0;
  const showError = showFeedback && Boolean(error);
  const showSuccess = showFeedback && isFilled && !error;

  return (
    <div className="auth-field" data-invalid={showError ? true : undefined}>
      <div className="auth-field-control">
        <Icon
          className={cn(
            "auth-field-icon",
            showError && "is-error",
            showSuccess && "is-success"
          )}
          aria-hidden="true"
        />
        <Input
          aria-invalid={showError}
          data-invalid={showError ? true : undefined}
          id={config.name}
          type={isPassword && isVisible ? "text" : config.type ?? "text"}
          inputMode={config.inputMode}
          autoComplete={config.autoComplete}
          className="auth-input peer"
          placeholder=" "
          value={field.value}
          onBlur={onBlur}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <label
          className={cn(
            "auth-floating-label",
            isFilled && "is-filled",
            showError && "is-error"
          )}
          htmlFor={config.name}
        >
          {config.label}
        </label>
        {isPassword ? (
          <button
            aria-label={isVisible ? "隐藏密码" : "显示密码"}
            className="auth-password-toggle"
            type="button"
            onClick={() => setIsVisible((current) => !current)}
          >
            {isVisible ? "隐藏" : "显示"}
          </button>
        ) : null}
        {!isPassword && showSuccess ? (
          <CheckCircle2 className="auth-field-check" aria-hidden="true" />
        ) : null}
      </div>
      <p className={cn("auth-field-message", showError && "is-error")} aria-live="polite">
        {showError ? error : showSuccess ? "格式正确" : " "}
      </p>
    </div>
  );
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [fields, setFields] = useState(initialFields);
  const [rememberMe, setRememberMe] = useState(true);
  const [agreementAccepted, setAgreementAccepted] = useState(false);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeFields = mode === "login" ? loginFields : registerFields;
  const errors = useMemo(() => {
    const nextErrors: Partial<Record<FieldName, string>> = {};

    for (const config of activeFields) {
      nextErrors[config.name] = validateField(
        config.name,
        fields[config.name].value,
        fields,
        agreementAccepted
      );
    }

    if (mode === "register") {
      nextErrors.agreement = validateField("agreement", "", fields, agreementAccepted);
    }

    return nextErrors;
  }, [activeFields, agreementAccepted, fields, mode]);

  function updateField(name: FieldName, value: string) {
    setFields((current) => ({
      ...current,
      [name]: {
        ...current[name],
        value
      }
    }));
  }

  function touchField(name: FieldName) {
    setFields((current) => ({
      ...current,
      [name]: {
        ...current[name],
        touched: true
      }
    }));
  }

  function markActiveFieldsTouched() {
    setFields((current) => {
      const next = { ...current };

      for (const config of activeFields) {
        next[config.name] = {
          ...next[config.name],
          touched: true
        };
      }

      next.agreement = {
        ...next.agreement,
        touched: true
      };

      return next;
    });
  }

  function handleModeChange(nextMode: AuthMode) {
    setMode(nextMode);
    setAttemptedSubmit(false);
    setIsSubmitting(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttemptedSubmit(true);
    markActiveFieldsTouched();

    const hasError =
      activeFields.some((config) => Boolean(errors[config.name])) ||
      (mode === "register" && Boolean(errors.agreement));

    if (hasError) {
      return;
    }

    setIsSubmitting(true);
    window.setTimeout(() => {
      const profile =
        mode === "register"
          ? createRegisteredUser({
              username: fields.username.value,
              email: fields.email.value,
              phone: fields.phone.value
            })
          : resolveLoginUser(fields.identifier.value);

      setIsSubmitting(false);
      onAuthenticated(profile);
    }, 360);
  }

  function handleThirdPartyLogin(provider: "微信" | "GitHub") {
    setIsSubmitting(true);
    window.setTimeout(() => {
      const profile = resolveLoginUser(
        provider === "微信" ? "wechat@zerlum.local" : "github@zerlum.local"
      );

      setIsSubmitting(false);
      onAuthenticated(profile);
    }, 300);
  }

  return (
    <main className="auth-page">
      <InteractiveNebulaShader className="auth-shader" />

      <section className="auth-hero" aria-label="Zerlum login introduction">
        <div className="auth-logo-row">
          <span className="auth-logo" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <strong>Zerlum</strong>
        </div>
        <h1>
          <span>Enter The</span>
          <span>Light Lab</span>
        </h1>
        <p>管理夜景项目、上传建筑图像、标注灯位并生成高质感照明效果图。</p>
      </section>

      <section className="auth-panel" aria-labelledby="auth-title">
        <div className="auth-panel-head">
          <span className="auth-panel-mark" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <div>
            <h2 id="auth-title">Zerlum</h2>
            <p>{mode === "login" ? "登录后进入 AI 夜景照明工作台" : "创建账号并开始夜景方案管理"}</p>
          </div>
        </div>

        <div className="auth-mode-switch" role="tablist" aria-label="登录方式">
          <button
            className={mode === "login" ? "is-active" : undefined}
            type="button"
            onClick={() => handleModeChange("login")}
          >
            登录
          </button>
          <button
            className={mode === "register" ? "is-active" : undefined}
            type="button"
            onClick={() => handleModeChange("register")}
          >
            注册
          </button>
        </div>

        <form className="auth-form" key={mode} onSubmit={handleSubmit}>
          {activeFields.map((config) => (
            <AuthField
              config={config}
              error={errors[config.name] ?? ""}
              field={fields[config.name]}
              key={config.name}
              showFeedback={attemptedSubmit || fields[config.name].touched}
              onBlur={() => touchField(config.name)}
              onChange={(value) => updateField(config.name, value)}
            />
          ))}

          {mode === "login" ? (
            <div className="auth-row">
              <label className="auth-checkline">
                <Checkbox
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(Boolean(checked))}
                />
                记住我
              </label>
              <Button asChild variant="link" size="sm">
                <a href="#forgot-password">忘记密码</a>
              </Button>
            </div>
          ) : (
            <div className="auth-agreement">
              <label className="auth-checkline">
                <Checkbox
                  checked={agreementAccepted}
                  aria-invalid={attemptedSubmit && Boolean(errors.agreement)}
                  onCheckedChange={(checked) => {
                    setAgreementAccepted(Boolean(checked));
                    touchField("agreement");
                  }}
                />
                <span>
                  我已阅读并同意
                  <a href="#terms">用户协议</a>
                  和
                  <a href="#privacy">隐私政策</a>
                </span>
              </label>
              <p className="auth-field-message is-error">
                {attemptedSubmit && errors.agreement ? errors.agreement : " "}
              </p>
            </div>
          )}

          <Button className="auth-primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="size-4" aria-hidden="true" />
            )}
            {mode === "login" ? "登录工作台" : "注册并进入"}
          </Button>
        </form>

        <div className="auth-divider">
          <span />
          <small>第三方登录</small>
          <span />
        </div>

        <div className="auth-social-grid">
          <Button
            className="auth-social"
            disabled={isSubmitting}
            variant="secondary"
            type="button"
            onClick={() => handleThirdPartyLogin("微信")}
          >
            <MessageCircle size={16} aria-hidden="true" />
            微信
          </Button>
          <Button
            className="auth-social"
            disabled={isSubmitting}
            variant="secondary"
            type="button"
            onClick={() => handleThirdPartyLogin("GitHub")}
          >
            <Github size={16} aria-hidden="true" />
            GitHub
          </Button>
        </div>

        <p className="auth-footnote">
          <AlertCircle size={13} aria-hidden="true" />
          {mode === "login" ? "还没有账号？" : "已有账号？"}
          <button
            type="button"
            onClick={() => handleModeChange(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "立即注册" : "返回登录"}
          </button>
        </p>
      </section>
    </main>
  );
}
