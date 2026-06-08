import { Sparkles } from "lucide-react";
import { InteractiveNebulaShader } from "./ui/liquid-shader";

interface WelcomeScreenProps {
  onContinue: () => void;
}

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  return (
    <main className="welcome-screen">
      <InteractiveNebulaShader className="welcome-shader" />

      <section className="welcome-frame" aria-labelledby="welcome-title">
        <div className="welcome-brand">
          <span className="welcome-brand-mark" aria-hidden="true">
            <Sparkles size={18} />
          </span>
          <span>Zerlum</span>
        </div>

        <div className="welcome-copy">
          <h1 id="welcome-title">
            <span>Zerlum</span>
            <span>Lights The Night</span>
          </h1>
          <p className="welcome-subtitle">
            以光影重塑建筑夜景，开启你的夜景照明创作之旅。
          </p>
        </div>

        <button className="welcome-login-button" type="button" onClick={onContinue}>
          <span>Log in</span>
        </button>
      </section>
    </main>
  );
}
