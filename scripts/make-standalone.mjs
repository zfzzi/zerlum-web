import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const indexPath = join(dist, "index.html");
const outPath = join(dist, "yeyuai-standalone.html");

let html = await readFile(indexPath, "utf8");

const cssMatches = [...html.matchAll(/<link rel="stylesheet" crossorigin href="([^"]+)">/g)];
for (const match of cssMatches) {
  const href = match[1].replace(/^\.\//, "");
  const css = await readFile(join(dist, href), "utf8");
  html = html.replace(match[0], () => `<style>\n${css}\n</style>`);
}

const scriptMatches = [...html.matchAll(/<script type="module" crossorigin src="([^"]+)"><\/script>/g)];
for (const match of scriptMatches) {
  const src = match[1].replace(/^\.\//, "");
  const js = (await readFile(join(dist, src), "utf8")).replace(
    /<\/script/gi,
    "<\\/script"
  );
  html = html.replace(match[0], () => `<script type="module">\n${js}\n</script>`);
}

html = html.replace(
  "<title>夜绘AI 工作台</title>",
  "<title>夜绘AI 工作台 - 可直接打开版</title>"
);

await writeFile(outPath, html, "utf8");
