import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initLocalServer } from "./lib/local-server";

initLocalServer();

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

createRoot(document.getElementById("root")!).render(<App />);
