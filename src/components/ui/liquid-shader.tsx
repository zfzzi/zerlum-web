import { useEffect, useRef } from "react";
import * as THREE from "three";

export interface InteractiveNebulaShaderProps {
  animated?: boolean;
  hasActiveReminders?: boolean;
  hasUpcomingReminders?: boolean;
  disableCenterDimming?: boolean;
  maxPixelRatio?: number;
  targetFps?: number;
  className?: string;
}

/**
 * Full-screen nebula shader background.
 * Props drive GLSL uniforms only; screen content lives in parent components.
 */
export function InteractiveNebulaShader({
  animated = true,
  hasActiveReminders = false,
  hasUpcomingReminders = false,
  disableCenterDimming = false,
  maxPixelRatio = 0.9,
  targetFps = 18,
  className = ""
}: InteractiveNebulaShaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);

  useEffect(() => {
    const material = materialRef.current;

    if (material) {
      material.uniforms.hasActiveReminders.value = hasActiveReminders;
      material.uniforms.hasUpcomingReminders.value = hasUpcomingReminders;
      material.uniforms.disableCenterDimming.value = disableCenterDimming;
    }
  }, [hasActiveReminders, hasUpcomingReminders, disableCenterDimming]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const host = container;
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    const shouldAnimate = animated && !prefersReducedMotion;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "low-power"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const startTime = performance.now();

    const vertexShader = `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      precision mediump float;

      uniform vec2 iResolution;
      uniform float iTime;
      uniform vec2 iMouse;
      uniform bool hasActiveReminders;
      uniform bool hasUpcomingReminders;
      uniform bool disableCenterDimming;

      varying vec2 vUv;

      #define t iTime

      mat2 m(float a) {
        float c = cos(a);
        float s = sin(a);
        return mat2(c, -s, s, c);
      }

      float map(vec3 p) {
        p.xz *= m(t * 0.4);
        p.xy *= m(t * 0.3);

        vec3 q = p * 2.0 + t;

        return length(p + vec3(sin(t * 0.7))) * log(length(p) + 1.0)
          + sin(q.x + sin(q.z + sin(q.y))) * 0.5
          - 1.0;
      }

      void mainImage(out vec4 O, in vec2 fragCoord) {
        vec2 uv = fragCoord / min(iResolution.x, iResolution.y) - vec2(0.9, 0.5);
        uv.x += 0.4;

        vec3 col = vec3(0.0);
        float d = 2.5;

        for (int i = 0; i <= 5; i++) {
          vec3 p = vec3(0.0, 0.0, 5.0) + normalize(vec3(uv, -1.0)) * d;
          float rz = map(p);
          float f = clamp((rz - map(p + 0.1)) * 0.5, -0.1, 1.0);

          vec3 base = hasActiveReminders
            ? vec3(0.05, 0.2, 0.5) + vec3(4.0, 2.0, 5.0) * f
            : hasUpcomingReminders
              ? vec3(0.05, 0.3, 0.1) + vec3(2.0, 5.0, 1.0) * f
              : vec3(0.1, 0.3, 0.4) + vec3(5.0, 2.5, 3.0) * f;

          col = col * base + smoothstep(2.5, 0.0, rz) * 0.7 * base;
          d += min(rz, 1.0);
        }

        float dist = distance(fragCoord, iResolution * 0.5);
        float radius = min(iResolution.x, iResolution.y) * 0.5;
        float dim = disableCenterDimming ? 1.0 : smoothstep(radius * 0.3, radius * 0.5, dist);

        O = vec4(col, 1.0);

        if (!disableCenterDimming) {
          O.rgb = mix(O.rgb * 0.3, O.rgb, dim);
        }
      }

      void main() {
        mainImage(gl_FragColor, vUv * iResolution);
      }
    `;

    const uniforms = {
      iTime: { value: 0 },
      iResolution: { value: new THREE.Vector2() },
      iMouse: { value: new THREE.Vector2() },
      hasActiveReminders: { value: hasActiveReminders },
      hasUpcomingReminders: { value: hasUpcomingReminders },
      disableCenterDimming: { value: disableCenterDimming }
    };

    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms
    });
    materialRef.current = material;

    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(mesh);

    function resize() {
      const width = host.clientWidth;
      const height = host.clientHeight;

      renderer.setSize(width, height, false);
      uniforms.iResolution.value.set(width, height);
    }

    window.addEventListener("resize", resize);
    resize();

    function renderFrame(staticTime?: number) {
      uniforms.iTime.value = staticTime ?? (performance.now() - startTime) / 1000;
      renderer.render(scene, camera);
    }

    let staticFrameId = 0;

    if (shouldAnimate) {
      const frameInterval = 1000 / Math.max(12, targetFps);
      let lastFrame = 0;

      renderer.setAnimationLoop((timestamp) => {
        if (document.hidden) {
          return;
        }

        if (timestamp - lastFrame < frameInterval) {
          return;
        }

        lastFrame = timestamp;
        renderFrame();
      });
    } else {
      staticFrameId = requestAnimationFrame(() => renderFrame(6.2));
    }

    return () => {
      window.removeEventListener("resize", resize);
      renderer.setAnimationLoop(null);
      if (staticFrameId) {
        cancelAnimationFrame(staticFrameId);
      }
      host.removeChild(renderer.domElement);
      material.dispose();
      mesh.geometry.dispose();
      renderer.dispose();
      materialRef.current = null;
    };
  }, [animated, maxPixelRatio, targetFps]);

  return (
    <div
      ref={containerRef}
      className={`liquid-shader ${className}`}
      aria-label="Interactive nebula background"
    />
  );
}
