import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function localNightRenderApiPlugin(): Plugin {
  return {
    name: "local-night-render-api",
    config(_, { mode }) {
      Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
    },
    configureServer(server) {
      server.middlewares.use("/api/night-render/generate", async (request, response) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(JSON.stringify({ status: "failed", error: "Method not allowed." }));
          return;
        }

        try {
          const chunks: Buffer[] = [];

          for await (const chunk of request) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }

          const rawBody = Buffer.concat(chunks).toString("utf8");
          const body = rawBody ? JSON.parse(rawBody) : {};
          const { default: handler } = await import("./api/night-render/generate.js");
          const responseAdapter = {
            setHeader(name: string, value: string) {
              response.setHeader(name, value);
            },
            status(code: number) {
              response.statusCode = code;
              return responseAdapter;
            },
            json(payload: unknown) {
              response.setHeader("Content-Type", "application/json; charset=utf-8");
              response.end(JSON.stringify(payload));
            }
          };

          await handler({ ...request, body }, responseAdapter);
        } catch (error) {
          response.statusCode = 500;
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.end(
            JSON.stringify({
              status: "failed",
              error: error instanceof Error ? error.message : "Local API proxy failed."
            })
          );
        }
      });
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), localNightRenderApiPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
