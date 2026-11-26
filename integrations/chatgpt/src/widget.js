import visdeltaStyles from "visdelta/style.css";
import { registerChartModule } from "visdelta";
import { barModule } from "visdelta/bar";
import { transition } from "visdelta/transition";

registerChartModule(barModule);

const appStyles = `
  :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; }
  .vd-card { padding: 14px; min-width: 280px; }
  .vd-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
  .vd-title { margin: 0; font-size: 15px; font-weight: 650; }
  .vd-meta { font-size: 12px; opacity: .62; white-space: nowrap; }
  #chart { min-height: 300px; width: 100%; }
  .vd-controls { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: center; margin-top: 8px; }
  input[type=range] { width: 100%; }
  button { font: inherit; border: 1px solid color-mix(in srgb, currentColor 18%, transparent); border-radius: 8px; padding: 6px 10px; background: transparent; color: inherit; cursor: pointer; }
  .vd-status { margin: 8px 0 0; font-size: 12px; opacity: .62; }
`;

const style = document.createElement("style");
style.textContent = `${visdeltaStyles}\n${appStyles}`;
document.head.appendChild(style);

document.body.innerHTML = `
  <main class="vd-card">
    <div class="vd-head">
      <h2 class="vd-title" id="title">VisDelta transition</h2>
      <span class="vd-meta" id="meta"></span>
    </div>
    <div id="chart" aria-label="Interactive VisDelta transition"></div>
    <div class="vd-controls">
      <input id="progress" type="range" min="0" max="1" step="0.01" value="0" aria-label="Transition progress" />
      <button id="replay" type="button">Replay</button>
    </div>
    <p class="vd-status" id="status">Waiting for tool result…</p>
  </main>
`;

const titleEl = document.getElementById("title");
const metaEl = document.getElementById("meta");
const chartEl = document.getElementById("chart");
const progressEl = document.getElementById("progress");
const replayEl = document.getElementById("replay");
const statusEl = document.getElementById("status");

let activeTransition = null;
let latestPayload = null;
let replayTimer = null;

function isViewSpec(value) {
  return Boolean(value) && typeof value === "object" && value.mark === "bar" && value.encoding && value.data;
}

async function renderPayload(payload) {
  if (!payload || !isViewSpec(payload.from) || !isViewSpec(payload.to)) {
    statusEl.textContent = "Invalid transition payload.";
    return;
  }

  latestPayload = payload;
  clearTimeout(replayTimer);
  activeTransition?.destroy();
  chartEl.replaceChildren();

  titleEl.textContent = payload.title || "VisDelta transition";
  const fromField = payload.from?.encoding?.y?.field ?? "from";
  const toField = payload.to?.encoding?.y?.field ?? "to";
  metaEl.textContent = `${fromField} → ${toField}`;
  statusEl.textContent = "Compiling transition…";

  try {
    activeTransition = await transition(payload.from, payload.to, { target: chartEl });
    progressEl.value = "0";
    activeTransition.progress(0);
    statusEl.textContent = "Drag to seek the declarative transition.";
  } catch (error) {
    console.error(error);
    statusEl.textContent = error instanceof Error ? error.message : "Could not render transition.";
  }
}

progressEl.addEventListener("input", () => {
  if (!activeTransition) return;
  clearTimeout(replayTimer);
  activeTransition.progress(progressEl.valueAsNumber);
});

replayEl.addEventListener("click", () => {
  if (!activeTransition) return;
  clearTimeout(replayTimer);
  progressEl.value = "0";
  activeTransition.progress(0).play({ duration: 700, from: 0, to: 1 });
  replayTimer = setTimeout(() => {
    progressEl.value = "1";
  }, 720);
});

let rpcId = 0;
const pendingRequests = new Map();

function rpcNotify(method, params) {
  window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
}

function rpcRequest(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++rpcId;
    pendingRequests.set(id, { resolve, reject });
    window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
  });
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || message.jsonrpc !== "2.0") return;

  if (typeof message.id === "number") {
    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);
    if (message.error) pending.reject(message.error);
    else pending.resolve(message.result);
    return;
  }

  if (message.method === "ui/notifications/tool-result") {
    void renderPayload(message.params?.structuredContent);
  }
}, { passive: true });

async function initializeBridge() {
  await rpcRequest("ui/initialize", {
    appInfo: { name: "visdelta-transition-widget", version: "0.1.0" },
    appCapabilities: {},
    protocolVersion: "2026-01-26"
  });
  rpcNotify("ui/notifications/initialized", {});
}

initializeBridge().catch((error) => {
  console.error(error);
  statusEl.textContent = "Could not initialize the MCP Apps bridge.";
});

window.addEventListener("beforeunload", () => {
  clearTimeout(replayTimer);
  activeTransition?.destroy();
});
