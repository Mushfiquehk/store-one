import { registerPlugin } from "@capacitor/core";
import type { Plugin, PluginListenerHandle } from "@capacitor/core";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { createApiHandlers, type ApiRequest, type ApiResponse } from "@shared/api-handlers";
import { dexieAdminStorage } from "./dexie-admin-storage";

interface HttpServerRequestEvent {
  requestId: string;
  method: string;
  path: string;
  body?: string;
}

interface HttpServerPlugin extends Plugin {
  start(options: { port: number; hostname: string }): Promise<void>;
  stop(): Promise<void>;
  respond(options: {
    requestId: string;
    status: number;
    headers: Record<string, string>;
    body: string;
  }): void;
}

const CornerPOSHttpServer = registerPlugin<HttpServerPlugin>("CornerPOSHttpServer");

let serverRunning = false;
let apiRouter: ReturnType<typeof createApiHandlers> | null = null;
let serverPort = 8080;
let serverHostname = "127.0.0.1";
let requestListenerHandle: PluginListenerHandle | null = null;

function isCapacitorNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function handleLocalRequest(req: ApiRequest): Promise<ApiResponse> {
  if (!apiRouter) {
    apiRouter = createApiHandlers(dexieAdminStorage);
  }
  return apiRouter.handle(req);
}

async function startNativeHttpServer(port: number, hostname: string): Promise<boolean> {
  try {
    await CornerPOSHttpServer.start({
      port,
      hostname,
    });

    requestListenerHandle = await CornerPOSHttpServer.addListener("request", async (event: HttpServerRequestEvent) => {
      let parsedBody: unknown;
      if (event.body) {
        try {
          parsedBody = JSON.parse(event.body);
        } catch {
          parsedBody = undefined;
        }
      }

      // The query string was split off the path and then dropped on the floor, so every
      // ?since=/?granularity= on this server was silently ignored. Parse it instead.
      const [pathWithoutQuery, queryString] = (event.path || "/").split("?");
      const query: Record<string, string> = {};
      if (queryString) {
        new URLSearchParams(queryString).forEach((value, key) => { query[key] = value; });
      }
      const req: ApiRequest = {
        method: event.method || "GET",
        path: pathWithoutQuery,
        params: {},
        query,
        body: parsedBody,
      };

      const response = await handleLocalRequest(req);

      CornerPOSHttpServer.respond({
        requestId: event.requestId,
        status: response.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify(response.data),
      });
    });

    return true;
  } catch (err) {
    console.error("[LocalServer] Failed to start native HTTP server:", err);
    console.warn(
      "[LocalServer] The CornerPOSHttpServer plugin is not available. " +
      "This is expected in web/dev environments. " +
      "The native iOS plugin must be registered in the Xcode project."
    );
    return false;
  }
}

async function stopNativeHttpServer(): Promise<void> {
  try {
    if (requestListenerHandle) {
      await requestListenerHandle.remove();
      requestListenerHandle = null;
    }
    await CornerPOSHttpServer.stop();
  } catch (err) {
    console.error("[LocalServer] Failed to stop native HTTP server:", err);
  }
}

export interface LocalServerOptions {
  port?: number;
  hostname?: string;
}

export async function startLocalServer(options?: LocalServerOptions): Promise<void> {
  if (!isCapacitorNative()) {
    console.log("[LocalServer] Not running on native platform — local server disabled");
    return;
  }

  if (serverRunning) {
    console.log("[LocalServer] Server already running");
    return;
  }

  serverPort = options?.port ?? 8080;
  serverHostname = options?.hostname ?? "127.0.0.1";
  console.log(`[LocalServer] Starting local HTTP server on ${serverHostname}:${serverPort}...`);

  const started = await startNativeHttpServer(serverPort, serverHostname);
  if (started) {
    serverRunning = true;
    console.log(`[LocalServer] Local HTTP server running at http://${serverHostname}:${serverPort}`);
  } else {
    console.warn("[LocalServer] Could not start native HTTP server");
  }
}

export async function stopLocalServer(): Promise<void> {
  if (!serverRunning) return;

  console.log("[LocalServer] Stopping local HTTP server...");
  await stopNativeHttpServer();
  serverRunning = false;
  console.log("[LocalServer] Local HTTP server stopped");
}

export function isLocalServerRunning(): boolean {
  return serverRunning;
}

export function setupLifecycleHandlers(): void {
  if (!isCapacitorNative()) return;

  App.addListener("appStateChange", async ({ isActive }) => {
    if (isActive) {
      console.log("[LocalServer] App resumed — ensuring server is running");
      await startLocalServer({ port: serverPort, hostname: serverHostname });
    } else {
      console.log("[LocalServer] App backgrounded — stopping server");
      await stopLocalServer();
    }
  });
}

export async function initLocalServer(options?: LocalServerOptions): Promise<void> {
  await startLocalServer(options);
  setupLifecycleHandlers();
}
