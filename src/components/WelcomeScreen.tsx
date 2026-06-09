import { InteractiveNebulaShader } from "./ui/liquid-shader";

interface WelcomeScreenProps {
  onContinue: () => void;
}

const loginLabel = "Log in";
const loginLetters = Array.from(loginLabel);

export function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  return (
    <main className="welcome-screen">
      <InteractiveNebulaShader
        className="welcome-shader"
        maxPixelRatio={0.75}
        targetFps={16}
      />

      <section className="welcome-frame" aria-labelledby="welcome-title">
        <div className="welcome-brand">
          <img className="welcome-logo" src="/zerlum-logo.png" alt="Zerlum" />
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

        <button
          aria-label={loginLabel}
          className="welcome-login-button"
          type="button"
          onClick={onContinue}
        >
          <span className="welcome-login-text" aria-hidden="true">
            {loginLetters.map((letter, index) => (
              <span
                className="welcome-login-letter"
                key={`${letter}-${index}`}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {letter === " " ? "\u00a0" : letter}
              </span>
            ))}
          </span>
        </button>
      </section>
    </main>
  );
}
