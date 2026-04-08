# CornerPOSHttpServer — Capacitor Native Plugin

This directory contains the native iOS Swift plugin that runs a local HTTP server
inside the Capacitor app, allowing an AI agent on the same device (or local
network) to control the POS via standard HTTP requests.

## How It Works

1. The plugin uses [GCDWebServer](https://github.com/nicklockwood/GCDWebServer) to
   run a lightweight HTTP server (default: `http://127.0.0.1:8080`).
2. Incoming HTTP requests are forwarded to the JavaScript layer via Capacitor's
   `notifyListeners("request", ...)` mechanism.
3. The JS side (`client/src/lib/local-server.ts`) processes each request through the
   shared API handlers (`shared/api-handlers.ts`), which read/write from the local
   Dexie (IndexedDB) database.
4. The JS side calls `CornerPOSHttpServer.respond(...)` to send the response back
   to the waiting HTTP client.

## Files

- `CornerPOSHttpServerPlugin.swift` — Swift plugin implementation
- `CornerPOSHttpServerPlugin.m` — Objective-C bridge (CAP_PLUGIN macro registration)
- `Package.swift` — Swift Package Manager manifest (for standalone use)

The same files are also copied into `ios/App/App/` for direct integration with
the Capacitor iOS project.

## Integration (Already Done)

The plugin is already integrated in the committed iOS project:

1. `ios/App/App/CornerPOSHttpServerPlugin.swift` — Plugin code
2. `ios/App/App/CornerPOSHttpServerPlugin.m` — Obj-C bridge
3. `ios/App/Podfile` — Includes `pod 'GCDWebServer', '~> 3.0'`

To build:

```bash
npm run build
npx cap sync ios
cd ios/App && pod install
open App.xcworkspace  # in Xcode
```

## Endpoints Available

Once the server starts, the following endpoints are available at
`http://127.0.0.1:8080`:

- `GET /api/local/status` — Health check
- `GET/POST/PUT/DELETE /api/admin/{products,variants,modifiers,...}` — Full CRUD
- `POST /api/orders/simulate` — Create a sale from variant selections
- `GET /api/reports/sales-summary` — Aggregate sales data
- `GET /api/reports/product-mix` — Product mix breakdown
- `GET /api/reports/inventory-status` — Current inventory levels
- `GET /api/admin/all-data` — Dump all admin data

## Network Configuration

By default the server binds to `127.0.0.1` (localhost only), so only apps on
the same device can reach it. To allow access from other devices on the same
local network (e.g., an AI agent running on a laptop), pass
`hostname: "0.0.0.0"` when calling `initLocalServer`:

```typescript
import { initLocalServer } from "./lib/local-server";
initLocalServer({ port: 8080, hostname: "0.0.0.0" });
```

When bound to `0.0.0.0`, the server is accessible at the device's local IP
address (e.g., `http://192.168.1.42:8080/api/local/status`).
