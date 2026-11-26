import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { buildStamp } from "../../packages/agent/src/live/stamp";

const HUB_PORT = Number(process.env.PONEY_PORT ?? 5319);
const HUB = `http://127.0.0.1:${HUB_PORT}`;
const PONEY_BIN = fileURLToPath(
  new URL("../../packages/agent/bin/poney.mjs", import.meta.url),
);

type HubInfo = { poney?: boolean; build?: string; owner?: string };

async function hubInfo(): Promise<HubInfo | undefined> {
  try {
    const res = await fetch(`${HUB}/api/live`, {
      signal: AbortSignal.timeout(800),
    });
    const info = res.ok ? ((await res.json()) as HubInfo) : undefined;
    return info?.poney ? info : undefined;
  } catch {
    return undefined;
  }
}
const isHub = async () => !!(await hubInfo());
let warned = false;

/**
 * In development the Studio needs Poney's local hub (agents, workspaces, the
 * live link). Before each /api request this makes sure a hub answers: the one
 * that already runs (from `npm run studio`, an MCP server or another dev
 * server), or one it starts. Then /api is forwarded to it, so the dev Studio
 * is linked on any port, with no ?live= address.
 */
function poneyHub(): Plugin {
  let child: ChildProcess | undefined;
  let starting: Promise<void> | undefined;
  // A hub that answered with current code a moment ago needs no new check.
  let checked = 0;
  const ensure = () =>
    Date.now() - checked < 3000
      ? Promise.resolve()
      : (starting ??= (async () => {
          const info = await hubInfo();
          // A hub that runs older code: replace it when this dev server started it; otherwise say so.
          if (info && info.build !== buildStamp()) {
            if (info.owner === "dev") {
              await fetch(`${HUB}/api/live/stop`, { method: "POST" }).catch(
                () => undefined,
              );
              for (let i = 0; i < 40 && (await isHub()); i++)
                await new Promise((r) => setTimeout(r, 100));
            } else if (!warned) {
              warned = true;
              console.warn(
                `[poney] The Poney hub on ${HUB} runs older code. It was started by an MCP server or "npm run studio": restart that to get the changes.`,
              );
            }
          }
          if (await isHub()) return void (checked = Date.now());
          if (!child || child.exitCode !== null)
            child = spawn(
              process.execPath,
              [PONEY_BIN, "studio", "--port", String(HUB_PORT)],
              {
                stdio: ["ignore", "ignore", "inherit"],
                env: { ...process.env, PONEY_HUB_OWNER: "dev" },
              },
            );
          for (let i = 0; i < 60 && !(await isHub()); i++)
            await new Promise((r) => setTimeout(r, 250));
          if (await isHub()) checked = Date.now();
        })().finally(() => (starting = undefined)));
  return {
    name: "poney-hub",
    apply: "serve",
    config: () => ({
      server: {
        proxy: {
          "/api": {
            target: HUB,
            changeOrigin: true,
            // The page and this dev server are one origin; to the hub, the request comes from a program on this machine.
            configure: (proxy) =>
              proxy.on("proxyReq", (req) => req.removeHeader("origin")),
          },
        },
      },
    }),
    configureServer(server) {
      server.middlewares.use(
        "/api",
        (_req, _res, next) => void ensure().then(() => next(), next),
      );
      const stop = () => child?.kill();
      server.httpServer?.on("close", stop);
      process.once("exit", stop);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), poneyHub()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
