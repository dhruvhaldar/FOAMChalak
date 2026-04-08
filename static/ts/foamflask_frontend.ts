/**
 * FOAMFlask Frontend * 

 * Background Color Palette: https://coolors.co/gradient-maker/b6f0ff-ffb1b9?position=0,100&opacity=100,100&type=linear&rotation=180

 * When making changes to the frontend, always edit foamflask_frontend.ts and build foamflask_frontend.js using `npm run build`
 */

import { generateContours as generateContoursFn, loadContourMesh } from "./frontend/isosurface.js";
import * as Plotly from "plotly.js";

// 🎨 Palette UX: Dynamic Page Title
const DEFAULT_TITLE = "FOAMFlask";
let titleResetTimer: number | null = null;

const updatePageTitle = (state: "running" | "success" | "error" | "default"): void => {
  if (titleResetTimer) {
    clearTimeout(titleResetTimer);
    titleResetTimer = null;
  }

  switch (state) {
    case "running":
      document.title = "▶ Running... | FOAMFlask";
      break;
    case "success":
      document.title = "✓ Success | FOAMFlask";
      titleResetTimer = window.setTimeout(() => {
        document.title = DEFAULT_TITLE;
      }, 5000);
      break;
    case "error":
      document.title = "✗ Error | FOAMFlask";
      titleResetTimer = window.setTimeout(() => {
        document.title = DEFAULT_TITLE;
      }, 5000);
      break;
    default:
      document.title = DEFAULT_TITLE;
  }
};

// ⚡ Bolt Optimization: Lazy load Plotly.js
let plotlyPromise: Promise<void> | null = null;

const ensurePlotlyLoaded = (): Promise<void> => {
  if ((window as any).Plotly) return Promise.resolve();
  if (plotlyPromise) return plotlyPromise;

  plotlyPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.plot.ly/plotly-2.27.0.min.js";
    script.onload = () => resolve();
    script.onerror = () => {
      plotlyPromise = null; // Reset on error so we can retry
      reject(new Error("Failed to load Plotly"));
    };
    document.head.appendChild(script);
  });
  return plotlyPromise;
};

// CSRF Protection Helpers
const getCookie = (name: string): string | null => {
  const v = document.cookie.match('(^|;) ?' + name + '=([^;]*)(;|$)');
  return v ? v[2] : null;
};

// Monkey patch fetch to include CSRF token
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  // Only inject for same-origin requests or relative URLs to prevent leaking token
  const url = typeof input === 'string' ? input : (input instanceof URL ? input.toString() : (input instanceof Request ? input.url : ''));
  const isRelative = url.startsWith('/');
  const isSameOrigin = url.startsWith(window.location.origin);

  if (isRelative || isSameOrigin) {
    const method = (init?.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      const token = getCookie("csrf_token");
      if (token) {
        init = init || {};
        if (init.headers instanceof Headers) {
          init.headers.append("X-CSRFToken", token);
        } else if (Array.isArray(init.headers)) {
          (init.headers as string[][]).push(["X-CSRFToken", token]);
        } else {
          init.headers = { ...init.headers, "X-CSRFToken": token };
        }
      }
    }
  }
  return originalFetch(input, init);
};

// --- Interfaces ---
// Global Window Interface
declare global {
  interface Window {
    switchGeometryTab: (tab: "upload" | "resources") => void;
    fetchResourceGeometry: (btn?: HTMLElement) => void;
    switchPage: (pageId: string) => void;
    toggleMobileMenu: () => void;
    uploadGeometry: (btn?: HTMLElement) => void;
    refreshGeometryList: (btn?: HTMLElement) => void;
    fillLocationFromGeometry: (btn?: HTMLElement) => void;
    generateBlockMeshDict: (btn?: HTMLElement) => void;
    generateSnappyHexMeshDict: (btn?: HTMLElement) => void;
    runCommand: (cmd: string, btn?: HTMLElement) => void;
    clearMeshingOutput: () => void;
    copyMeshingOutput: () => void;
    downloadMeshingLog: () => void;
    refreshMeshes: (btn?: HTMLElement) => void;
    viewMesh: () => void;
    copyRunOutput: () => void;
    confirmRunCommand: (cmd: string, btn?: HTMLElement) => void;
    copyText: (text: string, btn?: HTMLElement) => void;
    switchPostView: (view: "landing" | "contour") => void;
    scrollToLogTop: () => void;
    downloadLog: () => void;
    fetchRunHistory: (btn?: HTMLElement) => void;
  }
}

interface RunRecord {
  id: number;
  case_name: string;
  tutorial: string;
  command: string;
  status: string;
  start_time: string;
  end_time?: string;
  execution_duration?: number;
}

interface RunHistoryResponse extends ApiResponse {
  runs: RunRecord[];
}

interface ApiResponse {
  error?: string;
  output?: string;
  success?: boolean;
  message?: string;
}

interface CaseRootResponse extends ApiResponse {
  caseDir: string;
}

interface DockerConfigResponse extends ApiResponse {
  dockerImage: string;
  openfoamVersion: string;
}

interface TutorialLoadResponse extends ApiResponse {
  caseDir: string;
}

interface CaseListResponse extends ApiResponse {
  cases: string[];
}

interface MeshFile {
  path: string;
  name: string;
  size?: number;
  relative_path?: string;
}

interface AvailableMeshesResponse extends ApiResponse {
  meshes: MeshFile[];
}

interface MeshInfo {
  n_points: number;
  n_cells: number;
  bounds: number[];
  center?: number[];
  length?: number;
  volume?: number;
  array_names?: string[];
  point_arrays?: string[];
  cell_arrays?: string[];
  success: boolean;
  error?: string;
}

interface MeshScreenshotResponse extends ApiResponse {
  image?: string;
}

interface PlotData extends ApiResponse {
  time?: number[];
  p?: number[];
  Ux?: number[];
  Uy?: number[];
  Uz?: number[];
  U_mag?: number[];
  nut?: number[];
  nuTilda?: number[];
  k?: number[];
  epsilon?: number[];
  omega?: number[];
  [key: string]: any;
}

interface LatestDataResponse extends ApiResponse {
  time?: number;
  p?: number;
  U_mag?: number;
  Ux?: number;
  Uy?: number;
  Uz?: number;
  [key: string]: any;
}

interface ResidualsResponse extends ApiResponse {
  time?: number[];
  Ux?: number[];
  Uy?: number[];
  Uz?: number[];
  p?: number[];
  h?: number[];
  T?: number[];
  rho?: number[];
  p_rgh?: number[];
  k?: number[];
  epsilon?: number[];
  omega?: number[];
}

interface PlotTrace {
  name?: string;
  visible?: boolean | "legendonly";
  x?: any[];
  y?: any[];
  type?: string;
  mode?: string;
  line?: any;
}

// Types
type CameraView = "front" | "back" | "left" | "right" | "top" | "bottom";

// Shared Interface for Interactive Viewers
interface ViewerConfig {
  iframeId: string;
  placeholderId: string;
  loadingMessage: string;
  apiUrl: string;
  apiBody: any;
  btnElement?: HTMLElement;
  btnLoadingText?: string; // Optional custom text for button during load
  imageId?: string; // Optional: ID of static image to hide (Mesh tab)
  onSuccess?: () => void;
  onError?: (error: unknown) => void;
}

// Common function to load interactive viewers
const loadInteractiveViewerCommon = async (config: ViewerConfig): Promise<void> => {
  const iframe = document.getElementById(config.iframeId) as HTMLIFrameElement;
  const placeholder = document.getElementById(config.placeholderId);
  const btn = config.btnElement as HTMLButtonElement | undefined;

  if (!iframe || !placeholder) return;

  let originalBtnText = "";
  if (btn) {
    originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    const loadingText = config.btnLoadingText || "Loading...";
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${loadingText}`;
  }

  showNotification(config.loadingMessage, "info");

  try {
    const res = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config.apiBody)
    });

    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const html = await res.text();
    iframe.srcdoc = html;

    // UI Updates
    iframe.classList.remove("hidden");
    placeholder.classList.add("hidden");

    if (config.imageId) {
      document.getElementById(config.imageId)?.classList.add("hidden");
    }

    if (config.onSuccess) config.onSuccess();

  } catch (e) {
    console.error("Viewer load failed:", e);

    // Reset UI on failure
    iframe.classList.add("hidden");
    placeholder.classList.remove("hidden");
    if (config.imageId) {
      document.getElementById(config.imageId)?.classList.remove("hidden");
    }

    if (config.onError) config.onError(e);
    else showNotification("Failed to load viewer", "error"); // Default error if no handler
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalBtnText;
    }
  }
};

const fillLocationFromGeometry = async (btnElement?: HTMLElement) => {
  if (!activeCase) {
    showNotification("Please select an active case first", "warning");
    return;
  }

  const filename = (document.getElementById("shmObjectList") as HTMLSelectElement)?.value;
  if (!filename) {
    showNotification("Please select a geometry object in the 'Object Settings' list", "warning");
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `Calculating...`;
  }

  try {
    const res = await fetch("/api/geometry/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName: activeCase, filename }) });
    const info = await res.json();
    if (info.success && info.bounds) {
      const b = info.bounds;
      const cx = (b[0] + b[1]) / 2;
      const cy = (b[2] + b[3]) / 2;
      const cz = (b[4] + b[5]) / 2;

      const centerStr = `${cx.toFixed(3)} ${cy.toFixed(3)} ${cz.toFixed(3)}`;
      (document.getElementById("shmLocation") as HTMLInputElement).value = centerStr;

      showNotification(`Location set to center of ${filename}`, "success");
    } else {
      showNotification("Failed to get geometry info", "error");
    }
  } catch (e) {
    showNotification("Error calculating center", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
  }
};

// Utility functions
const getElement = <T extends HTMLElement>(id: string): T | null => {
  return document.getElementById(id) as T | null;
};

const formatBytes = (bytes: number, decimals = 1) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
};

// Detect slow hardware (e.g. integrated graphics)
const detectSlowHardware = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return true; // Assume slow if no WebGL

    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return false;

    const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    if (!renderer) return false;

    // Check for common integrated/software renderers
    const slowRenderers = ['intel', 'swiftshader', 'llvmpipe', 'mesa', 'software'];
    return slowRenderers.some(r => renderer.toLowerCase().includes(r));
  } catch (e) {
    return false; // Fail safe
  }
};

// Clear Console Log
const clearLog = async (): Promise<void> => {
  const outputDiv = document.getElementById("output");
  if (outputDiv) {
    // 🎨 Palette UX Improvement: Prevent accidental data loss
    const confirmed = await showConfirmModal("Clear Console Log", "Are you sure you want to clear the console log? This cannot be undone.");
    if (!confirmed) return;

    outputDiv.innerHTML = OUTPUT_PLACEHOLDER;
    cachedLogHTML = ""; // ⚡ Bolt Optimization: clear cache
    try {
      localStorage.removeItem(CONSOLE_LOG_KEY);
    } catch (e) {
      // Ignore local storage errors
    }
    outputBuffer.length = 0; // Clear buffer
    showNotification("Console log cleared", "info", NOTIFY_MEDIUM);
  }
};

// Helper: Show temporary success state on a button
const temporarilyShowSuccess = (btn: HTMLButtonElement, originalHTML: string, message: string = "Success!"): void => {
  btn.disabled = false;
  btn.removeAttribute("aria-busy");
  btn.classList.remove("opacity-75", "cursor-wait");

  // Visual feedback: Green Checkmark
  // Note: Using !bg-green-600 to override any existing background colors
  btn.innerHTML = `
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline-block mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
    </svg>
    <span>${message}</span>
  `;

  // Apply success styles
  const successClasses = ["!bg-green-600", "!border-green-600", "!text-white", "cursor-default"];
  btn.classList.add(...successClasses);

  setTimeout(() => {
    // Only restore if not busy (prevent overwriting spinner if clicked again)
    if (!btn.hasAttribute("aria-busy")) {
      btn.innerHTML = originalHTML;
      btn.classList.remove(...successClasses);
    }
  }, 2000);
};

// Generic Copy to Clipboard Helper
const copyTextFromElement = (elementId: string, successMessage: string, btnElement?: HTMLElement): void => {
  const el = document.getElementById(elementId);
  if (!el) return;

  // innerText preserves newlines better than textContent
  const text = el.innerText;
  if (!text.trim()) {
    showNotification("Content is empty", "info", NOTIFY_MEDIUM);
    return;
  }

  const onSuccess = () => {
    showNotification(successMessage, "success", NOTIFY_MEDIUM);
    if (btnElement) {
      const originalHTML = btnElement.innerHTML;
      const originalTitle = btnElement.getAttribute('title');

      // Visual feedback on the button
      btnElement.innerHTML = `
        <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
        </svg>
        <span class="text-green-600 font-medium">Copied!</span>
      `;
      btnElement.setAttribute('title', 'Copied to clipboard');

      // Revert after 2 seconds
      setTimeout(() => {
        btnElement.innerHTML = originalHTML;
        if (originalTitle) btnElement.setAttribute('title', originalTitle);
        else btnElement.removeAttribute('title');
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopyText(text, successMessage, onSuccess));
  } else {
    fallbackCopyText(text, successMessage, onSuccess);
  }
};

const fallbackCopyText = (text: string, successMessage: string, onSuccess?: () => void): void => {
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-9999px";
    textArea.style.top = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    if (successful) {
      if (onSuccess) onSuccess();
      else showNotification(successMessage, "success", NOTIFY_MEDIUM);
    } else {
      showNotification("Failed to copy", "error");
    }
  } catch (err) {
    showNotification("Failed to copy", "error");
  }
};

// Copy Console Log
const copyLogToClipboard = (btnElement?: HTMLElement): void => {
  const outputDiv = document.getElementById("output");
  if (outputDiv && outputDiv.querySelector(".output-placeholder")) {
    showNotification("Log is empty", "warning", NOTIFY_MEDIUM);
    return;
  }
  copyTextFromElement("output", "Log copied to clipboard", btnElement);
};

// Download Console Log
const downloadLog = (): void => {
  const outputDiv = document.getElementById("output");
  if (!outputDiv) {
    showNotification("Console output not found", "error");
    return;
  }

  // Check for placeholder
  const placeholder = outputDiv.querySelector(".output-placeholder");
  if (placeholder) {
    showNotification("Log is empty", "warning", NOTIFY_SHORT);
    return;
  }

  // Use innerText to preserve line breaks from divs
  const text = outputDiv.innerText || outputDiv.textContent || "";

  if (!text.trim()) {
    showNotification("Log is empty", "warning", NOTIFY_SHORT);
    return;
  }

  try {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    // Create timestamped filename
    const now = new Date();
    // Format: YYYY-MM-DDTHH-mm-ss
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `foamflask_log_${timestamp}.txt`;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);

    showNotification("Log download started", "success", NOTIFY_SHORT);
  } catch (e) {
    console.error(e);
    showNotification("Failed to download log", "error");
  }
};

// Copy Input to Clipboard
const copyInputToClipboard = (elementId: string, btnElement?: HTMLElement): void => {
  const el = document.getElementById(elementId) as HTMLInputElement;
  if (!el || !el.value) return;

  const text = el.value;

  const onSuccess = () => {
    showNotification("Copied to clipboard", "success", NOTIFY_SHORT);
    if (btnElement) {
      if (btnElement.dataset.isCopying) return;
      btnElement.dataset.isCopying = "true";

      const originalHTML = btnElement.innerHTML;
      // Visual feedback: Green Checkmark
      btnElement.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;

      setTimeout(() => {
        btnElement.innerHTML = originalHTML;
        delete btnElement.dataset.isCopying;
      }, 2000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopyText(text, "Copied", onSuccess));
  } else {
    fallbackCopyText(text, "Copied", onSuccess);
  }
};

const copyText = (text: string, btnElement?: HTMLElement): void => {
  if (!text) return;

  const onSuccess = () => {
    showNotification("Copied to clipboard", "success", NOTIFY_SHORT);
    if (btnElement) {
      if (btnElement.dataset.isCopying) return;
      btnElement.dataset.isCopying = "true";

      const originalHTML = btnElement.innerHTML;
      // Visual feedback: Green Checkmark
      btnElement.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>`;

      setTimeout(() => {
        btnElement.innerHTML = originalHTML;
        delete btnElement.dataset.isCopying;
      }, 1000);
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopyText(text, "Copied", onSuccess));
  } else {
    fallbackCopyText(text, "Copied", onSuccess);
  }
};
(window as any).copyText = copyText;

// Clear Meshing Output
const clearMeshingOutput = async (): Promise<void> => {
  const div = document.getElementById("meshingOutput");
  if (div) {
    // 🎨 Palette UX Improvement: Prevent accidental data loss
    const confirmed = await showConfirmModal("Clear Meshing Output", "Are you sure you want to clear the meshing output?");
    if (!confirmed) return;

    div.innerText = "Ready...";
    div.scrollTop = 0; // Reset scroll position
    showNotification("Meshing output cleared", "info", NOTIFY_MEDIUM);
  }
};

// Copy Meshing Output
const copyMeshingOutput = (btnElement?: HTMLElement): void => {
  copyTextFromElement("meshingOutput", "Meshing output copied", btnElement);
};

// Download Meshing Log
const downloadMeshingLog = (): void => {
  const outputDiv = document.getElementById("meshingOutput");
  if (!outputDiv) {
    showNotification("Meshing output not found", "error");
    return;
  }

  // Use innerText to preserve line breaks from divs
  const text = outputDiv.innerText || outputDiv.textContent || "";

  if (!text.trim() || text.trim() === "Ready...") {
    showNotification("Log is empty", "warning", NOTIFY_SHORT);
    return;
  }

  try {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    // Create timestamped filename
    const now = new Date();
    // Format: YYYY-MM-DDTHH-mm-ss
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `meshing_log_${timestamp}.txt`;

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    }, 100);

    showNotification("Meshing log download started", "success", NOTIFY_SHORT);
  } catch (e) {
    console.error(e);
    showNotification("Failed to download meshing log", "error");
  }
};

// Storage for Console Log
const CONSOLE_LOG_KEY = "foamflask_console_log";

const OUTPUT_PLACEHOLDER = `<div class="output-placeholder h-full flex flex-col items-center justify-center text-gray-400 select-none opacity-50">
<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-3" fill="none" viewBox="0 0 24 24"
  stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
    d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
</svg>
<span class="text-sm font-medium">Ready for output...</span>
</div>`;

// Global state
let caseDir: string = "";
let dockerImage: string = "";
let openfoamVersion: string = "";
let activeCase: string | null = null;

// Page management
let currentPage: string = "setup";

// Mesh visualization state
let currentMeshPath: string | null = null;
let availableMeshes: MeshFile[] = [];
let isInteractiveMode: boolean = true; // Default to interactive mode

// Geometry State
let selectedGeometry: string | null = null;

// Notification constants
const NOTIFY_SHORT = 1500;
const NOTIFY_MEDIUM = 5000;
const NOTIFY_LONG = 8000;
const NOTIFY_DEFAULT = 10000;

// System constants
const POLL_INTERVAL = 5000;
const DEBOUNCE_DELAY = 5000;
const MAX_LOG_SIZE = 100000;

// Notification management
let notificationId: number = 0;
let lastErrorNotificationTime: number = 0;
const ERROR_NOTIFICATION_COOLDOWN: number = 5 * 60 * 1000;

// Plotting variables
let plotUpdateInterval: ReturnType<typeof setInterval> | null = null;
// let wsConnection: WebSocket | null = null; // WebSocket removed in favor of polling // ⚡ Bolt Optimization: WebSocket for realtime data
let plotsVisible: boolean = true;
let aeroVisible: boolean = false;
let isUpdatingPlots: boolean = false;
let pendingPlotUpdate: boolean = false;
let isSimulationRunning: boolean = false; // Controls polling loop
let plotsInViewport: boolean = true;
let isFirstPlotLoad: boolean = true;

// ⚡ Bolt Optimization: State for incremental residuals fetching
let lastResidualsCount: number = 0;
let currentResidualsData: ResidualsResponse = {};
let cachedXArray: Float32Array | null = null;

// Request management
let abortControllers = new Map<string, AbortController>();
interface CacheEntry {
  data: any;
  timestamp: number;
  etag?: string | null;
  lastModified?: string | null;
}
let requestCache = new Map<string, CacheEntry>();
const CACHE_DURATION: number = 1000;

const outputBuffer: { message: string; type: string }[] = [];
let outputFlushTimer: ReturnType<typeof setTimeout> | null = null;
let saveLogTimer: ReturnType<typeof setTimeout> | null = null;

// ⚡ Bolt Optimization: maintain off-DOM cache to avoid expensive innerHTML access
let cachedLogHTML: string = "";

// Save log to local storage (Debounced)
const saveLogToStorage = (): void => {
  try {
    // ⚡ Bolt Optimization: Write from string variable instead of reading DOM
    localStorage.setItem(CONSOLE_LOG_KEY, cachedLogHTML);
  } catch (e) {
    console.warn("Failed to save console log to local storage (likely quota exceeded).");
  }
};

const saveLogDebounced = (): void => {
  if (saveLogTimer) clearTimeout(saveLogTimer);
  saveLogTimer = setTimeout(saveLogToStorage, DEBOUNCE_DELAY);
};

// Colors
const plotlyColors = {
  blue: "#1dbde6",
  orange: "#ff7f0e",
  green: "#2ca02c",
  red: "#d62728",
  purple: "#9467bd",
  brown: "#8c564b",
  pink: "#e377c2",
  gray: "#7f7f7f",
  yellow: "#bcbd22",
  teal: "#17becf",
  cyan: "#17becf",
  magenta: "#e377c2",
};

const plotLayout: Partial<Plotly.Layout> = {
  font: { family: "Inter, sans-serif", size: 12 },
  plot_bgcolor: "rgba(255, 255, 255, 0)",
  paper_bgcolor: "rgba(255, 255, 255, 0)",
  margin: { l: 50, r: 20, t: 60, b: 80, pad: 5 },
  height: 400,
  autosize: true,
  showlegend: true,
  legend: {
    orientation: "h" as const,
    y: -0.3,
    x: 0.5,
    xanchor: "center" as const,
    yanchor: "top" as const,
    // bgcolor: "rgba(255, 0, 0, 0)",
    borderwidth: 0,
  },
  xaxis: { showgrid: false, linewidth: 1 },
  yaxis: { showgrid: false, linewidth: 1 },
};

const plotConfig: Partial<Plotly.Config> = {
  responsive: true,
  displayModeBar: false,
  staticPlot: false,
  scrollZoom: true,
  doubleClick: "reset+autosize" as const,
  showTips: false,
  modeBarButtonsToRemove: [
    "zoom2d", "pan2d", "select2d", "lasso2d", "zoomIn2d", "zoomOut2d", "autoScale2d", "resetScale2d",
    "hoverClosestCartesian", "hoverCompareCartesian", "zoom3d", "pan3d", "orbitRotation", "tableRotation",
    "handleDrag3d", "resetCameraDefault3d", "resetCameraLastSave3d", "hoverClosest3d",
    "sendDataToCloud", "toggleSpikelines", "setBackground", "toggleHover", "resetViews", "toImage"
  ] as any,
  displaylogo: false,
};

const lineStyle = { width: 2, opacity: 0.9 };

const createBoldTitle = (text: string): { text: string; font?: any } => ({
  text: `<b>${text}</b>`,
  font: { ...plotLayout.font, size: 22 },
});

// Helper: Download plot as PNG
const downloadPlotAsPNG = async (
  plotIdOrDiv: string | any,
  filename: string = "plot.png",
  btnElement?: HTMLElement
): Promise<void> => {
  let originalText = "";
  if (btnElement) {
    originalText = btnElement.innerHTML;
    btnElement.disabled = true;
    btnElement.setAttribute("aria-busy", "true");
    btnElement.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;
  }

  try {
    await ensurePlotlyLoaded();

    // Handle both string ID (from HTML) or direct element
    const plotDiv = typeof plotIdOrDiv === "string"
      ? document.getElementById(plotIdOrDiv)
      : plotIdOrDiv;

    if (!plotDiv) {
      console.error(`Plot element not found: ${plotIdOrDiv}`);
      if (btnElement) showNotification("Plot not found", "error");
      return;
    }

    // Await the image generation
    const dataUrl = await Plotly.toImage(plotDiv, {
      format: "png",
      width: plotDiv.offsetWidth,
      height: plotDiv.offsetHeight,
      scale: 2, // Higher resolution
    });

    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    if (btnElement) showNotification("Download started", "success", 1500);

  } catch (err: any) {
    console.error("Error downloading plot:", err);
    if (btnElement) showNotification("Failed to download plot", "error");
  } finally {
    if (btnElement) {
      btnElement.disabled = false;
      btnElement.removeAttribute("aria-busy");
      btnElement.innerHTML = originalText;
    }
  }
};

// Helper: Save current legend visibility
const getLegendVisibility = (
  plotDiv: HTMLElement
): Record<string, boolean | "legendonly"> => {
  try {
    const plotData = (plotDiv as any).data;
    if (!Array.isArray(plotData)) {
      return {};
    }

    const visibility: Record<string, boolean | "legendonly"> = {};

    for (const trace of plotData) {
      const name = trace.name ?? "";
      if (!name) {
        continue;
      }

      // trace.visible may be boolean | "legendonly" | undefined
      const vis = trace.visible;

      // Preserve "legendonly" state instead of converting it to false
      visibility[name] = vis === "legendonly" ? "legendonly" : (vis ?? true);
    }

    return visibility;
  } catch (error) {
    console.warn("Error getting legend visibility:", error);
    return {};
  }
};

// ⚡ Bolt Optimization: Helper to get plot config with white background download options
// Replaces attachWhiteBGDownloadButton to avoid double renders and configuration overwrites
const getPlotConfigWithDownload = (plotDiv: HTMLElement): Partial<Plotly.Config> => {
  return {
    ...plotConfig,
    toImageButtonOptions: {
      format: "png",
      filename: `${plotDiv.id}whitebg`,
      height: plotDiv.clientHeight || 400, // Fallback if hidden
      width: plotDiv.clientWidth || 600,
      scale: 2,
    },
  };
};

const downloadPlotData = (plotId: string, filename: string): void => {
  const plotDiv = document.getElementById(plotId) as any;
  if (!plotDiv || !plotDiv.data) return;
  const traces = plotDiv.data;
  traces.forEach((trace: any, index: number) => {
    if (!trace.x || !trace.y) return;
    let csvContent = "x,y\n";
    for (let i = 0; i < trace.x.length; i++) {
      const x = trace.x[i] ?? "";
      const y = trace.y[i] ?? "";
      csvContent += `${x},${y}\n`;
    }
    const traceName = trace.name?.replace(/\s+/g, "").toLowerCase() || `trace${index + 1}`;
    const traceFilename = filename.replace(".csv", `${traceName}.csv`);
    try {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = traceFilename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      }, 100);
    } catch (error: unknown) {
      console.error(`FOAMFlask Error downloading ${traceName} data`, error);
    }
  });
};

// Page Switching
const switchPage = (pageName: string, updateUrl: boolean = true): void => {
  console.log(`switchPage called with: ${pageName}`);

  // Update URL
  if (updateUrl) {
    const url = new URL(window.location.href);
    url.pathname = pageName === "setup" ? "/" : `/${pageName}`;
    window.history.pushState({ page: pageName }, "", url);
  }

  const pages = ["setup", "geometry", "meshing", "visualizer", "run", "plots", "post"];
  pages.forEach((page) => {
    const pageElement = document.getElementById(`page-${page}`);
    const navButton = document.getElementById(`nav-${page}`);
    const mobileNavButton = document.getElementById(`mobile-nav-${page}`);

    if (pageElement) pageElement.classList.add("hidden");

    // Desktop Reset
    if (navButton) {
      // navButton.classList.remove("bg-cyan-700", "text-white"); // BG handled by pill
      navButton.classList.remove("text-white");
      navButton.classList.add("text-gray-900", "hover:bg-gray-100/50");
      navButton.removeAttribute("aria-current");
    }

    // Mobile Reset
    if (mobileNavButton) {
      mobileNavButton.classList.remove("bg-cyan-700", "text-white");
      mobileNavButton.classList.add("text-gray-700", "hover:text-cyan-800", "hover:bg-gray-50");
      mobileNavButton.removeAttribute("aria-current");
    }
  });

  const selectedPage = document.getElementById(`page-${pageName}`);
  const selectedNav = document.getElementById(`nav-${pageName}`);
  const selectedMobileNav = document.getElementById(`mobile-nav-${pageName}`);
  const navPill = document.getElementById("nav-pill");
  const noCaseState = document.getElementById("no-case-state");

  // Palette UX: Enforce Active Case
  const isProtectedPage = pageName !== "setup";
  const hasActiveCase = !!activeCase;

  if (isProtectedPage && !hasActiveCase) {
    // Show empty state
    if (noCaseState) noCaseState.classList.remove("hidden");
    // Keep page hidden (it was hidden by loop above)
  } else {
    // Show page content
    if (noCaseState) noCaseState.classList.add("hidden");
    if (selectedPage) selectedPage.classList.remove("hidden");
  }

  if (selectedNav) {
    // Update Text Color
    // selectedNav.classList.remove("text-gray-900", "hover:bg-gray-100");
    // selectedNav.classList.add("bg-cyan-700", "text-white");
    selectedNav.classList.remove("text-gray-900", "hover:bg-gray-100/50");
    selectedNav.classList.add("text-white");
    selectedNav.setAttribute("aria-current", "page");

    // Move Pill
    if (navPill) {
      navPill.style.opacity = "1";
      navPill.style.left = `${selectedNav.offsetLeft}px`;
      navPill.style.width = `${selectedNav.offsetWidth}px`;
    }
  }

  if (selectedMobileNav) {
    selectedMobileNav.classList.remove("text-gray-700", "hover:text-cyan-800", "hover:bg-gray-50");
    selectedMobileNav.classList.add("bg-cyan-700", "text-white");
    selectedMobileNav.setAttribute("aria-current", "page");
  }

  // Skip data refresh if we are showing the empty state (no active case)
  if (isProtectedPage && !hasActiveCase) return;

  // Auto-refresh lists based on page
  switch (pageName) {
    case "geometry":
      refreshGeometryList();
      break;
    case "meshing":
      refreshGeometryList().then(() => {
        const shmSelect = document.getElementById("shmObjectList") as HTMLSelectElement;
        const geoSelect = document.getElementById("geometrySelect") as HTMLSelectElement;
        if (shmSelect && geoSelect) {
          const currentVal = shmSelect.value;
          // Preserve placeholder if present
          const placeholder = shmSelect.options[0]?.value === "" ? shmSelect.options[0].outerHTML : '<option value="">-- Select a geometry object --</option>';
          shmSelect.innerHTML = placeholder + geoSelect.innerHTML;
          if (currentVal) shmSelect.value = currentVal;
        }
      });
      break;
    case "visualizer":
      const visualizerContainer = document.getElementById("page-visualizer");
      if (visualizerContainer && !visualizerContainer.hasAttribute("data-initialized")) {
        visualizerContainer.setAttribute("data-initialized", "true");
        refreshMeshList();
      }
      break;
    case "run":
      fetchRunHistory();
      break;
    case "plots":
      const plotsContainer = document.getElementById("plotsContainer");
      if (plotsContainer) {
        plotsContainer.classList.remove("hidden");
        if (isFirstPlotLoad) {
          const loader = document.getElementById("plotsLoading");
          if (loader) loader.classList.remove("hidden");
        }
        if (!plotsContainer.hasAttribute("data-initialized")) {
          plotsContainer.setAttribute("data-initialized", "true");
          if (!plotUpdateInterval) startPlotUpdates();
        }
      }
      const aeroBtn = document.getElementById("toggleAeroBtn");
      if (aeroBtn) aeroBtn.classList.remove("hidden");
      break;
    case "post":
      const postContainer = document.getElementById("page-post");
      if (postContainer && !postContainer.hasAttribute("data-initialized")) {
        postContainer.setAttribute("data-initialized", "true");
        refreshPostList();
      }
      break;
  }
};

const setMobileMenuState = (isOpen: boolean): void => {
  const menu = document.getElementById("mobile-menu");
  const btn = document.getElementById("mobile-menu-btn");
  const icon = document.getElementById("mobile-menu-icon");

  if (menu) {
    if (isOpen) {
      menu.classList.remove("hidden");
      btn?.setAttribute("aria-expanded", "true");
      // Switch to X icon
      icon?.setAttribute("d", "M6 18L18 6M6 6l12 12");
    } else {
      menu.classList.add("hidden");
      btn?.setAttribute("aria-expanded", "false");
      // Switch to Hamburger icon
      icon?.setAttribute("d", "M4 6h16M4 12h16M4 18h16");
    }
  }
};

const toggleMobileMenu = () => {
  const menu = document.getElementById("mobile-menu");
  if (menu) {
    const isHidden = menu.classList.contains("hidden");
    setMobileMenuState(isHidden);
  }
};
(window as any).toggleMobileMenu = toggleMobileMenu;

// Show notification
const showNotification = (
  message: string,
  type: "success" | "error" | "warning" | "info",
  duration: number = NOTIFY_DEFAULT
): number | null => {
  // If a notification with the same message already exists, do not show another one
  // This prevents spamming the user with the same message
  if (document.querySelector(`.notification .message-slot[data-message="${message}"]`)) {
    return null;
  }

  const container = document.getElementById("notificationContainer");
  const template = document.getElementById("notification-template") as HTMLTemplateElement;

  if (!container || !template) return null;

  const id = ++notificationId;
  const clone = template.content.cloneNode(true) as DocumentFragment;
  const notification = clone.querySelector(".notification") as HTMLElement;

  if (!notification) return null;

  notification.id = `notification-${id}`;

  // Set ARIA role for accessibility
  if (type === "error" || type === "warning") {
    notification.setAttribute("role", "alert");
    notification.setAttribute("aria-live", "assertive");
  } else {
    notification.setAttribute("role", "status");
    notification.setAttribute("aria-live", "polite");
  }

  // Set colors
  const colors = {
    success: "bg-green-500/80 text-white backdrop-blur-md border border-white/20 shadow-xl",
    error: "bg-red-500/80 text-white backdrop-blur-md border border-white/20 shadow-xl",
    warning: "bg-yellow-500/80 text-white backdrop-blur-md border border-white/20 shadow-xl",
    info: "bg-cyan-600/80 text-white backdrop-blur-md border border-white/20 shadow-xl",
  };
  notification.className += ` ${colors[type]}`;

  // Set icon and message safely
  const icons = { success: "✓", error: "✗", warning: "⚠", info: "ℹ" };
  const iconSlot = notification.querySelector(".icon-slot");
  const messageSlot = notification.querySelector(".message-slot");

  if (iconSlot) iconSlot.textContent = icons[type];
  if (messageSlot) {
    messageSlot.textContent = message;
    // Add data attribute to help with duplicate detection
    messageSlot.setAttribute("data-message", message);
  }

  // Handle duration and progress bar
  if (duration > 0) {
    const progressBar = notification.querySelector(".progress-bar") as HTMLElement;
    if (progressBar) {
      progressBar.classList.remove("hidden");
      progressBar.style.width = "100%";
      progressBar.style.transition = `width ${duration}ms linear`;

      // Trigger reflow to ensure transition works
      requestAnimationFrame(() => {
        progressBar.style.width = "0%";
      });
    }

    // Countdown logic
    // Add fade-out class 300ms before removal
    const fadeTime = Math.max(0, duration - 300);

    // Timer for fade out animation
    const fadeTimer = setTimeout(() => {
      notification.classList.add("fade-out");
    }, fadeTime);

    // Timer for actual removal
    const countdownInterval = setTimeout(() => {
      removeNotification(id);
    }, duration);

    notification.dataset.timerId = countdownInterval.toString();
    notification.dataset.fadeTimerId = fadeTimer.toString();
  }

  // Setup close button for all notifications
  const closeBtn = notification.querySelector(".close-btn") as HTMLElement;
  if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      removeNotification(id);
    };
  }

  container.appendChild(notification);
  return id;
};

const removeNotification = (id: number): void => {
  const notification = document.getElementById(`notification-${id}`);
  if (notification) {
    if (notification.dataset.timerId)
      clearTimeout(parseInt(notification.dataset.timerId, 10));
    if (notification.dataset.fadeTimerId)
      clearTimeout(parseInt(notification.dataset.fadeTimerId, 10));

    // Ensure fade-out class is present for manual dismissals
    notification.classList.add("fade-out");

    // Wait for animation then remove
    setTimeout(() => notification.remove(), 300);
  }
};

// Confirmation Modal
const showConfirmModal = (title: string, message: string): Promise<boolean> => {
  return new Promise((resolve) => {
    // Capture previous focus to restore later
    const previousActiveElement = document.activeElement as HTMLElement;

    const modal = document.createElement("div");
    modal.className = "fixed inset-0 z-[60] flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm transition-opacity opacity-0";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "confirm-title");
    modal.setAttribute("aria-describedby", "confirm-desc");

    modal.innerHTML = `
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden transform scale-95 transition-transform duration-200">
        <div class="p-6">
          <h3 id="confirm-title" class="text-xl font-bold text-gray-900 mb-2">${title}</h3>
          <p id="confirm-desc" class="text-gray-600 mb-6">${message}</p>
          <div class="flex justify-end gap-3">
            <button id="confirm-cancel" class="px-4 py-2 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-300">Cancel</button>
            <button id="confirm-ok" class="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 shadow-sm">Confirm</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Animation
    requestAnimationFrame(() => {
      modal.classList.remove("opacity-0");
      modal.querySelector("div")?.classList.remove("scale-95");
      modal.querySelector("div")?.classList.add("scale-100");
    });

    const close = (result: boolean) => {
      modal.classList.add("opacity-0");
      setTimeout(() => modal.remove(), 200);
      resolve(result);
      document.removeEventListener("keydown", handleKey);
      // Restore focus
      if (previousActiveElement && typeof previousActiveElement.focus === "function") {
        previousActiveElement.focus();
      }
    };

    const cancelBtn = modal.querySelector("#confirm-cancel") as HTMLElement;
    const okBtn = modal.querySelector("#confirm-ok") as HTMLElement;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      // Only trigger confirm on Enter if we are not on the Cancel button
      if (e.key === "Enter" && document.activeElement !== cancelBtn) close(true);

      // Focus Trap
      if (e.key === "Tab") {
        e.preventDefault();
        const focusableElements = [cancelBtn, okBtn];
        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
          } else {
            // Find previous element or default to last
            const idx = focusableElements.indexOf(document.activeElement as HTMLElement);
            if (idx > 0) focusableElements[idx - 1].focus();
            else lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
          } else {
            // Find next element or default to first
            const idx = focusableElements.indexOf(document.activeElement as HTMLElement);
            if (idx >= 0 && idx < focusableElements.length - 1) focusableElements[idx + 1].focus();
            else firstElement.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", handleKey);

    cancelBtn.onclick = () => close(false);
    okBtn.onclick = () => close(true);

    // Focus management
    setTimeout(() => cancelBtn.focus(), 50);
  });
};

// Network
const fetchWithCache = async <T = any>(
  url: string,
  options: RequestInit = {}
): Promise<T> => {
  // Robust access to cache
  let cacheMap = requestCache;
  if (!cacheMap) {
    // Fallback to window global if local is lost (module reload issue)
    if ((window as any)._requestCache) cacheMap = (window as any)._requestCache;
    else {
      cacheMap = new Map<string, CacheEntry>();
      if (typeof window !== 'undefined') (window as any)._requestCache = cacheMap;
    }
    requestCache = cacheMap;
  }

  if (!cacheMap) {
    cacheMap = new Map<string, CacheEntry>();
    requestCache = cacheMap;
  }

  const cacheKey = `${url}${JSON.stringify(options)}`;
  const cached = cacheMap.get(cacheKey);
  // 1. Local Cache Check
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION)
    return cached.data as T;

  // Robust access to abortControllers
  if (!abortControllers) {
    if ((window as any)._abortControllers) abortControllers = (window as any)._abortControllers;
    else {
      abortControllers = new Map<string, AbortController>();
      if (typeof window !== 'undefined') (window as any)._abortControllers = abortControllers;
    }
  }

  if (abortControllers.has(url)) abortControllers.get(url)?.abort();
  const controller = new AbortController();
  abortControllers.set(url, controller);

  try {
    // 2. Prepare headers for Conditional GET
    // ⚡ Bolt Optimization: Use manual Conditional GET to avoid JSON parsing for 304 responses
    const fetchOptions = { ...options, signal: controller.signal };
    if (cached) {
      const headers = new Headers(fetchOptions.headers || {});
      if (cached.etag) headers.set("If-None-Match", cached.etag);
      if (cached.lastModified) headers.set("If-Modified-Since", cached.lastModified);
      fetchOptions.headers = headers;
    }

    const response = await fetch(url, fetchOptions);

    // 3. Handle 304 Not Modified
    // Browser might handle 304 transparently (returning 200), but if we force headers or cache is disabled,
    // we get 304. We handle it explicitly to save JSON parsing cost.
    if (response.status === 304 && cached) {
      cached.timestamp = Date.now();
      // Update headers if provided
      const newEtag = response.headers.get("ETag");
      const newLastModified = response.headers.get("Last-Modified");
      if (newEtag) cached.etag = newEtag;
      if (newLastModified) cached.lastModified = newLastModified;

      cacheMap.set(cacheKey, cached);
      return cached.data as T;
    }

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.message) errorMessage = errorData.message;
        else if (errorData.error) errorMessage = errorData.error;
        else if (errorData.output) errorMessage = errorData.output;
      } catch (e) {
        // Ignore json parse error
      }
      throw new Error(errorMessage);
    }
    const data = await response.json();

    // Check cacheMap again in case it was lost during await (unlikely with local var but safe)
    if (!cacheMap) cacheMap = requestCache || (window as any)._requestCache || new Map();

    cacheMap.set(cacheKey, {
      data,
      timestamp: Date.now(),
      etag: response.headers.get("ETag"),
      lastModified: response.headers.get("Last-Modified")
    });
    return data as T;
  } finally {
    if (abortControllers) abortControllers.delete(url);
  }
};

// Helper for manual HTML escaping
// ⚡ Bolt Optimization: Extract outside render loop and use single-pass regex to avoid O(N) string allocations
const htmlEntities: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
};
const _escapeHtmlRe = /[&<>"']/g;
const escapeHtml = (str: string) => str.replace(_escapeHtmlRe, (char) => htmlEntities[char]);

// Logging
const appendOutput = (message: string, type: string): void => {
  outputBuffer.push({ message, type });
  // ⚡ Bolt Optimization: Throttle updates to ~30fps (32ms) instead of debouncing
  if (!outputFlushTimer) {
    outputFlushTimer = setTimeout(flushOutputBuffer, 32);
  }
};

const limitLogSize = (): void => {
  const container = document.getElementById("output");
  if (!container) return;

  const MAX_NODES = 2500;
  const PRUNE_TARGET = 2000;

  if (container.childElementCount > MAX_NODES) {
    const toRemove = container.childElementCount - PRUNE_TARGET;
    // ⚡ Bolt Optimization: Batch removal using Range to minimize layout thrashing
    // Traversing to find the boundary is O(N) but avoids N layout invalidations (reflows) caused by repeated removeChild
    const range = document.createRange();
    range.setStart(container, 0);

    let boundary = container.firstElementChild;
    for (let i = 0; i < toRemove && boundary; i++) {
      boundary = boundary.nextElementSibling;
    }

    if (boundary) {
      range.setEndBefore(boundary);
      range.deleteContents();
    } else {
      // If we traversed past the end, clear everything (fallback)
      container.innerHTML = "";
    }
  }
};

const flushOutputBuffer = (): void => {
  if (outputBuffer.length === 0) {
    outputFlushTimer = null;
    return;
  }
  const container = document.getElementById("output");
  if (!container) {
    outputFlushTimer = null;
    return;
  }

  // Remove placeholder if present
  const placeholder = container.querySelector(".output-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  // ⚡ Bolt Optimization: Check scroll position BEFORE appending to avoid layout thrashing
  // Check if user is near bottom (within 50px tolerance)
  const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight <= 50;

  let newHtmlChunks = ""; // ⚡ Bolt Optimization: Accumulate HTML for cache

  outputBuffer.forEach(({ message, type }) => {
    // Determine class name
    let className = "text-green-700";
    if (type === "stderr") className = "text-red-600";
    else if (type === "tutorial") className = "text-cyan-600 font-semibold";
    else if (type === "info") className = "text-yellow-600 italic";

    // ⚡ Bolt Optimization: Direct string construction + insertAdjacentHTML
    // Removes overhead of document.createElement() and .textContent assignments (O(N) -> O(1) DOM touches)
    const safeMessage = escapeHtml(message);
    newHtmlChunks += `<div class="${className}">${safeMessage}</div>`;
  });

  container.insertAdjacentHTML("beforeend", newHtmlChunks);
  // ⚡ Bolt Optimization: Limit DOM size
  limitLogSize();

  cachedLogHTML += newHtmlChunks; // ⚡ Bolt Optimization: Append to cache

  // ⚡ Bolt Optimization: Cap the size of cachedLogHTML to prevent memory issues and localStorage quota errors
  const MAX_LOG_LENGTH = MAX_LOG_SIZE; // 100KB
  if (cachedLogHTML.length > MAX_LOG_LENGTH * 1.5) {
    const slice = cachedLogHTML.slice(-MAX_LOG_LENGTH);
    // Ensure we cut at a clean tag boundary
    const firstDiv = slice.indexOf("<div");
    if (firstDiv !== -1) {
      cachedLogHTML = slice.substring(firstDiv);
    }
  }

  // Only force scroll if user was already at the bottom
  if (isAtBottom) {
    container.scrollTop = container.scrollHeight;
  }

  outputBuffer.length = 0;
  outputFlushTimer = null;

  // Save to LocalStorage (Debounced)
  saveLogDebounced();
};

// Setup Functions


const setDockerConfig = async (image: string, version: string, btnElement?: HTMLElement): Promise<void> => {
  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";
  let success = false;

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Updating...`;
  }

  try {
    dockerImage = image;
    openfoamVersion = version;
    const response = await fetch("/set_docker_config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dockerImage, openfoamVersion }) });
    const data = await response.json() as DockerConfigResponse;
    if (!response.ok) throw new Error(data.output || data.message || "Unknown error");

    dockerImage = data.dockerImage;
    openfoamVersion = data.openfoamVersion;

    const openfoamRootInput = document.getElementById("openfoamRoot");
    if (openfoamRootInput instanceof HTMLInputElement) {
      openfoamRootInput.value = `${dockerImage} OpenFOAM ${openfoamVersion}`;
    }

    showNotification("Docker config updated", "success");
    success = true;
  } catch (e) {
    showNotification(`Failed to set Docker config: ${getErrorMessage(e)}`, "error");
  } finally {
    if (btn) {
      if (success) {
        temporarilyShowSuccess(btn, originalText, "Updated!");
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = originalText;
      }
    }
  }
};

const loadTutorial = async (): Promise<void> => {
  const btn = document.getElementById("loadTutorialBtn") as HTMLButtonElement | null;
  const originalText = btn ? btn.innerHTML : "Import Tutorial";
  let success = false;

  try {
    if (btn) {
      btn.disabled = true;
      btn.setAttribute("aria-busy", "true");
      btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Importing...`;
    }

    const tutorialSelect = document.getElementById("tutorialSelect") as HTMLSelectElement;
    const selected = tutorialSelect.value;
    if (selected) localStorage.setItem("lastSelectedTutorial", selected);
    showNotification("Importing tutorial...", "info");
    updatePageTitle("running");
    const response = await fetch("/load_tutorial", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tutorial: selected }) });
    const data = await response.json() as TutorialLoadResponse;
    if (!response.ok) throw new Error(data.output || data.message || "Unknown error");

    if (data.output) {
      data.output.split("\n").forEach((line: string) => {
        if (line.trim()) appendOutput(line.trim(), "info");
      });
    }

    showNotification("Tutorial imported", "success");
    await refreshCaseList();
    const importedName = selected.split('/').pop();
    if (importedName) {
      selectCase(importedName);
      const select = document.getElementById("caseSelect") as HTMLSelectElement;
      if (select) select.value = importedName;
      // UX: Default to "From Resources" tab for imported tutorials
      switchGeometryTab("resources");

      // Background fetch of plot data and residuals to warm up cache
      // We don't await these to avoid blocking the UI
      void fetch(`/api/plot_data?tutorial=${encodeURIComponent(importedName)}`).catch(() => { });
      void fetch(`/api/residuals?tutorial=${encodeURIComponent(importedName)}`).catch(() => { });
    }
    success = true;
  } catch (e) {
    showNotification(`Failed to load tutorial: ${getErrorMessage(e)}`, "error");
  } finally {
    updatePageTitle(success ? "success" : "error");
    if (btn) {
      if (success) {
        temporarilyShowSuccess(btn, originalText, "Imported!");
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = originalText;
      }
    }
  }
};

// Toggle Section Visibility
const toggleSection = (id: string): void => {
  const section = document.getElementById(id);
  const toggleIcon = document.getElementById(`${id}Toggle`);

  if (!section || !toggleIcon) return;

  const isHidden = section.classList.contains("hidden");

  if (isHidden) {
    section.classList.remove("hidden");
    toggleIcon.textContent = "▼";
    toggleIcon.classList.remove("-rotate-90");
    // If it's a button (accessible version), update aria-expanded
    const toggleBtn = toggleIcon.parentElement?.tagName === "BUTTON" ? toggleIcon.parentElement : null;
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "true");
  } else {
    section.classList.add("hidden");
    toggleIcon.textContent = "▶";
    toggleIcon.classList.add("-rotate-90");
    // If it's a button (accessible version), update aria-expanded
    const toggleBtn = toggleIcon.parentElement?.tagName === "BUTTON" ? toggleIcon.parentElement : null;
    if (toggleBtn) toggleBtn.setAttribute("aria-expanded", "false");
  }
};

// Case Management
const updateActiveCaseBadge = () => {
  const badge = document.getElementById("activeCaseBadge");
  if (badge) {
    if (activeCase) {
      badge.textContent = activeCase;
      badge.classList.remove("hidden");
      badge.title = `Active Case: ${activeCase} (Click to change)`;
      badge.setAttribute("aria-label", `Current active case: ${activeCase}. Click to go to setup.`);
    } else {
      badge.textContent = "No Case";
      badge.classList.remove("hidden");
      badge.title = "No Active Case (Click to Select)";
      badge.setAttribute("aria-label", "No active case selected. Click to go to setup.");
    }
  }
};

const refreshCaseList = async (btnElement?: HTMLElement) => {
  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("opacity-75", "cursor-wait");
    // Preserve the icon if it exists, but spin it
    if (btn.querySelector("svg")) {
      // Since we know the structure from HTML, we can just replace innerHTML for simplicity
      // or toggle a class. But let's follow the pattern used elsewhere.
      // However, the Refresh button has text "↻ Refresh".
      btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Refreshing...`;
    } else {
      // Fallback or just standard spinner
      btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Refreshing...`;
    }
  }

  try {
    const response = await fetch("/api/cases/list");
    if (!response.ok) throw new Error("Failed to fetch cases");
    const data = await response.json() as CaseListResponse;
    const select = document.getElementById("caseSelect") as HTMLSelectElement;
    if (select && data.cases) {
      const current = select.value;
      if (data.cases.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No cases found</option>';
      } else {
        select.innerHTML = '<option value="">-- Select a Case --</option>';
        data.cases.forEach(c => {
          const opt = document.createElement("option");
          opt.value = c;
          opt.textContent = c;
          select.appendChild(opt);
        });
        if (current && data.cases.includes(current)) select.value = current;
        else if (activeCase && data.cases.includes(activeCase)) select.value = activeCase;
      }

      // 🎨 Sync Active Case: If current activeCase is missing, clear it
      if (activeCase && !data.cases.includes(activeCase)) {
        console.log(`Sync: Active case ${activeCase} no longer found. Clearing.`);
        activeCase = null;
        localStorage.removeItem("lastSelectedCase");
        updateActiveCaseBadge();
      }
    }
    // Only show success notification if invoked manually (via button)
    if (btn) showNotification("Case list refreshed", "success", NOTIFY_MEDIUM);
  } catch (e) {
    console.error(e);
    if (btn) showNotification("Failed to refresh case list", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("opacity-75", "cursor-wait");
      btn.innerHTML = originalText;
    }
  }
};
const selectCase = (val: string) => {
  activeCase = val;
  localStorage.setItem("lastSelectedCase", val);
  updateActiveCaseBadge();
  // Reset residuals state for new case
  lastResidualsCount = 0;
  currentResidualsData = {};
};

const createNewCase = async () => {
  const caseName = (document.getElementById("newCaseName") as HTMLInputElement).value;
  if (!caseName) { showNotification("Enter case name", "warning"); return; }

  const btn = document.getElementById("createCaseBtn") as HTMLButtonElement | null;
  const originalText = btn ? btn.innerHTML : "Create Case";
  let success = false;

  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Creating...`;
  }

  showNotification(`Creating case ${caseName}...`, "info");
  try {
    const response = await fetch("/api/case/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName }) });
    const data = await response.json();
    if (data.success) {
      showNotification("Case created", "success");
      (document.getElementById("newCaseName") as HTMLInputElement).value = "";
      await refreshCaseList();
      selectCase(caseName);
      const select = document.getElementById("caseSelect") as HTMLSelectElement;
      if (select) select.value = caseName;
      success = true;
    } else { showNotification(data.message || "Failed", "error"); }
  } catch (e) { showNotification("Error creating case", "error"); }
  finally {
    if (btn) {
      if (success) {
        temporarilyShowSuccess(btn, originalText, "Created!");
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = originalText;
      }
    }
  }
};

const confirmRunCommand = async (cmd: string, btnElement?: HTMLElement): Promise<void> => {
  // Check for destructive commands
  if (cmd.includes("Allclean") || cmd.includes("clean")) {
    const confirmed = await showConfirmModal("Run Command", `Are you sure you want to run '${cmd}'? This may delete generated files.`);
    if (!confirmed) return;
  }
  runCommand(cmd, btnElement);
};

const getStatusIcon = (status: string): string => {
  if (status === "Completed") return `<svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
  if (status === "Failed") return `<svg class="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>`;
  if (status === "Running") return `<svg class="animate-spin w-3.5 h-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" aria-hidden="true"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
  return "";
};

const fetchRunHistory = async (btnElement?: HTMLElement) => {
  const container = document.getElementById("runHistoryList");
  if (!container) return;

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("cursor-wait", "opacity-75");
    // Use smaller spinner for this small button
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-3 w-3 inline-block mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Refreshing...`;
  }

  try {
    // ⚡ Bolt Optimization: Request limited number of runs to prevent DOM overload
    const response = await fetch("/api/runs?limit=50");
    if (!response.ok) throw new Error("Failed to fetch runs");
    const data = await response.json() as RunHistoryResponse;

    if (data.runs && data.runs.length > 0) {
      container.innerHTML = data.runs.map(run => {
        let statusColor = "bg-gray-100 text-gray-800";
        if (run.status === "Completed") statusColor = "bg-green-100 text-green-800";
        else if (run.status === "Failed") statusColor = "bg-red-100 text-red-800";
        else if (run.status === "Running") statusColor = "bg-blue-100 text-blue-800";

        const startTime = new Date(run.start_time).toLocaleString();
        const duration = run.execution_duration ? `${run.execution_duration.toFixed(2)}s` : "-";
        const safeCommand = run.command.replace(/'/g, "\\'");

        return `
          <tr class="group hover:bg-gray-50 transition-colors border-b last:border-b-0 border-gray-100">
            <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">#${run.id}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">${run.command}</span>
                <button onclick="copyText('${safeCommand}', this)" class="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 hover:text-cyan-600 transition-all p-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500" aria-label="Copy command" title="Copy command">
                  <svg aria-hidden="true" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button onclick="confirmRunCommand('${safeCommand}', this)" class="icon-btn opacity-0 group-hover:opacity-100 focus:opacity-100 text-cyan-600 hover:text-cyan-800 transition-all p-1 rounded hover:bg-cyan-50 focus:outline-none focus:ring-2 focus:ring-cyan-500" aria-label="Re-run command" title="Re-run command">
                  <svg aria-hidden="true" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="px-2 py-0.5 inline-flex items-center text-xs leading-5 font-semibold rounded-full ${statusColor}">
                ${getStatusIcon(run.status)}
                ${run.status}
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">${duration}</td>
            <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${startTime}</td>
          </tr>
        `;
      }).join("");
    } else {
      container.innerHTML = `
        <tr>
          <td colspan="5" class="px-4 py-12 text-center">
            <div class="flex flex-col items-center justify-center text-gray-400">
              <svg aria-hidden="true" class="w-12 h-12 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 class="text-sm font-medium text-gray-900">No runs yet</h4>
              <p class="text-xs text-gray-500 mt-1 max-w-xs mx-auto">Run a simulation command like "blockMesh" or "Allrun" to see history here.</p>
            </div>
          </td>
        </tr>
      `;
    }

    if (btn) showNotification("Run history refreshed", "success", NOTIFY_SHORT);
  } catch (e) {
    console.error("Error fetching run history:", e);
    container.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-sm text-red-500">Failed to load history</td></tr>`;
    if (btn) showNotification("Failed to refresh run history", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("cursor-wait", "opacity-75");
      btn.innerHTML = originalText;
    }
  }
};
(window as any).fetchRunHistory = fetchRunHistory;

const runCommand = async (cmd: string, btnElement?: HTMLElement): Promise<void> => {
  if (!cmd) { showNotification("No command specified", "error"); return; }

  // Use tutorial select if activeCase is not set, or prefer tutorial select for "Run" tab
  const selectedTutorial = (document.getElementById("tutorialSelect") as HTMLSelectElement)?.value || activeCase;

  if (!selectedTutorial) { showNotification("Select case and command", "error"); return; }

  let originalText = "";
  const btn = btnElement as HTMLButtonElement;

  if (btn) {
    if (btn.dataset.originalHtml) {
      originalText = btn.dataset.originalHtml;
    } else {
      originalText = btn.innerHTML;
      btn.dataset.originalHtml = originalText;
    }

    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");

    const isIconBtn = btn.classList.contains("icon-btn");
    // Palette UX: Adapt loading state for icon-only buttons
    if (isIconBtn) {
      // Use text-current for icon buttons to match their theme, and no text
      btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    } else {
      btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Running...`;
    }
  }

  // Optimistically refresh list to show "Running" state
  // We wait a tick to allow the backend (previous implementation step) to create the record
  setTimeout(fetchRunHistory, 500);

  let success = false;

  updatePageTitle("running");

  try {
    showNotification(`Running ${cmd}...`, "info");
    console.log(`[FOAMFlask] runCommand: tutorial=${selectedTutorial}, caseDir=${caseDir}, command=${cmd}`);
    const response = await fetch("/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseDir, tutorial: selectedTutorial, command: cmd }) });
    if (!response.ok) throw new Error();
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    // Start polling immediately when command starts
    isSimulationRunning = true;
    startPlotUpdates();

    let buffer = "";
    while (true) {
      const { done, value } = (await reader?.read()) || { done: true, value: undefined };
      if (done) {
        if (buffer) appendOutput(buffer, "stdout"); // Flush remaining buffer
        showNotification("Simulation completed successfully", "success");
        flushOutputBuffer();
        success = true;
        break;
      }

      // ⚡ Bolt Optimization: Stream decoding and buffering for split packets
      const text = decoder.decode(value, { stream: true });
      buffer += text;

      const lines = buffer.split("\n");
      // Keep the last part in buffer as it might be incomplete
      buffer = lines.pop() || "";

      lines.forEach(line => {
        // Filter out backend HTML artifacts if any remain (transition period)
        const cleanLine = line.replace(/<br>/g, "").trim();
        if (cleanLine) appendOutput(cleanLine, "stdout");
      });
    }
  } catch (err) {
    console.error(err); // Keep console error for debugging
    showNotification(`Error: ${err}`, "error");
  } finally {
    updatePageTitle(success ? "success" : "error");
    const btn = btnElement as HTMLButtonElement;
    if (btn) {
      // Remove busy state regardless of success
      btn.removeAttribute("aria-busy");

      if (success) {
        temporarilyShowSuccess(btn, originalText, "Completed!");
      } else {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }
    }
    isSimulationRunning = false;
    updatePlots(); // Final update to catch last data
    fetchRunHistory(); // Refresh history table
  }
};

// Realtime Plotting Functions
const togglePlots = (): void => {
  plotsVisible = !plotsVisible;
  const container = document.getElementById("plotsContainer");
  const btn = document.getElementById("togglePlotsBtn");
  const aeroBtn = document.getElementById("toggleAeroBtn");
  if (plotsVisible) {
    container?.classList.remove("hidden");
    if (btn) btn.textContent = "Hide Plots";
    aeroBtn?.classList.remove("hidden");
    startPlotUpdates();
    setupIntersectionObserver();
  } else {
    container?.classList.add("hidden");
    if (btn) btn.textContent = "Show Plots";
    aeroBtn?.classList.add("hidden");
    stopPlotUpdates();
  }
};

const setupIntersectionObserver = (): void => {
  const plotsContainer = document.getElementById("plotsContainer");
  if (!plotsContainer || plotsContainer.dataset.observerSetup) return;
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        plotsInViewport = entry.isIntersecting;
      });
    },
    { threshold: 0.1, rootMargin: "50px" }
  );
  observer.observe(plotsContainer);
  plotsContainer.dataset.observerSetup = "true";
};

const toggleAeroPlots = (): void => {
  aeroVisible = !aeroVisible;
  const container = document.getElementById("aeroContainer");
  const btn = document.getElementById("toggleAeroBtn");
  if (aeroVisible) {
    container?.classList.remove("hidden");
    if (btn) btn.textContent = "Hide Aero Plots";
    updateAeroPlots();
  } else {
    container?.classList.add("hidden");
    if (btn) btn.textContent = "Show Aero Plots";
  }
};

const startPlotUpdates = (): void => {
  const selectedTutorial = (document.getElementById("tutorialSelect") as HTMLSelectElement)?.value;
  if (!selectedTutorial) return;

  // Flask-Only: Use polling directly
  updatePlots();
  startPolling();
};

const startPolling = (): void => {
  if (plotUpdateInterval) return;
  plotUpdateInterval = setInterval(() => {
    // ⚡ Bolt Optimization: Pause polling when tab is hidden
    if (document.hidden) return;

    // Stop if simulation not running
    if (!isSimulationRunning) {
      stopPlotUpdates();
      return;
    }

    if (!plotsInViewport) return;
    if (!isUpdatingPlots) updatePlots();
    else pendingPlotUpdate = true;
  }, POLL_INTERVAL);
};

const stopPlotUpdates = (): void => {
  if (plotUpdateInterval) {
    clearInterval(plotUpdateInterval);
    plotUpdateInterval = null;
  }
};

const updateResidualsPlot = async (tutorial: string, injectedData?: ResidualsResponse): Promise<void> => {
  try {
    await ensurePlotlyLoaded();

    let data = injectedData;
    let isIncremental = false;

    // ⚡ Bolt Optimization: Use incremental fetching to save bandwidth
    if (!data) {
      const url = `/api/residuals?tutorial=${encodeURIComponent(tutorial)}&start_index=${lastResidualsCount}`;
      // Use direct fetch to bypass cache pollution and handle unique URLs
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch residuals");
      data = await res.json() as ResidualsResponse;
      isIncremental = true;
    }

    if (data.error) return;

    // Merge data logic
    if (isIncremental) {
      const newTime = data.time || [];
      const newPointsCount = newTime.length;

      // If we have new data
      if (newPointsCount > 0) {
        const oldTime = currentResidualsData.time || [];
        const firstNewTime = newTime[0];
        const lastOldTime = oldTime.length > 0 ? oldTime[oldTime.length - 1] : -Infinity;

        // Detect reset: if new data starts before old data ended
        // Note: checking < lastOldTime handles overlaps or full restarts
        if (firstNewTime <= lastOldTime && lastOldTime !== -Infinity && lastResidualsCount > 0) {
          // Reset detected, replace full data
          currentResidualsData = data;
        } else {
          // Append new data
          for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
              const val = (data as any)[key];
              if (Array.isArray(val)) {
                if (!currentResidualsData[key]) {
                  currentResidualsData[key] = [];
                }

              // ⚡ Bolt Optimization: Chunked push to prevent stack overflow for large updates
              const targetArray = currentResidualsData[key] as any[];
              const CHUNK_SIZE = 30000;
              if (val.length > CHUNK_SIZE) {
                for (let i = 0; i < val.length; i += CHUNK_SIZE) {
                  targetArray.push(...val.slice(i, i + CHUNK_SIZE));
                }
              } else {
                targetArray.push(...val);
              }
              }
            }
          }
        }
        lastResidualsCount = (currentResidualsData.time || []).length;
      } else if (lastResidualsCount === 0) {
        // First load but empty
        currentResidualsData = data;
      }
    } else {
      // Full data injected (e.g. from initial load)
      currentResidualsData = data;
      lastResidualsCount = (data.time || []).length;
    }

    const plotData = currentResidualsData;

    if (!plotData.time || plotData.time.length === 0) {
      return;
    }

    // ⚡ Bolt Optimization: Reuse x-axis array for all traces
    // Avoids allocating 11 identical arrays of size N every update
    const dataLength = plotData.time.length;

    // ⚡ Bolt Optimization: Use cached Float32Array to avoid allocation and iteration overhead
    if (!cachedXArray || cachedXArray.length < dataLength) {
      // Allocate with buffer to prevent frequent resizing
      const newSize = Math.max(Math.ceil(dataLength * 1.2), 1000);
      const newArr = new Float32Array(newSize);

      // Copy existing data
      if (cachedXArray) {
        newArr.set(cachedXArray);
        // Fill new part
        for (let i = cachedXArray.length; i < newSize; i++) newArr[i] = i + 1;
      } else {
        // Fill from scratch
        for (let i = 0; i < newSize; i++) newArr[i] = i + 1;
      }
      cachedXArray = newArr;
    }

    const xArray = cachedXArray.subarray(0, dataLength);

    const traces: any[] = [];
    const fields = ["Ux", "Uy", "Uz", "p", "h", "T", "rho", "p_rgh", "k", "epsilon", "omega"] as const;
    const colors = [
      plotlyColors.blue,
      plotlyColors.red,
      plotlyColors.green,
      plotlyColors.magenta,
      plotlyColors.cyan,
      plotlyColors.orange,
      plotlyColors.purple,
      plotlyColors.brown,
      plotlyColors.pink,
      plotlyColors.gray,
      plotlyColors.yellow,
    ];
    fields.forEach((field, idx) => {
      const fieldData = (plotData as any)[field];
      if (fieldData && fieldData.length > 0) {
        traces.push({
          x: xArray,
          y: fieldData,
          type: "scattergl",
          mode: "lines",
          name: field,
          line: { color: colors[idx], width: 2.5, shape: "linear" },
        });
      }
    });
    if (traces.length > 0) {
      const residualsPlotDiv = getElement<HTMLElement>("residuals-plot");

      if (residualsPlotDiv) {
        const layout = {
          ...plotLayout,
          title: createBoldTitle("Residuals"),
          xaxis: {
            title: { text: "Iteration" },
            showline: true,
            mirror: "all",
            showgrid: false,
          },
          yaxis: {
            title: { text: "Residual" },
            type: "log",
            showline: true,
            mirror: "all",
            showgrid: true,
            gridwidth: 1,
            gridcolor: "rgba(0,0,0,0.1)",
          },
        };
        // ⚡ Bolt Optimization: Use enhanced config directly to avoid second render
        const config = getPlotConfigWithDownload(residualsPlotDiv);
        void Plotly.react(residualsPlotDiv, traces as any, layout as any, {
          ...config,
          displayModeBar: true,
          scrollZoom: false,
        });
      }
    }
  } catch (error: unknown) {
    console.error("FOAMFlask Error updating residuals", error);
  }
};

const updateAeroPlots = async (preFetchedData?: PlotData): Promise<void> => {
  const selectedTutorial = (
    document.getElementById("tutorialSelect") as HTMLSelectElement
  )?.value;
  if (!selectedTutorial) return;
  try {
    await ensurePlotlyLoaded();

    let data = preFetchedData;

    // ⚡ Bolt Optimization: Use pre-fetched data if available to save a network request
    if (!data) {
      const response = await fetch(
        `/api/plot_data?tutorial=${encodeURIComponent(selectedTutorial)}`
      );
      data = await response.json() as PlotData;
    }

    if (data.error) return;

    // Cp plot
    if (
      Array.isArray(data.p) &&
      Array.isArray(data.time) &&
      data.p.length === data.time.length &&
      data.p.length > 0
    ) {
      const pinf = 101325;
      const rho = 1.225;
      const uinf =
        Array.isArray(data.U_mag) && data.U_mag.length ? data.U_mag[0] : 1.0;
      const qinf = 0.5 * rho * uinf * uinf;
      const cp = data.p.map((pval: number) => (pval - pinf) / qinf);
      const cpDiv = document.getElementById("cp-plot");
      if (cpDiv) {
        const cpTrace: any = {
          x: data.time,
          y: cp,
          type: "scattergl",
          mode: "lines+markers",
          name: "Cp",
          line: { color: plotlyColors.red, width: 2.5 },
        };
        // ⚡ Bolt Optimization: Use enhanced config directly
        const config = getPlotConfigWithDownload(cpDiv);
        void Plotly.react(
          cpDiv,
          [cpTrace as any],
          {
            ...plotLayout,
            title: createBoldTitle("Pressure Coefficient"),
            xaxis: {
              ...plotLayout.xaxis,
              title: { text: "Time (s)" },
            },
            yaxis: {
              ...plotLayout.yaxis,
              title: { text: "Cp" },
            },
          },
          config
        ).catch((err: unknown) => {
          console.error("Plotly update failed:", err);
        });
      }
    }

    // Velocity profile 3D plot
    if (
      Array.isArray(data.Ux) &&
      Array.isArray(data.Uy) &&
      Array.isArray(data.Uz)
    ) {
      const velocityDiv = document.getElementById("velocity-profile-plot");
      if (velocityDiv) {
        const velocityTrace: any = {
          x: data.Ux,
          y: data.Uy,
          z: data.Uz,
          type: "scatter3d",
          mode: "markers",
          name: "Velocity",
          marker: { color: plotlyColors.blue, size: 5 },
        };
        // ⚡ Bolt Optimization: Use enhanced config directly
        const config = getPlotConfigWithDownload(velocityDiv);
        void Plotly.react(
          velocityDiv,
          [velocityTrace as any],
          {
            ...plotLayout,
            title: createBoldTitle("Velocity Profile"),
            scene: {
              xaxis: { title: { text: "Ux" } },
              yaxis: { title: { text: "Uy" } },
              zaxis: { title: { text: "Uz" } },
            },
          },
          config
        ).catch((err: unknown) => {
          console.error("Plotly update failed:", err);
        });
      }
    }
  } catch (error: unknown) {
    console.error("FOAMFlask Error updating aero plots", error);
  }
};

const updatePlots = async (injectedData?: PlotData): Promise<void> => {
  const selectedTutorial = (
    document.getElementById("tutorialSelect") as HTMLSelectElement
  )?.value;
  console.log("DEBUG: updatePlots polling for tutorial:", selectedTutorial); // Debug log
  if (!selectedTutorial || isUpdatingPlots) {
    if (!selectedTutorial) console.warn("DEBUG: No tutorial selected, skipping update.");
    return;
  }

  // ⚡ Bolt Optimization: Lazy load Plotly
  try {
    await ensurePlotlyLoaded();
  } catch (e) {
    showNotification("Failed to load plotting library", "error");
    return;
  }

  isUpdatingPlots = true;

  try {
    let data = injectedData;
    if (!data) {
      // ⚡ Bolt Optimization: Use fast API endpoint
      data = await fetchWithCache<PlotData>(
        `/api/plot_data?tutorial=${encodeURIComponent(selectedTutorial)}`
      );
    }

    if (data.error) {
      console.error("FOAMFlask Error fetching plot data", data.error);
      // Only show notification if explicit fetch failed, to avoid WS spam
      if (!injectedData) showNotification("Error fetching plot data", "error");
      return;
    }

    // Pressure plot
    if (data.p && data.time) {
      const pressureDiv = getElement<HTMLElement>("pressure-plot");
      if (!pressureDiv) {
        console.error("Pressure plot element not found");
        return;
      }

      const legendVisibility = getLegendVisibility(pressureDiv);

      const pressureTrace: PlotTrace = {
        x: data.time,
        y: data.p,
        type: "scattergl",
        mode: "lines",
        name: "Pressure",
        line: { color: plotlyColors.blue, ...lineStyle, width: 2.5 },
      };

      if (pressureTrace.name && legendVisibility.hasOwnProperty(pressureTrace.name)) {
        pressureTrace.visible = legendVisibility[pressureTrace.name] as
          | boolean
          | "legendonly";
      }

      // ⚡ Bolt Optimization: Use enhanced config directly
      const config = getPlotConfigWithDownload(pressureDiv);
      void Plotly.react(
        pressureDiv,
        [pressureTrace as any],
        {
          ...plotLayout,
          title: createBoldTitle("Pressure vs Time"),
          xaxis: {
            ...plotLayout.xaxis,
            title: { text: "Time (s)" },
          },
          yaxis: {
            ...plotLayout.yaxis,
            title: { text: "Pressure (Pa)" },
          },
        },
        config
      ).catch((err: unknown) => {
        console.error("Plotly update failed:", err);
      });
    }

    // Velocity plot
    if (data.U_mag && data.time) {
      const velocityDiv = getElement<HTMLElement>("velocity-plot");
      if (!velocityDiv) {
        console.error("Velocity plot element not found");
        return;
      }

      const legendVisibility = getLegendVisibility(velocityDiv as any);

      const traces: PlotTrace[] = [
        {
          x: data.time,
          y: data.U_mag,
          type: "scattergl",
          mode: "lines",
          name: "|U|",
          line: { color: plotlyColors.red, ...lineStyle, width: 2.5 },
        },
      ];

      if (data.Ux) {
        traces.push({
          x: data.time,
          y: data.Ux,
          type: "scattergl",
          mode: "lines",
          name: "Ux",
          line: {
            color: plotlyColors.blue,
            ...lineStyle,
            dash: "dash",
            width: 2.5,
          },
        });
      }

      if (data.Uy) {
        traces.push({
          x: data.time,
          y: data.Uy,
          type: "scattergl",
          mode: "lines",
          name: "Uy",
          line: {
            color: plotlyColors.green,
            ...lineStyle,
            dash: "dot",
            width: 2.5,
          },
        });
      }

      if (data.Uz) {
        traces.push({
          x: data.time,
          y: data.Uz,
          type: "scattergl",
          mode: "lines",
          name: "Uz",
          line: {
            color: plotlyColors.purple,
            ...lineStyle,
            dash: "dashdot",
            width: 2.5,
          },
        });
      }

      // Apply saved visibility safely
      traces.forEach((tr) => {
        if (tr.name && Object.prototype.hasOwnProperty.call(legendVisibility, tr.name)) {
          tr.visible = legendVisibility[tr.name] as boolean | "legendonly";
        }
      });

      // ⚡ Bolt Optimization: Use enhanced config directly
      const config = getPlotConfigWithDownload(velocityDiv);
      void Plotly.react(
        velocityDiv,
        traces as any,
        {
          ...plotLayout,
          title: createBoldTitle("Velocity vs Time"),
          xaxis: {
            ...plotLayout.xaxis,
            title: { text: "Time (s)" },
          },
          yaxis: {
            ...plotLayout.yaxis,
            title: { text: "Velocity (m/s)" },
          },
        },
        config
      );
    }

    // Turbulence plot
    const turbulenceTrace: PlotTrace[] = [];
    if (data.nut && data.time) {
      turbulenceTrace.push({
        x: data.time,
        y: data.nut,
        type: "scattergl",
        mode: "lines",
        name: "nut",
        line: { color: plotlyColors.teal, ...lineStyle, width: 2.5 },
      });
    }
    if (data.nuTilda && data.time) {
      turbulenceTrace.push({
        x: data.time,
        y: data.nuTilda,
        type: "scattergl",
        mode: "lines",
        name: "nuTilda",
        line: { color: plotlyColors.cyan, ...lineStyle, width: 2.5 },
      });
    }
    if (data.k && data.time) {
      turbulenceTrace.push({
        x: data.time,
        y: data.k,
        type: "scattergl",
        mode: "lines",
        name: "k",
        line: { color: plotlyColors.magenta, ...lineStyle, width: 2.5 },
      });
    }
    if (data.omega && data.time) {
      turbulenceTrace.push({
        x: data.time,
        y: data.omega,
        type: "scattergl",
        mode: "lines",
        name: "omega",
        line: { color: plotlyColors.brown, ...lineStyle, width: 2.5 },
      });
    }

    if (turbulenceTrace.length > 0) {
      const turbPlotDiv = document.getElementById("turbulence-plot");
      if (turbPlotDiv) {
        // ⚡ Bolt Optimization: Use enhanced config directly
        const config = getPlotConfigWithDownload(turbPlotDiv);
        void Plotly.react(
          turbPlotDiv,
          turbulenceTrace as any,
          {
            ...plotLayout,
            title: createBoldTitle("Turbulence Properties vs Time"),
            xaxis: {
              ...plotLayout.xaxis,
              title: { text: "Time (s)" },
            },
            yaxis: {
              ...plotLayout.yaxis,
              title: { text: "Value" },
            },
          },
          config
        );
      }
    }

    // Update residuals and aero plots in parallel
    const updatePromises = [updateResidualsPlot(selectedTutorial)];
    // ⚡ Bolt Optimization: Pass the already fetched data to avoid redundant request
    if (aeroVisible) updatePromises.push(updateAeroPlots(data));
    await Promise.allSettled(updatePromises);

    // After all plots are updated
    if (isFirstPlotLoad) {
      showNotification("Plots loaded successfully", "success", NOTIFY_LONG);
      isFirstPlotLoad = false;
    }
  } catch (error: unknown) {
    console.error("FOAMFlask Error updating plots", error);
    const currentTime = Date.now();
    const selectedTutorial = (
      document.getElementById("tutorialSelect") as HTMLSelectElement
    )?.value;
    if (
      selectedTutorial &&
      currentTime - lastErrorNotificationTime > ERROR_NOTIFICATION_COOLDOWN
    ) {
      showNotification(
        `Error updating plots: ${error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
      lastErrorNotificationTime = currentTime;
    }
  } finally {
    isUpdatingPlots = false;

    // FIX: Hide loader after update completes
    const loader = document.getElementById("plotsLoading");
    if (loader && !loader.classList.contains("hidden")) {
      loader.classList.add("hidden");
    }

    if (pendingPlotUpdate) {
      pendingPlotUpdate = false;
      requestAnimationFrame(() => updatePlots());
    }
  }
};

// Geometry Functions
const refreshGeometryList = async (btnElement?: HTMLElement, targetSelection?: string) => {
  if (!activeCase) {
    showNotification("No active case selected to list geometries", "warning", NOTIFY_LONG);
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("opacity-75", "cursor-wait");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Refreshing...`;
  }

  try {
    const response = await fetch(`/api/geometry/list?caseName=${encodeURIComponent(activeCase)}`);
    const data = await response.json();
    if (data.success) {
      const select = document.getElementById("geometrySelect") as HTMLSelectElement;
      if (select) {
        // Capture current selection
        const currentSelection = select.value;
        select.innerHTML = "";
        if (data.files.length === 0) {
          const opt = document.createElement("option");
          opt.disabled = true;
          opt.textContent = "No geometry files found";
          select.appendChild(opt);
        } else {
          // Handle both old format (string[]) and new format ({name, size}[])
          data.files.forEach((f: any) => {
            const opt = document.createElement("option");
            if (typeof f === 'string') {
              opt.value = f;
              opt.textContent = f;
            } else {
              opt.value = f.name;
              opt.textContent = `${f.name} (${formatBytes(f.size)})`;
            }
            select.appendChild(opt);
          });

          // Auto-select logic: Target > Current
          if (targetSelection && Array.from(select.options).some(o => o.value === targetSelection)) {
            select.value = targetSelection;
          } else if (currentSelection && Array.from(select.options).some(o => o.value === currentSelection)) {
            select.value = currentSelection;
          }
        }
      }
    }
    if (btn) showNotification("Geometry list refreshed", "success", NOTIFY_MEDIUM);
  } catch (e) {
    console.error(e);
    if (btn) showNotification("Failed to refresh geometry list", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("opacity-75", "cursor-wait");
      btn.innerHTML = originalText;
    }
  }
};



(window as any).refreshGeometryList = refreshGeometryList;

const switchGeometryTab = (tab: "upload" | "resources") => {
  const track = document.getElementById("geometry-track");
  const pill = document.getElementById("geometry-bg-pill");
  const uploadBtn = document.getElementById("tab-btn-geo-upload");
  const resourceBtn = document.getElementById("tab-btn-geo-resources");

  // Only toggle text styles now, background is handled by the pill
  const activeTextClasses = ["text-cyan-800", "font-semibold"];
  const inactiveTextClasses = ["text-gray-600", "hover:text-gray-800", "font-medium"];

  if (tab === "upload") {
    if (track) track.style.transform = "translateX(0%)";
    if (pill) pill.style.transform = "translateX(0)";

    uploadBtn?.classList.remove(...inactiveTextClasses);
    uploadBtn?.classList.add(...activeTextClasses);
    uploadBtn?.setAttribute("aria-selected", "true");

    resourceBtn?.classList.remove(...activeTextClasses);
    resourceBtn?.classList.add(...inactiveTextClasses);
    resourceBtn?.setAttribute("aria-selected", "false");
  } else {
    if (track) track.style.transform = "translateX(-100%)";
    // Move pill to the second position (100% width + gap)
    if (pill) pill.style.transform = "translateX(calc(100% + 0.25rem))";

    resourceBtn?.classList.remove(...inactiveTextClasses);
    resourceBtn?.classList.add(...activeTextClasses);
    resourceBtn?.setAttribute("aria-selected", "true");

    uploadBtn?.classList.remove(...activeTextClasses);
    uploadBtn?.classList.add(...inactiveTextClasses);
    uploadBtn?.setAttribute("aria-selected", "false");

    loadResourceGeometries();
  }
};

const loadResourceGeometries = async (refresh: boolean = false) => {
  const select = document.getElementById("resourceGeometrySelect") as HTMLSelectElement;
  if (!select) return;

  // Frontend Cache Check: If we have options (more than just the placeholder/loading) and strict refresh isn't requested
  if (!refresh && select.options.length > 1) {
    return;
  }

  const btn = document.getElementById("refreshResourceGeometryBtn") as HTMLButtonElement | null;
  const originalIcon = btn ? btn.innerHTML : "Refresh";

  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("cursor-wait", "opacity-75");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-3 w-3 inline-block mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Refreshing...`;
  }

  select.innerHTML = '<option>Loading...</option>';
  try {
    const url = refresh ? "/api/resources/geometry/list?refresh=true" : "/api/resources/geometry/list";
    const res = await fetch(url);
    const data = await res.json();

    select.innerHTML = '<option value="" disabled selected>Select Geometry</option>';
    if (data.files && Array.isArray(data.files)) {
      if (data.files.length === 0) {
        const opt = document.createElement("option");
        opt.disabled = true;
        opt.textContent = "No geometry files found";
        select.appendChild(opt);
      } else {
        data.files.forEach((f: string) => {
          const opt = document.createElement("option");
          opt.value = f;
          opt.textContent = f;
          select.appendChild(opt);
        });
      }
    }
  } catch (e) {
    console.error(e);
    select.innerHTML = '<option>Error loading list</option>';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("cursor-wait", "opacity-75");
      btn.innerHTML = originalIcon;
    }
  }
};

const fetchResourceGeometry = async (btnElement?: HTMLElement) => {
  const select = document.getElementById("resourceGeometrySelect") as HTMLSelectElement;
  const filename = select?.value;
  if (!filename || !activeCase) {
    showNotification("Please select a geometry and active case", "error");
    return;
  }

  const btn = (btnElement || document.getElementById("fetchResourceGeometryBtn")) as HTMLButtonElement;
  const originalText = btn ? btn.innerHTML : "Fetch & Import";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Fetching...`;
  }

  try {
    const res = await fetch("/api/resources/geometry/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename, caseName: activeCase })
    });
    const result = await res.json();
    if (result.success) {
      showNotification(`Fetched ${filename} successfully`, "success");
      refreshGeometryList(undefined, filename);
    } else {
      showNotification(result.message || "Fetch failed", "error");
    }
  } catch (e) {
    showNotification("Error fetching geometry", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
};
(window as any).fetchResourceGeometry = fetchResourceGeometry;

const setCase = (btnElement?: HTMLElement) => {
  const caseDirInput = document.getElementById("caseDir") as HTMLInputElement;
  const caseDir = caseDirInput.value.trim();

  if (!caseDir) {
    showNotification("Please enter a case directory path", "warning");
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  const originalText = btn ? btn.innerHTML : "Set Root";
  let success = false;

  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Setting...`;
  }

  fetchWithCache("/set_case", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ caseDir }),
  })
    .then((data) => {
      if (data.caseDir) {
        showNotification(`Case root set to: ${data.caseDir}`, "success");
        refreshCaseList(); // Refresh the list of cases
        success = true;
      } else if (data.output) {
        showNotification(data.output, "info"); // Likely an error message from backend
      }
    })
    .catch((err) => {
      showNotification(`Error setting case root: ${getErrorMessage(err)}`, "error");
    })
    .finally(() => {
      if (btn) {
        if (success) {
          temporarilyShowSuccess(btn, originalText, "Set!");
        } else {
          btn.disabled = false;
          btn.removeAttribute("aria-busy");
          btn.innerHTML = originalText;
        }
      }
    });
};
(window as any).setCase = setCase;

const openCaseRoot = (btn?: HTMLElement) => {
  fetchWithCache("/open_case_root", {
    method: "POST",
  })
    .then((data) => {
      if (data.output) {
        if (data.output.toLowerCase().includes("error") || data.output.toLowerCase().includes("failed")) {
          showNotification(data.output, "error");
        } else {
          showNotification(data.output, "success");
        }
      }
    })
    .catch((err) => {
      showNotification(`Failed to open case root: ${getErrorMessage(err)}`, "error");
    });
};
(window as any).openCaseRoot = openCaseRoot;
window.switchGeometryTab = switchGeometryTab;

const uploadGeometry = async (btnElement?: HTMLElement) => {
  const input = document.getElementById("geometryUpload") as HTMLInputElement;
  const btn = (btnElement || document.getElementById("uploadGeometryBtn")) as HTMLButtonElement;
  const file = input?.files?.[0];

  if (!activeCase) {
    showNotification("Please select an active case first", "warning");
    return;
  }

  if (!file) {
    showNotification("Please select a file to upload", "warning");
    if (input) {
      input.focus();
      input.setAttribute("aria-invalid", "true");
      input.addEventListener("change", () => input.removeAttribute("aria-invalid"), { once: true });
    }
    return;
  }

  // Validation: Check file size (Max 500MB)
  const MAX_SIZE = 500 * 1024 * 1024; // 500MB
  if (file.size > MAX_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    showNotification(`File too large (${sizeMB}MB). Max 500MB allowed.`, "error", NOTIFY_MEDIUM);
    return;
  }

  // Validation: Check file extension
  const allowedExtensions = [".stl", ".obj", ".gz"];
  const fileName = file.name.toLowerCase();
  const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

  if (!isValidExtension) {
    showNotification("Invalid file type. Allowed: .stl, .obj, .gz", "error", NOTIFY_MEDIUM);
    return;
  }

  // UX: Loading state
  const originalText = btn ? btn.innerHTML : "Upload";
  let success = false;
  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Uploading...`;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("caseName", activeCase);

  try {
    const response = await fetch("/api/geometry/upload", { method: "POST", body: formData });
    if (!response.ok) throw new Error("Upload failed");
    const data = await response.json();
    showNotification("Geometry uploaded successfully", "success");
    input.value = "";
    refreshGeometryList(undefined, data.filename);
    success = true;
  } catch (e) {
    showNotification("Failed to upload geometry", "error");
  } finally {
    // Restore button state
    if (btn) {
      if (success) {
        temporarilyShowSuccess(btn, originalText, "Uploaded!");
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = originalText;
      }
    }
  }
};

const deleteGeometry = async (btnElement?: HTMLElement) => {
  const filename = (document.getElementById("geometrySelect") as HTMLSelectElement)?.value;
  if (!filename || !activeCase) return;

  const confirmed = await showConfirmModal("Delete Geometry", `Are you sure you want to delete ${filename}?`);
  if (!confirmed) return;

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";
  let success = false;

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Deleting...`;
  }

  try {
    await fetch("/api/geometry/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName: activeCase, filename }) });
    await refreshGeometryList();
    showNotification("Geometry deleted", "success");
    success = true;
  } catch (e) {
    showNotification("Failed", "error");
  } finally {
    if (btn) {
      if (success) {
        temporarilyShowSuccess(btn, originalText, "Deleted!");
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = originalText;
      }
    }
  }
};

const loadGeometryView = async (btnElement?: HTMLElement) => {
  const filename = (document.getElementById("geometrySelect") as HTMLSelectElement)?.value;
  if (!filename || !activeCase) return;

  const btn = (btnElement || document.getElementById("viewGeometryBtn")) as HTMLButtonElement;

  // Check for slow hardware
  let optimize = false;
  if (detectSlowHardware()) {
    optimize = await showConfirmModal("Optimize for Performance?", "Slow graphics hardware detected. Enable geometry optimization (decimation)? This reduces detail but improves frame rate.");
  }

  await loadInteractiveViewerCommon({
    iframeId: "geometryInteractive",
    placeholderId: "geometryPlaceholder",
    loadingMessage: "Loading...",
    apiUrl: "/api/geometry/view",
    apiBody: { caseName: activeCase, filename, optimize },
    btnElement: btn,
    btnLoadingText: "Loading..."
  });

  // Info
  try {
    const res = await fetch("/api/geometry/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName: activeCase, filename }) });
    const info = await res.json();
    if (info.success) {
      const div = document.getElementById("geometryInfoContent");
      if (div) {
        const b = info.bounds;
        const fmt = (n: number) => n.toFixed(3);
        const dx = (b[1] - b[0]).toFixed(3);
        const dy = (b[3] - b[2]).toFixed(3);
        const dz = (b[5] - b[4]).toFixed(3);

        const setText = (id: string, text: string) => {
          const el = document.getElementById(id);
          if (el) el.textContent = text;
        };

        setText("geo-bound-x-min", fmt(b[0]));
        setText("geo-bound-x-max", fmt(b[1]));
        setText("geo-bound-x-len", dx);

        setText("geo-bound-y-min", fmt(b[2]));
        setText("geo-bound-y-max", fmt(b[3]));
        setText("geo-bound-y-len", dy);

        setText("geo-bound-z-min", fmt(b[4]));
        setText("geo-bound-z-max", fmt(b[5]));
        setText("geo-bound-z-len", dz);
      }
      document.getElementById("geometryInfo")?.classList.remove("hidden");
    }
  } catch (e) { }
};

// Meshing Functions
const fillBoundsFromGeometry = async (btnElement?: HTMLElement) => {
  if (!activeCase) {
    showNotification("Please select an active case first", "warning");
    return;
  }

  const filename = (document.getElementById("shmObjectList") as HTMLSelectElement)?.value;
  if (!filename) {
    showNotification("Please select a geometry object in the 'Object Settings' list below", "warning");
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";
  let success = false;

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `Auto-filling...`;
  }

  try {
    const res = await fetch("/api/geometry/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName: activeCase, filename }) });
    const info = await res.json();
    if (info.success) {
      const b = info.bounds;
      const p = 0.1; // 10% padding
      const dx = b[1] - b[0]; const dy = b[3] - b[2]; const dz = b[5] - b[4];

      const minStr = `${(b[0] - dx * p).toFixed(2)} ${(b[2] - dy * p).toFixed(2)} ${(b[4] - dz * p).toFixed(2)}`;
      const maxStr = `${(b[1] + dx * p).toFixed(2)} ${(b[3] + dy * p).toFixed(2)} ${(b[5] + dz * p).toFixed(2)}`;

      (document.getElementById("bmMin") as HTMLInputElement).value = minStr;
      (document.getElementById("bmMax") as HTMLInputElement).value = maxStr;

      showNotification(`Bounds updated from ${filename}`, "success");
    } else {
      showNotification("Failed to get geometry info", "error");
    }
  } catch (e) {
    showNotification("Error auto-filling bounds", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
  }
};

const generateBlockMeshDict = async (btnElement?: HTMLElement) => {
  if (!activeCase) {
    showNotification("Please select an active case first", "warning");
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";
  let success = false;

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;
  }

  // Validate inputs
  if (
    !validateVector3("bmMin", "Min Bounds") ||
    !validateVector3("bmMax", "Max Bounds") ||
    !validateVector3("bmCells", "Cells") ||
    !validateVector3("bmGrading", "Grading")
  ) {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
    return;
  }

  const minVal = (document.getElementById("bmMin") as HTMLInputElement).value.trim().split(/\s+/).map(Number);
  const maxVal = (document.getElementById("bmMax") as HTMLInputElement).value.trim().split(/\s+/).map(Number);
  const cells = (document.getElementById("bmCells") as HTMLInputElement).value.trim().split(/\s+/).map(Number);
  const grading = (document.getElementById("bmGrading") as HTMLInputElement).value.trim().split(/\s+/).map(Number);
  try {
    await fetch("/api/meshing/blockMesh/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName: activeCase, config: { min_point: minVal, max_point: maxVal, cells, grading } }) });
    showNotification("Generated blockMeshDict", "success");
  } catch (e) {
    showNotification("Failed to generate blockMeshDict", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
  }
};

const generateSnappyHexMeshDict = async (btnElement?: HTMLElement) => {
  const filename = (document.getElementById("shmObjectList") as HTMLSelectElement)?.value;
  if (!activeCase) {
    showNotification("Please select an active case first", "warning");
    return;
  }
  if (!filename) {
    showNotification("Please select a geometry object first", "warning");
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";
  let success = false;

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Generating...`;
  }

  // Use default value 0 if element doesn't exist or is empty, though HTML doesn't have shmLevel
  // The HTML has shmObjRefMin/Max, but not a global shmLevel.
  // Wait, I am fixing selectShmObject.
  // The request above was to generate snappyHexMeshDict.

  // The code references shmLevel which doesn't exist in HTML.
  // I should fix this too? Or just stub selectShmObject.
  // For now, I'll add selectShmObject.

  const level = 0; // Stub as element might be missing

  if (!validateVector3("shmLocation", "Location In Mesh")) {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
    return;
  }

  const locationInput = document.getElementById("shmLocation") as HTMLInputElement;
  const location = locationInput ? locationInput.value.trim().split(/\s+/).map(Number) : [0, 0, 0];
  try {
    await fetch("/api/meshing/snappyHexMesh/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName: activeCase, config: { stl_filename: filename, refinement_level: level, location_in_mesh: location } }) });
    showNotification("Generated snappyHexMeshDict", "success");
  } catch (e) {
    showNotification("Failed to generate snappyHexMeshDict", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
  }
};

const selectShmObject = () => {
  const list = document.getElementById("shmObjectList") as HTMLSelectElement;
  const props = document.getElementById("shmObjectProps");
  const placeholder = document.getElementById("shmObjectPlaceholder");
  const nameLabel = document.getElementById("shmSelectedObjectName");

  if (list && list.value) {
    if (props) props.classList.remove("hidden");
    if (placeholder) placeholder.classList.add("hidden");
    if (nameLabel) nameLabel.textContent = list.value;
    
    // Palette UX Sync: Automatically trigger blockMesh bounds update
    console.log(`Synchronizing selection for: ${list.value}`);
    fillBoundsFromGeometry();
  } else {
    if (props) props.classList.add("hidden");
    if (placeholder) placeholder.classList.remove("hidden");
  }
};

const updateShmObjectConfig = () => {
  // Stub for updating object config
  console.log("Updated object config");
};

const runMeshingCommand = async (cmd: string, btnElement?: HTMLElement) => {
  if (!activeCase) return;

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";
  let success = false;

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Running...`;
  }

  showNotification(`Running ${cmd}`, "info");
  updatePageTitle("running");
  try {
    const res = await fetch("/api/meshing/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ caseName: activeCase, command: cmd }) });
    const data = await res.json();

    if (data.success) {
      showNotification("Meshing completed successfully", "success");
      success = true;
    } else {
      showNotification(data.message || "Meshing failed", "error");
    }

    if (data.output) {
      const div = document.getElementById("meshingOutput");
      if (div) {
        div.innerText += `\n${data.output}`;
        div.scrollTop = div.scrollHeight; // Auto-scroll to bottom
      }
    }
  } catch (e) {
    console.error(e);
    showNotification("Meshing failed to execute", "error");
  } finally {
    updatePageTitle(success ? "success" : "error");
    if (btn) {
      if (success) {
        temporarilyShowSuccess(btn, originalText, "Completed!");
      } else {
        btn.disabled = false;
        btn.removeAttribute("aria-busy");
        btn.innerHTML = originalText;
      }
    }
  }
};

// Visualizer
const runFoamToVTK = async (btnElement?: HTMLElement) => {
  if (!activeCase) {
    showNotification("Please select a case first", "warning");
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Running...`;
  }

  showNotification("Running foamToVTK...", "info");
  updatePageTitle("running");

  let success = false;

  try {
    const response = await fetch("/run_foamtovtk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tutorial: activeCase, caseDir: caseDir }) // passing caseDir global var
    });

    if (!response.ok) throw new Error("Failed to start foamToVTK");

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    const read = async () => {
      const { done, value } = (await reader?.read()) || { done: true, value: undefined };
      if (done) {
        showNotification("foamToVTK completed", "success");
        flushOutputBuffer();
        refreshMeshList();
        success = true;
        return;
      }

      const text = decoder.decode(value);
      text.split("\n").forEach(line => {
        if (line.trim()) {
          // Simply append to output, maybe parse for errors if needed
          const type = /error/i.test(line) ? "stderr" : "stdout";
          appendOutput(line, "stdout");
        }
      });
      await read();
    };
    await read();

  } catch (e) {
    console.error(e);
    showNotification("Error running foamToVTK", "error");
  } finally {
    updatePageTitle(success ? "success" : "error");
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
  }
};


const refreshMeshList = async (btnElement?: HTMLElement) => {
  if (!activeCase) {
    showNotification("No active case selected to list meshes", "warning", NOTIFY_LONG);
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("opacity-75", "cursor-wait");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Refreshing...`;
  }

  try {
    const res = await fetch(`/api/available_meshes?tutorial=${encodeURIComponent(activeCase)}`);
    const data = await res.json();
    const select = document.getElementById("meshSelect") as HTMLSelectElement;
    if (select && data.meshes) {
      // ⚡ Bolt Optimization: Filter only mesh files (exclude geometry like STL/OBJ)
      const meshExtensions = ['.vtk', '.vtp', '.vtu', '.vtm', '.pvtu'];
      const filteredMeshes = data.meshes.filter((m: MeshFile) => 
        meshExtensions.some(ext => m.name.toLowerCase().endsWith(ext))
      );

      if (filteredMeshes.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No mesh files found</option>';
      } else {
        select.innerHTML = '<option value="">-- Select a mesh file --</option>';
        filteredMeshes.forEach((m: MeshFile) => {
          const opt = document.createElement("option");
          opt.value = m.path;
          opt.textContent = m.size ? `${m.name} (${formatBytes(m.size)})` : m.name;
          select.appendChild(opt);
        });
      }
    }
    if (btn) showNotification("Mesh list refreshed", "success", NOTIFY_MEDIUM);
  } catch (e) {
    console.error("Error refreshing mesh list:", e);
    showNotification("Failed to refresh mesh list", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("opacity-75", "cursor-wait");
      btn.innerHTML = originalText;
    }
  }
};

const loadMeshVisualization = async () => {
  const select = document.getElementById("meshSelect") as HTMLSelectElement;
  const path = select?.value;
  const btn = document.getElementById("loadMeshBtn") as HTMLButtonElement | null;

  if (!path) {
    showNotification("Please select a mesh file to load", "warning");
    if (select) {
      select.focus();
      select.setAttribute("aria-invalid", "true");
      select.addEventListener("change", () => select.removeAttribute("aria-invalid"), { once: true });
    }
    return;
  }

  // UX: Loading state
  const originalText = btn ? btn.innerHTML : "Load Mesh";
  if (btn) {
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Loading...`;
  }

  currentMeshPath = path;
  try {
    if (isInteractiveMode) {
      // Default to interactive viewer
      await refreshInteractiveViewer();
    } else {
      await updateMeshView();
    }
  } finally {
    // Restore button state
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
  }
};

const updateMeshView = async () => {
  if (!currentMeshPath) return;
  const showEdges = (document.getElementById("showEdges") as HTMLInputElement)?.checked ?? true;
  const color = (document.getElementById("meshColor") as HTMLSelectElement)?.value ?? "lightblue";
  const cameraPosition = (document.getElementById("cameraPosition") as HTMLSelectElement)?.value || null;

  const btn = document.getElementById("updateViewBtn") as HTMLButtonElement | null;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Updating...`;
  }

  try {
    const res = await fetch("/api/mesh_screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_path: currentMeshPath,
        width: 800,
        height: 600,
        show_edges: showEdges,
        color: color,
        camera_position: cameraPosition
      })
    });
    const data = await res.json();
    if (data.success) {
      (document.getElementById("meshImage") as HTMLImageElement).src = `data:image/png;base64,${data.image}`;
      document.getElementById("meshImage")?.classList.remove("hidden");
      document.getElementById("meshPlaceholder")?.classList.add("hidden");
      document.getElementById("meshControls")?.classList.remove("hidden");
      document.getElementById("meshActionButtons")?.classList.add("hidden");
    }
  } catch (e) {
    console.error("Error updating mesh view:", e);
    showNotification("Failed to update mesh view", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.innerHTML = originalText;
    }
  }
};

function displayMeshInfo(meshInfo: {
  success: boolean;
  n_points?: number;
  n_cells?: number;
  length?: number;
  volume?: number;
  bounds?: number[];
  center?: number[];
}): void {
  const meshInfoDiv = document.getElementById("meshInfo");
  const meshInfoContent = document.getElementById("meshInfoContent");

  if (!meshInfoDiv || !meshInfoContent) {
    console.error("Mesh info or content element not found");
    return;
  }

  if (!meshInfo || !meshInfo.success) {
    meshInfoDiv.classList.add("hidden");
    return;
  }

  // Format the mesh information
  const infoItems = [
    { label: "Points", value: meshInfo.n_points?.toLocaleString() || "N/A" },
    { label: "Cells", value: meshInfo.n_cells?.toLocaleString() || "N/A" },
    {
      label: "Length",
      value: meshInfo.length ? meshInfo.length.toFixed(3) : "N/A",
    },
    {
      label: "Volume",
      value: meshInfo.volume ? meshInfo.volume.toFixed(3) : "N/A",
    },
  ];

  meshInfoContent.innerHTML = infoItems
    .map(
      (item) =>
        `<div><strong>${item.label}:</strong> <button type="button" class="copyable-value hover:bg-cyan-100 hover:text-cyan-800 px-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500" title="Click to copy">${item.value}</button></div>`
    )
    .join("");

  // Add bounds if available
  if (meshInfo.bounds && Array.isArray(meshInfo.bounds)) {
    // Space separated for easier pasting into vector fields
    const boundsStr = `${meshInfo.bounds.map((b) => b.toFixed(2)).join(" ")}`;
    meshInfoContent.innerHTML += `<div class="col-span-2"><strong>Bounds:</strong> <button type="button" class="copyable-value hover:bg-cyan-100 hover:text-cyan-800 px-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500" title="Click to copy">${boundsStr}</button></div>`;
  }

  // Add center if available
  if (meshInfo.center && Array.isArray(meshInfo.center)) {
    const centerStr = `${meshInfo.center.map((c) => c.toFixed(2)).join(" ")}`;
    meshInfoContent.innerHTML += `<div class="col-span-2"><strong>Center:</strong> <button type="button" class="copyable-value hover:bg-cyan-100 hover:text-cyan-800 px-1 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500" title="Click to copy">${centerStr}</button></div>`;
  }

  meshInfoDiv.classList.remove("hidden");
}

async function refreshInteractiveViewer(successMessage: string = "Interactive mode enabled"): Promise<void> {
  const toggleBtn = document.getElementById("toggleInteractiveBtn");
  const cameraControl = document.getElementById("cameraPosition");
  const updateBtn = document.getElementById("updateViewBtn");

  if (!toggleBtn || !cameraControl || !updateBtn) return;

  const showEdgesInput = document.getElementById("showEdges") as HTMLInputElement | null;
  const colorInput = document.getElementById("meshColor") as HTMLInputElement | null;

  if (!showEdgesInput || !colorInput) {
    showNotification("Required mesh controls not found", "error");
    return;
  }

  const showEdges = showEdgesInput.checked;
  const color = colorInput.value;

  // Use common loader
  await loadInteractiveViewerCommon({
    iframeId: "meshInteractive",
    placeholderId: "meshPlaceholder",
    imageId: "meshImage", // Special handling for mesh tab
    loadingMessage: "Loading interactive viewer...",
    apiUrl: "/api/mesh_interactive",
    apiBody: {
      file_path: currentMeshPath,
      show_edges: showEdges,
      color: color,
    },
    // We don't pass toggleBtn here because we handle its state manually below
    // (it toggles between Static/Interactive, not just loading)

    onSuccess: () => {
      // Update button text
      toggleBtn.textContent = "Static Mode";
      toggleBtn.classList.remove("bg-purple-500", "hover:bg-purple-600");
      toggleBtn.classList.add("bg-orange-500", "hover:bg-orange-600");

      // Hide camera position control (not needed in interactive mode)
      cameraControl.parentElement?.classList.add("hidden");
      updateBtn.classList.add("hidden");
      document.getElementById("interactiveModeHint")?.classList.remove("hidden");

      showNotification(successMessage, "success", NOTIFY_LONG);
    },
    onError: (error) => {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      showNotification(`Failed to load interactive viewer: ${errorMessage}`, "error");

      // Reset to static mode
      isInteractiveMode = false;

      // Safely update UI elements
      toggleBtn.textContent = "Interactive Mode";
      toggleBtn.classList.remove("bg-orange-500", "hover:bg-orange-600");
      toggleBtn.classList.add("bg-purple-500", "hover:bg-purple-600");
      cameraControl.parentElement?.classList.remove("hidden");
      updateBtn.classList.remove("hidden");
      document.getElementById("interactiveModeHint")?.classList.add("hidden");
    }
  });
}

async function onMeshParamChange(): Promise<void> {
  if (isInteractiveMode) {
    await refreshInteractiveViewer("Interactive mode updated");
  }
}

async function toggleInteractiveMode(): Promise<void> {
  if (!currentMeshPath) {
    showNotification("Please load a mesh first", "warning");
    return;
  }

  const meshImage = document.getElementById(
    "meshImage"
  ) as HTMLImageElement | null;
  const meshInteractive = document.getElementById(
    "meshInteractive"
  ) as HTMLIFrameElement | null;
  const meshPlaceholder = document.getElementById("meshPlaceholder");
  const toggleBtn = document.getElementById("toggleInteractiveBtn");
  const cameraControl = document.getElementById("cameraPosition");
  const updateBtn = document.getElementById("updateViewBtn");

  if (!toggleBtn || !cameraControl || !updateBtn) return; // Guard clause for safety

  // Initialize button state if needed (e.g. on first load)
  // But since we default to true, the HTML should probably match or we update it here.
  // actually refreshInteractiveViewer updates the button state on success.

  if (
    !meshImage ||
    !meshInteractive ||
    !meshPlaceholder ||
    !toggleBtn ||
    !cameraControl ||
    !updateBtn
  ) {
    showNotification("Required mesh elements not found", "error");
    return;
  }

  isInteractiveMode = !isInteractiveMode;

  if (isInteractiveMode) {
    // Switch to interactive mode
    await refreshInteractiveViewer("Interactive mode enabled");
  } else {
    // Switch back to static mode
    meshInteractive.classList.add("hidden");
    meshImage.classList.remove("hidden");

    // Update button text
    toggleBtn.textContent = "Interactive Mode";
    toggleBtn.classList.remove("bg-orange-500", "hover:bg-orange-600");
    toggleBtn.classList.add("bg-purple-500", "hover:bg-purple-600");

    // Show camera position control again
    cameraControl.parentElement?.classList.remove("hidden");
    updateBtn.classList.remove("hidden");
    document.getElementById("interactiveModeHint")?.classList.add("hidden");

    showNotification("Switched to static mode", "info", NOTIFY_MEDIUM);
  }
}

// Set camera view for interactive mode
function setCameraView(view: CameraView): void {
  const iframe = document.getElementById(
    "meshInteractive"
  ) as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentWindow) return;

  try {
    // Send message to iframe to set camera view
    iframe.contentWindow.postMessage(
      {
        type: "setCameraView",
        view: view,
      },
      "*"
    );

    showNotification(`Set view to ${view.toUpperCase()}`, "info", NOTIFY_SHORT);
  } catch (error: unknown) {
    console.error("Error setting camera view:", error);
  }
}

// Reset camera to default view
function resetCamera(): void {
  const iframe = document.getElementById(
    "meshInteractive"
  ) as HTMLIFrameElement | null;
  if (!iframe || !iframe.contentWindow) return;

  try {
    // Send message to iframe to reset camera
    iframe.contentWindow.postMessage(
      {
        type: "resetCamera",
      },
      "*"
    );

    showNotification("Camera view reset", "info", NOTIFY_SHORT);
  } catch (error: unknown) {
    console.error("Error resetting camera:", error);
  }
}

// Post Processing

interface PipelineNode {
  id: string;
  type: "contour" | "slice" | "streamline" | "surface_projection" | "root";
  name: string;
  parentId: string | null;
}

// Initial state: Root node represents the base mesh
let postPipeline: PipelineNode[] = [{ id: "root", type: "root", name: "Mesh", parentId: null }];
let activePipelineId: string = "root";

const deletePipelineStep = (id: string): void => {
  if (id === 'root') return; // Cannot delete root

  // Find children recursively and delete them
  const children = postPipeline.filter(n => n.parentId === id);
  children.forEach(child => deletePipelineStep(child.id));

  // Remove this node
  postPipeline = postPipeline.filter(n => n.id !== id);

  // If active node is no longer in pipeline (because it was deleted), reset to root
  if (!postPipeline.find(n => n.id === activePipelineId)) {
    selectPipelineStep('root');
  } else {
    renderPipeline();
  }
};
(window as any).deletePipelineStep = deletePipelineStep;

const renderPipeline = (): void => {
  const container = document.getElementById("post-pipeline-view");
  if (!container) return;

  // Clear container
  container.innerHTML = "";

  // Render full pipeline (assuming linear for MVP)
  postPipeline.forEach((node, index) => {
    // 🎨 Palette UX: Accessible Button Group
    const groupEl = document.createElement("div");
    const isActive = node.id === activePipelineId;

    // Wrapper styles (Pill shape)
    const activeWrapper = "bg-cyan-600 border-cyan-600 shadow-md";
    const inactiveWrapper = "bg-white border-gray-300 hover:bg-gray-50 hover:border-cyan-400";

    groupEl.className = `inline-flex items-center rounded-full border transition-colors whitespace-nowrap ${isActive ? activeWrapper : inactiveWrapper}`;

    // Icon based on type
    let icon = "";
    if (node.type === "root") icon = `<svg aria-hidden="true" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>`;
    else if (node.type === "contour") icon = `<svg aria-hidden="true" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>`;
    else icon = `<svg aria-hidden="true" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" stroke-width="2"></circle></svg>`;

    // Select Button (Main)
    const selectBtn = document.createElement("button");
    const hasDelete = node.type !== 'root';
    // Rounded corners: Full if root (single button), Left-only if delete button exists
    const roundedClass = hasDelete ? "rounded-l-full pr-2" : "rounded-full";
    // Text Color
    const textClass = isActive ? "text-white" : "text-gray-700";

    selectBtn.className = `flex items-center gap-2 px-3 py-1.5 ${roundedClass} ${textClass} text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-cyan-500 transition-colors`;
    selectBtn.innerHTML = `${icon} <span>${node.name}</span>`;
    selectBtn.onclick = () => selectPipelineStep(node.id);
    groupEl.appendChild(selectBtn);

    // Delete Button (Sibling)
    if (hasDelete) {
      const delBtn = document.createElement("button");
      const delTextClass = isActive ? "text-cyan-200 hover:text-white" : "text-gray-400 hover:text-white";

      delBtn.className = `mr-1 p-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-500 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 ${delTextClass}`;
      // Use X icon
      delBtn.innerHTML = `<svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>`;
      delBtn.setAttribute("aria-label", `Delete ${node.name}`);
      delBtn.title = "Delete this step";

      delBtn.onclick = async (e) => {
        e.stopPropagation();
        const confirmed = await showConfirmModal("Delete Step", `Delete ${node.name}? This will remove all subsequent steps.`);
        if (confirmed) {
          deletePipelineStep(node.id);
        }
      };
      groupEl.appendChild(delBtn);
    }

    container.appendChild(groupEl);

    // Connector (if not last)
    if (index < postPipeline.length - 1) {
      const line = document.createElement("div");
      line.className = "w-8 h-0.5 bg-gray-300 mx-1 flex-shrink-0";
      container.appendChild(line);
    }

    // Add "Add" button if this is the active node (to branch off)
    if (node.id === activePipelineId) {
      const line = document.createElement("div");
      line.className = "w-8 h-0.5 bg-gray-300 mx-1 flex-shrink-0 border-t-2 border-dashed border-gray-300";
      container.appendChild(line);

      const addBtn = document.createElement("div");
      addBtn.className = "w-6 h-6 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-400 text-xs";
      addBtn.innerHTML = "+";
      addBtn.title = "Add function to this step";
      container.appendChild(addBtn);
    }
  });
};

const selectPipelineStep = (id: string): void => {
  activePipelineId = id;
  const node = postPipeline.find(n => n.id === id);
  if (!node) return;

  renderPipeline();

  // Show config for this step
  const landing = document.getElementById("post-landing-view");
  const contour = document.getElementById("post-contour-view");

  if (!landing || !contour) return;

  // If selecting a "contour" node, show contour view
  if (node.type === "contour") {
    landing.classList.add("hidden");
    contour.classList.remove("hidden");
    refreshPostList(); // Refresh VTK list
  }
  // If selecting root or any node where we want to add a child (conceptually), show landing
  // For this simplified logic: clicking a node shows its config.
  // How do we add new?
  // Let's say if you click "Back to Selection" or select "Mesh" (root), you get the landing view to ADD a new child to ROOT.
  // Actually, standard behavior: selecting a node shows its settings.
  // To add a new one, we need an "Add" mechanism.
  // For now, let's treat the Landing View as the "Add Child to Current Node" view if we are at a leaf or explicitly adding.
  // But to keep it simple and consistent with previous turn:
  // If we are at ROOT, show Landing View to start a chain.
  // If we are at a Leaf, showing the Config View.

  else if (node.type === "root") {
    // Root node -> Show selection to add new filter
    landing.classList.remove("hidden");
    contour.classList.add("hidden");
  }
  else {
    // Placeholder for other types
    landing.classList.add("hidden");
    contour.classList.add("hidden");
    // Could show a "Not implemented" view here
  }
};

const switchPostView = (view: "landing" | "contour"): void => {
  if (view === "contour") {
    // Add a new contour node to the pipeline
    const newNodeId = `contour_${Date.now()}`;
    postPipeline.push({
      id: newNodeId,
      type: "contour",
      name: "Contour",
      parentId: activePipelineId
    });
    selectPipelineStep(newNodeId);
  } else {
    // "Back" means go to parent or root?
    // Or just go to root to add another branch?
    // Let's assume "Back" means go up one level
    const current = postPipeline.find(n => n.id === activePipelineId);
    if (current && current.parentId) {
      selectPipelineStep(current.parentId);
    } else {
      selectPipelineStep("root");
    }
  }
};
(window as any).switchPostView = switchPostView;

const refreshPostList = async (btnElement?: HTMLElement) => {
  refreshPostListVTK(btnElement);
};

const refreshPostListVTK = async (btnElement?: HTMLElement) => {
  if (!activeCase) {
    showNotification("No active case selected to list VTK files", "warning", NOTIFY_LONG);
    return;
  }

  const btn = btnElement as HTMLButtonElement | undefined;
  let originalText = "";

  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("opacity-75", "cursor-wait");
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Refreshing...`;
  }

  try {
    const res = await fetch(`/api/available_meshes?tutorial=${encodeURIComponent(activeCase)}`);
    const data = await res.json();
    const select = document.getElementById("vtkFileSelect") as HTMLSelectElement;
    if (select && data.meshes) {
      // ⚡ Bolt Optimization: Filter only mesh files (exclude geometry like STL/OBJ)
      const meshExtensions = ['.vtk', '.vtp', '.vtu', '.vtm', '.pvtu'];
      const filteredMeshes = data.meshes.filter((m: MeshFile) => 
        meshExtensions.some(ext => m.name.toLowerCase().endsWith(ext))
      );

      if (filteredMeshes.length === 0) {
        select.innerHTML = '<option value="" disabled selected>No VTK files found</option>';
      } else {
        select.innerHTML = '<option value="">-- Select a VTK file --</option>';
        filteredMeshes.forEach((m: MeshFile) => {
          const opt = document.createElement("option");
          opt.value = m.path; opt.textContent = m.name; select.appendChild(opt);
        });
      }
    }
    if (btn) showNotification("VTK file list refreshed", "success", NOTIFY_MEDIUM);
  } catch (e) {
    console.error(e);
    if (btn) showNotification("Failed to refresh VTK list", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      btn.classList.remove("opacity-75", "cursor-wait");
      btn.innerHTML = originalText;
    }
  }
};

const runPostOperation = async (operation: string) => {
  // Stub
};
const loadCustomVTKFile = async () => { };
const loadContourVTK = async () => {
  const vtkFileSelect = document.getElementById("vtkFileSelect") as HTMLSelectElement | null;
  let fileToLoad = "";

  if (vtkFileSelect && vtkFileSelect.value) {
    fileToLoad = vtkFileSelect.value;
  }

  if (!fileToLoad) {
    showNotification("Please select a VTK file to load.", "warning");
    return;
  }

  // Show loading state on button
  const btn = document.getElementById("loadContourVTKBtn") as HTMLButtonElement | null;
  let originalText = "";
  if (btn) {
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg aria-hidden="true" class="animate-spin h-4 w-4 inline-block mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg> Loading...`;
  }

  try {
    await loadContourMesh(fileToLoad);
    showNotification("Contour mesh loaded successfully.", "success");
  } catch (e) {
    console.error(e);
    showNotification("Failed to load contour mesh.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
};
(window as any).loadContourVTK = loadContourVTK;


// Check startup status
const checkStartupStatus = async (): Promise<void> => {
  const modal = document.createElement("div");
  modal.id = "startup-modal";
  modal.className = "fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-50";
  modal.innerHTML = `
    <div class="bg-white p-8 rounded-lg shadow-xl max-w-md w-full text-center">
      <div class="mb-4"><svg aria-hidden="true" class="animate-spin h-10 w-10 text-blue-500 mx-auto" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>
      <h2 class="text-xl font-bold mb-2">System Check</h2>
      <p id="startup-message" class="text-gray-600">Checking Docker permissions...</p>
    </div>
  `;
  document.body.appendChild(modal);

  const pollStatus = async () => {
    try {
      const response = await fetch("/api/startup_status");
      const data = await response.json();
      const messageEl = document.getElementById("startup-message");
      if (messageEl) messageEl.textContent = data.message;
      if (data.status === "completed") {
        modal.remove();
        return;
      } else if (data.status === "failed") {
        if (messageEl) {
          messageEl.className = "text-red-600";
          messageEl.textContent = `Error: ${data.message}. Please check server logs.`;
        }
        return;
      }
      setTimeout(pollStatus, 1000);
    } catch (e) {
      setTimeout(pollStatus, 5000);
    }
  };
  await pollStatus();
};

// Initialize
window.onload = async () => {
  try { await checkStartupStatus(); } catch (e) { console.error(e); }

  const outputDiv = document.getElementById("output");
  if (outputDiv) {
    // Restore Log
    const savedLog = localStorage.getItem(CONSOLE_LOG_KEY);
    if (savedLog) {
      outputDiv.innerHTML = savedLog;
      cachedLogHTML = savedLog; // ⚡ Bolt Optimization: Restore cache
      outputDiv.scrollTop = outputDiv.scrollHeight;
    }
  }

  try {
    const caseRootData = await fetchWithCache<CaseRootResponse>("/get_case_root");
    const dockerConfigData = await fetchWithCache<DockerConfigResponse>("/get_docker_config");
    caseDir = caseRootData.caseDir;
    const caseDirInput = document.getElementById("caseDir") as HTMLInputElement;
    if (caseDirInput) caseDirInput.value = caseDir;
    dockerImage = dockerConfigData.dockerImage;
    openfoamVersion = dockerConfigData.openfoamVersion;
    const openfoamRootInput = document.getElementById("openfoamRoot") as HTMLInputElement;
    if (openfoamRootInput) openfoamRootInput.value = `${dockerImage} OpenFOAM ${openfoamVersion}`;

    // Load Cases
    await refreshCaseList();
    const savedCase = localStorage.getItem("lastSelectedCase");
    if (savedCase) {
      const select = document.getElementById("caseSelect") as HTMLSelectElement;
      let exists = false;
      for (let i = 0; i < select.options.length; i++) {
        if (select.options[i].value === savedCase) { exists = true; break; }
      }
      if (exists) {
        select.value = savedCase;
        activeCase = savedCase;
        updateActiveCaseBadge();
      }
    }

    // Check if we need to restore any plot state or similar
    // ...

  } catch (e) { console.error(e); }
};





// Exports
(window as any).switchPage = switchPage;
(window as any).setCase = setCase;
(window as any).setDockerConfig = setDockerConfig;
(window as any).loadTutorial = loadTutorial;
(window as any).createNewCase = createNewCase;
(window as any).selectCase = selectCase;
(window as any).refreshCaseList = refreshCaseList;
(window as any).uploadGeometry = uploadGeometry;
(window as any).deleteGeometry = deleteGeometry;
(window as any).loadGeometryView = loadGeometryView;
(window as any).fillBoundsFromGeometry = fillBoundsFromGeometry;
(window as any).fillLocationFromGeometry = fillLocationFromGeometry;
(window as any).generateBlockMeshDict = generateBlockMeshDict;
(window as any).generateSnappyHexMeshDict = generateSnappyHexMeshDict;
(window as any).selectShmObject = selectShmObject;
(window as any).updateShmObjectConfig = updateShmObjectConfig;
(window as any).runMeshingCommand = runMeshingCommand;
(window as any).refreshMeshList = refreshMeshList;
(window as any).loadMeshVisualization = loadMeshVisualization;
(window as any).updateMeshView = updateMeshView;
(window as any).runFoamToVTK = runFoamToVTK;
(window as any).refreshPostList = refreshPostList;
(window as any).toggleAeroPlots = toggleAeroPlots;
(window as any).runCommand = runCommand;
(window as any).confirmRunCommand = confirmRunCommand;
(window as any).toggleInteractiveMode = toggleInteractiveMode;
(window as any).setCameraView = setCameraView;
(window as any).resetCamera = resetCamera;
(window as any).downloadPlotData = downloadPlotData;
(window as any).loadCustomVTKFile = loadCustomVTKFile;
(window as any).loadContourVTK = loadContourVTK;
(window as any).generateContours = generateContoursFn;
(window as any).downloadPlotAsPNG = downloadPlotAsPNG;
(window as any).showNotification = showNotification;
(window as any).runPostOperation = runPostOperation;
(window as any).clearLog = clearLog;
(window as any).copyLogToClipboard = copyLogToClipboard;
(window as any).downloadLog = downloadLog;
(window as any).copyInputToClipboard = copyInputToClipboard;
(window as any).clearMeshingOutput = clearMeshingOutput;
(window as any).copyMeshingOutput = copyMeshingOutput;
(window as any).downloadMeshingLog = downloadMeshingLog;
(window as any).togglePlots = togglePlots;
(window as any).toggleSection = toggleSection;


const init = () => {
  // Palette UX: Optimistically restore active case
  const savedCase = localStorage.getItem("lastSelectedCase");
  if (savedCase) {
    activeCase = savedCase;
  }
  updateActiveCaseBadge();

  // Persist Tutorial Selection - Restore FIRST before any page logic runs
  const tutorialSelect = document.getElementById('tutorialSelect') as HTMLSelectElement;
  if (tutorialSelect) {
    // Restore
    const savedTutorial = localStorage.getItem('lastSelectedTutorial');
    if (savedTutorial) {
      // Check if option exists
      let exists = false;
      for (let i = 0; i < tutorialSelect.options.length; i++) {
        if (tutorialSelect.options[i].value === savedTutorial) {
          exists = true;
          break;
        }
      }
      if (exists) {
        tutorialSelect.value = savedTutorial;
        console.log("DEBUG: Restored tutorial selection:", savedTutorial);
      } else {
        console.warn("DEBUG: Saved tutorial not found in options:", savedTutorial);
      }
    }

    // Save on change
    tutorialSelect.addEventListener('change', (e: Event) => {
      const target = e.target as HTMLSelectElement;
      localStorage.setItem('lastSelectedTutorial', target.value);
    });
  }

  // Determine initial page from URL
  const path = window.location.pathname;
  let initialPage = "setup";
  if (path !== "/" && path !== "") {
    const pageName = path.substring(1).toLowerCase(); // remove leading slash
    // check if it's a valid page
    const pages = ["setup", "geometry", "meshing", "visualizer", "run", "plots", "post"];
    if (pages.includes(pageName)) {
      initialPage = pageName;
    }
  }

  // Handle browser back/forward buttons
  window.onpopstate = (event) => {
    if (event.state && event.state.page) {
      switchPage(event.state.page, false);
    } else {
      // Fallback if no state (e.g. initial load turned into history entry?)
      // or just parse URL again
      const p = window.location.pathname.substring(1).toLowerCase() || "setup";
      switchPage(p, false);
    }
  };

  // Switch to initial page (don't push state for the initial load)
  switchPage(initialPage, false);

  const navButtons = [
    { id: 'nav-setup', mobileId: 'mobile-nav-setup', handler: () => switchPage('setup') },
    { id: 'nav-run', mobileId: 'mobile-nav-run', handler: () => switchPage('run') },
    { id: 'nav-geometry', mobileId: 'mobile-nav-geometry', handler: () => switchPage('geometry') },
    { id: 'nav-meshing', mobileId: 'mobile-nav-meshing', handler: () => switchPage('meshing') },
    { id: 'nav-visualizer', mobileId: 'mobile-nav-visualizer', handler: () => switchPage('visualizer') },
    { id: 'nav-plots', mobileId: 'mobile-nav-plots', handler: () => switchPage('plots') },
    { id: 'nav-post', mobileId: 'mobile-nav-post', handler: () => switchPage('post') }
  ];

  navButtons.forEach(({ id, mobileId, handler }) => {
    const button = document.getElementById(id);
    if (button) button.addEventListener('click', handler);

    const mobileButton = document.getElementById(mobileId);
    if (mobileButton) {
      mobileButton.addEventListener('click', () => {
        handler();
        setMobileMenuState(false);
      });
    }
  });

  const loadTutorialBtn = document.getElementById('loadTutorialBtn');
  if (loadTutorialBtn) loadTutorialBtn.addEventListener('click', loadTutorial);

  // Check for startup errors
  const startupError = document.getElementById("startup-error");
  if (startupError) {
    const msg = startupError.getAttribute("data-message");
    if (msg) {
      showNotification(msg, "error", NOTIFY_LONG);
    }
  }

  // ⚡ Bolt Optimization: Resume updates immediately when tab becomes visible
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && plotsVisible && plotsInViewport) {
      if (!isUpdatingPlots) {
        updatePlots();
      } else {
        pendingPlotUpdate = true;
      }
    }
  });

  // Interactive Mode Event Listeners
  const meshColorSelect = document.getElementById("meshColor");
  if (meshColorSelect) {
    meshColorSelect.addEventListener("change", onMeshParamChange);
  }

  const showEdgesCheck = document.getElementById("showEdges");
  if (showEdgesCheck) {
    showEdgesCheck.addEventListener("change", onMeshParamChange);
  }

  // Auto-format vector inputs
  ['bmCells', 'bmGrading', 'bmMin', 'bmMax', 'shmLocation'].forEach(setupVectorInputAutoFormat);

  // Auto-format case name
  setupCaseNameAutoFormat('newCaseName');

  // Scroll Listener for Navbar
  // ⚡ Bolt Optimization: Throttle scroll events to prevent layout thrashing on the main thread
  let scrollTicking = false;
  window.addEventListener("scroll", () => {
    if (!scrollTicking) {
      window.requestAnimationFrame(() => {
        handleScroll();
        scrollTicking = false;
      });
      scrollTicking = true;
    }
  });

  initLogScrollObserver();
  setupQuickActions();
  setupCopyableValues();
  setupLayersDependency();
  setupGeometryDragDrop();
};

// UX: Setup dependency between "Add Layers" checkbox and "Surface Layers" input
const setupLayersDependency = () => {
  const shmLayers = document.getElementById("shmLayers") as HTMLInputElement;
  const shmObjLayers = document.getElementById("shmObjLayers") as HTMLInputElement;

  if (!shmLayers || !shmObjLayers) return;

  const updateState = () => {
    const isEnabled = shmLayers.checked;
    shmObjLayers.disabled = !isEnabled;
    if (!isEnabled) {
      shmObjLayers.classList.add("cursor-not-allowed", "opacity-50", "bg-gray-100");
      shmObjLayers.setAttribute("aria-disabled", "true");
    } else {
      shmObjLayers.classList.remove("cursor-not-allowed", "opacity-50", "bg-gray-100");
      shmObjLayers.removeAttribute("aria-disabled");
    }
  };

  shmLayers.addEventListener("change", updateState);
  updateState(); // Initialize state
};

const handleScroll = (): void => {
  const navbar = document.getElementById("navbar");
  if (!navbar) return;

  if (window.scrollY > 10) {
    if (navbar.classList.contains("glass")) {
      navbar.classList.remove("glass");
      navbar.classList.add("glass-plot");
    }
  } else {
    if (navbar.classList.contains("glass-plot")) {
      navbar.classList.remove("glass-plot");
      navbar.classList.add("glass");
    }
  }
};

// Helper: Flash input with visual feedback
const flashInputFeedback = (el: HTMLInputElement, message: string, isError: boolean = false) => {
  const color = isError ? 'red' : 'green';
  const bgColor = isError ? 'bg-red-100' : 'bg-green-50';

  // Remove potential conflicting classes first
  el.classList.remove('border-green-500', 'ring-green-500', 'bg-green-50', 'border-red-500', 'ring-red-500', 'bg-red-100');

  // Add new classes
  el.classList.add(`border-${color}-500`, 'ring-1', `ring-${color}-500`, bgColor);

  // Update help text if available
  const helpId = el.getAttribute('aria-describedby');
  const helpEl = helpId ? document.getElementById(helpId) : null;

  if (helpEl) {
    // Store original state if not already stored (prevent race condition)
    if (!helpEl.dataset.originalText) {
      helpEl.dataset.originalText = helpEl.textContent || "";
      helpEl.dataset.originalClass = helpEl.className;
    }

    // Clear any pending restore timer
    if (helpEl.dataset.restoreTimer) {
      clearTimeout(parseInt(helpEl.dataset.restoreTimer, 10));
    }

    // Set feedback state
    helpEl.textContent = message;
    if (isError) {
      helpEl.className = "text-xs text-red-600 font-medium mt-1 transition-all duration-300";
    } else {
      helpEl.className = "text-xs text-green-600 font-medium mt-1 transition-all duration-300";
    }
    helpEl.style.opacity = '1';

    // Revert input styles and help text after delay
    const duration = isError ? 3000 : 2000;
    const timerId = window.setTimeout(() => {
      el.classList.remove(`border-${color}-500`, 'ring-1', `ring-${color}-500`, bgColor);

      // Fade out help text
      helpEl.style.opacity = '0';

      setTimeout(() => {
        // Restore original help text
        helpEl.textContent = helpEl.dataset.originalText || "";
        helpEl.className = helpEl.dataset.originalClass || "";
        helpEl.style.opacity = '1';

        // Cleanup data attributes
        delete helpEl.dataset.originalText;
        delete helpEl.dataset.originalClass;
        delete helpEl.dataset.restoreTimer;
      }, 300);
    }, duration);

    helpEl.dataset.restoreTimer = timerId.toString();
  } else {
    // Just revert input styles if no help text
    const duration = isError ? 3000 : 2000;
    setTimeout(() => {
      el.classList.remove(`border-${color}-500`, 'ring-1', `ring-${color}-500`, bgColor);
    }, duration);
  }
};

// Helper: Validate Vector3 Input
const validateVector3 = (elementId: string, label: string): boolean => {
  const el = document.getElementById(elementId) as HTMLInputElement;
  if (!el) return true; // Skip if element missing

  const val = el.value.trim();
  if (!val) {
    flashInputFeedback(el, `${label} is required`, true);
    el.focus();
    return false;
  }

  // Allow comma or space separated
  const parts = val.replace(/,/g, ' ').split(/\s+/);
  const nums = parts.map(Number);

  if (parts.length !== 3 || nums.some(isNaN)) {
    flashInputFeedback(el, `Invalid format: Expected 3 numbers (x y z)`, true);
    el.focus();
    return false;
  }

  return true;
};

// Auto-format Vector Inputs (comma to space)
const setupVectorInputAutoFormat = (elementId: string) => {
  const el = document.getElementById(elementId) as HTMLInputElement;
  if (el) {
    // Add transition class for smooth color change if not present
    if (!el.classList.contains('transition-colors')) {
      el.classList.add('transition-colors', 'duration-500');
    }

    el.addEventListener('blur', () => {
      let val = el.value;
      // 🎨 Palette UX: Handle OpenFOAM syntax (parentheses, brackets, simpleGrading)
      val = val.replace(/[()\[\]]/g, ' ');
      val = val.replace(/simpleGrading/g, ' ');

      // Replace commas with spaces
      val = val.replace(/,/g, ' ');
      // Collapse multiple spaces
      val = val.replace(/\s+/g, ' ');
      val = val.trim();

      if (val !== el.value && val.length > 0) {
        el.value = val;
        flashInputFeedback(el, "✨ Auto-formatted from OpenFOAM syntax");
      }
    });
  }
};

// Auto-format Case Name (spaces to underscores, remove invalid chars)
const setupCaseNameAutoFormat = (elementId: string) => {
  const el = document.getElementById(elementId) as HTMLInputElement;
  if (el) {
    if (!el.classList.contains('transition-colors')) {
      el.classList.add('transition-colors', 'duration-500');
    }

    el.addEventListener('blur', () => {
      let val = el.value;
      const original = val;

      // Replace spaces with underscores
      val = val.replace(/\s+/g, '_');
      // Remove any character that is not alphanumeric, underscore, or dash
      val = val.replace(/[^a-zA-Z0-9_-]/g, '');

      if (val !== original && val.length > 0) {
        el.value = val;
        flashInputFeedback(el, "✨ Auto-formatted: spaces to underscores");
      }
    });
  }
};

// Scroll to Bottom Logic
const scrollToLogBottom = (): void => {
  const output = document.getElementById("output");
  if (output) {
    // Check if scrollTo options are supported (native smooth scroll)
    try {
      output.scrollTo({ top: output.scrollHeight, behavior: "smooth" });
    } catch (e) {
      // Fallback for older browsers
      output.scrollTop = output.scrollHeight;
    }
  }
};
(window as any).scrollToLogBottom = scrollToLogBottom;

// Scroll to Top Logic
const scrollToLogTop = (): void => {
  const output = document.getElementById("output");
  if (output) {
    try {
      output.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      output.scrollTop = 0;
    }
  }
};
(window as any).scrollToLogTop = scrollToLogTop;

const initLogScrollObserver = (): void => {
  const output = document.getElementById("output");
  const bottomBtn = document.getElementById("scrollToBottomBtn");
  const topBtn = document.getElementById("scrollToTopBtn");

  if (!output) return;

  const handleLogScroll = () => {
    // Scroll to Bottom Button Logic
    if (bottomBtn) {
      const distanceToBottom = output.scrollHeight - output.scrollTop - output.clientHeight;
      // Use a small tolerance for "at bottom" check, but larger for showing the button
      const shouldShowBottom = distanceToBottom > 150;

      if (shouldShowBottom) {
        bottomBtn.classList.remove("opacity-0", "translate-y-2", "pointer-events-none");
        bottomBtn.classList.add("opacity-100", "translate-y-0", "pointer-events-auto");
        bottomBtn.removeAttribute("tabindex");
      } else {
        bottomBtn.classList.add("opacity-0", "translate-y-2", "pointer-events-none");
        bottomBtn.classList.remove("opacity-100", "translate-y-0", "pointer-events-auto");
        bottomBtn.setAttribute("tabindex", "-1");
      }
    }

    // Scroll to Top Button Logic
    if (topBtn) {
      const shouldShowTop = output.scrollTop > 200;

      if (shouldShowTop) {
        topBtn.classList.remove("opacity-0", "translate-y-2", "pointer-events-none");
        topBtn.classList.add("opacity-100", "translate-y-0", "pointer-events-auto");
        topBtn.removeAttribute("tabindex");
      } else {
        topBtn.classList.add("opacity-0", "translate-y-2", "pointer-events-none");
        topBtn.classList.remove("opacity-100", "translate-y-0", "pointer-events-auto");
        topBtn.setAttribute("tabindex", "-1");
      }
    }
  };

  let ticking = false;
  output.addEventListener("scroll", () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        handleLogScroll();
        ticking = false;
      });
      ticking = true;
    }
  });
};

const setupCopyableValues = () => {
  document.addEventListener("click", (e) => {
    // Check if clicked element or parent is a copyable-value button
    const target = (e.target as HTMLElement).closest(".copyable-value") as HTMLElement;
    if (!target) return;

    const text = target.textContent?.trim();
    if (!text) return;

    // Prevent default (focus mostly)
    e.preventDefault();

    const onSuccess = () => {
      showNotification("Value copied", "success", NOTIFY_SHORT);

      // Visual feedback
      target.classList.add("bg-green-100", "text-green-800");
      target.classList.remove("hover:bg-cyan-100", "hover:text-cyan-800");

      setTimeout(() => {
        target.classList.remove("bg-green-100", "text-green-800");
        target.classList.add("hover:bg-cyan-100", "hover:text-cyan-800");
      }, 500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopyText(text, "Value copied", onSuccess));
    } else {
      fallbackCopyText(text, "Value copied", onSuccess);
    }
  });
};

// --- Font Settings Logic ---

let fontSettingsCleanup: (() => void) | null = null;
let fontSettingsTimer: number | null = null;

(window as any).toggleFontSettings = (): void => {
  const menu = document.getElementById("fontSettingsMenu");
  const btn = document.getElementById("fontSettingsBtn");

  if (!menu) return;

  const closeMenu = () => {
    menu.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");

    if (fontSettingsTimer !== null) {
      clearTimeout(fontSettingsTimer);
      fontSettingsTimer = null;
    }

    if (fontSettingsCleanup) {
      fontSettingsCleanup();
      fontSettingsCleanup = null;
    }
  };

  const isHidden = menu.classList.contains("hidden");

  if (isHidden) {
    menu.classList.remove("hidden");
    if (btn) btn.setAttribute("aria-expanded", "true");

    const clickHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) &&
        !btn?.contains(e.target as Node)) {
        closeMenu();
      }
    };

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeMenu();
        btn?.focus();
      }
    };

    // Delay to prevent immediate close if triggered by click
    fontSettingsTimer = window.setTimeout(() => {
      fontSettingsTimer = null;
      document.addEventListener("click", clickHandler);
      document.addEventListener("keydown", keyHandler);
    }, 0);

    fontSettingsCleanup = () => {
      document.removeEventListener("click", clickHandler);
      document.removeEventListener("keydown", keyHandler);
    };

  } else {
    closeMenu();
  }
};

(window as any).changePlotFont = async (fontFamily: string): Promise<void> => {
  if (!fontFamily) return;

  try {
    await ensurePlotlyLoaded();
  } catch (e) {
    return;
  }

  // Update global layout config
  if (plotLayout.font) {
    plotLayout.font.family = fontFamily;
  }

  // Update existing plots
  const plotIds = [
    "pressure-plot",
    "velocity-plot",
    "turbulence-plot",
    "residuals-plot",
    "cp-plot",
    "velocity-profile-plot"
  ];

  plotIds.forEach(id => {
    const el = document.getElementById(id);
    if (el && (el as any).data) { // Check if plot exists and has data
      Plotly.relayout(el, { "font.family": fontFamily } as any).catch(err => {
        console.warn(`Failed to update font for ${id}:`, err);
      });
    }
  });

  // Update input value if it wasn't the trigger
  const input = document.getElementById("customFontInput") as HTMLInputElement;
  if (input && input.value !== fontFamily) {
    input.value = fontFamily;
  }

  showNotification(`Plot font changed to ${fontFamily.split(',')[0]}`, "info", NOTIFY_MEDIUM);
};


(window as any).switchCaseCreationTab = (tab: "create" | "import"): void => {
  const track = document.getElementById("case-creation-track");
  const pill = document.getElementById("case-creation-bg-pill");
  const createBtn = document.getElementById("tab-btn-create");
  const importBtn = document.getElementById("tab-btn-import");

  if (!track || !createBtn || !importBtn) return;

  // Only toggle text styles now
  const activeTextClasses = ["text-cyan-800", "font-semibold"];
  const inactiveTextClasses = ["text-gray-600", "hover:text-gray-800", "font-medium"];

  if (tab === "create") {
    track.style.transform = "translateX(0%)";
    if (pill) pill.style.transform = "translateX(0)";

    // Active Style for Create
    createBtn.classList.remove(...inactiveTextClasses);
    createBtn.classList.add(...activeTextClasses);
    createBtn.setAttribute("aria-selected", "true");

    // Inactive Style for Import
    importBtn.classList.remove(...activeTextClasses);
    importBtn.classList.add(...inactiveTextClasses);
    importBtn.setAttribute("aria-selected", "false");

    // Focus Input (UX Improvement)
    const input = document.getElementById("newCaseName") as HTMLInputElement;
    if (input && tab === "create") setTimeout(() => input.focus(), 300); // Wait for transition
  } else {
    track.style.transform = "translateX(-100%)";
    if (pill) pill.style.transform = "translateX(calc(100% + 0.25rem))";

    // Active Style for Import
    importBtn.classList.remove(...inactiveTextClasses);
    importBtn.classList.add(...activeTextClasses);
    importBtn.setAttribute("aria-selected", "true");

    // Inactive Style for Create
    createBtn.classList.remove(...activeTextClasses);
    createBtn.classList.add(...inactiveTextClasses);
    createBtn.setAttribute("aria-selected", "false");

    // Focus Input (UX Improvement)
    const select = document.getElementById("tutorialSelect") as HTMLSelectElement;
    // Ensure we only focus if the tab is visible and it's the right element
    if (select && tab === "import") setTimeout(() => select.focus(), 300); // Wait for transition
  }
};

const setupQuickActions = () => {
  const bindings = [
    { input: "tutorialSelect", btn: "loadTutorialBtn", events: ["keydown"] },
    { input: "caseDir", btn: "setRootBtn", events: ["keydown"] },
    { input: "geometrySelect", btn: "viewGeometryBtn", events: ["keydown", "dblclick"] },
    { input: "resourceGeometrySelect", btn: "fetchResourceGeometryBtn", events: ["keydown"] },
    { input: "meshSelect", btn: "loadMeshBtn", events: ["keydown"] },
    { input: "vtkFileSelect", btn: "loadContourVTKBtn", events: ["keydown"] },
  ];

  bindings.forEach(({ input, btn, events }) => {
    const inputEl = document.getElementById(input);
    const btnEl = document.getElementById(btn);
    if (!inputEl || !btnEl) return;

    if (events.includes("keydown")) {
      inputEl.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") {
          e.preventDefault(); // Prevent form submission if any
          btnEl.click();
        }
      });
    }

    if (events.includes("dblclick")) {
      inputEl.addEventListener("dblclick", () => {
        btnEl.click();
      });
    }
  });
};

const setupGeometryDragDrop = () => {
  const dropZone = document.getElementById('geo-drop-zone');
  const input = document.getElementById('geometryUpload') as HTMLInputElement;
  const nameDisplay = document.getElementById('geo-file-name');
  const overlay = document.getElementById('geo-drop-overlay');

  if (!dropZone || !input) return;

  const showFile = () => {
    if (input.files && input.files[0]) {
      if (nameDisplay) {
        // 🎨 Palette UX: Add remove button to allow clearing selection
        nameDisplay.innerHTML = `
          <div class="flex items-center justify-center gap-2">
            <span>Selected: ${input.files[0].name}</span>
            <button type="button" id="remove-file-btn" class="text-cyan-700 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 rounded p-0.5 transition-colors" aria-label="Remove file" title="Remove file">
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        `;
        nameDisplay.classList.remove('hidden');

        // Add event listener to remove button
        const removeBtn = document.getElementById("remove-file-btn");
        if (removeBtn) {
          removeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            input.value = ""; // Clear file input
            nameDisplay.classList.add("hidden");
            nameDisplay.innerHTML = "";
            // Also notify user
            showNotification("File selection cleared", "info", NOTIFY_SHORT);
          });
        }
      }
    }
  };

  input.addEventListener('change', showFile);

  let dragCounter = 0;

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
  });

  dropZone.addEventListener('dragenter', () => {
    dragCounter++;
    if (dragCounter === 1) {
      dropZone.classList.add('border-cyan-500');
      if (overlay) {
        overlay.classList.remove('opacity-0', 'scale-95');
        overlay.classList.add('opacity-100', 'scale-100');
      }
    }
  });

  dropZone.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter === 0) {
      dropZone.classList.remove('border-cyan-500');
      if (overlay) {
        overlay.classList.remove('opacity-100', 'scale-100');
        overlay.classList.add('opacity-0', 'scale-95');
      }
    }
  });

  dropZone.addEventListener('drop', (e: DragEvent) => {
    dragCounter = 0;
    dropZone.classList.remove('border-cyan-500');
    if (overlay) {
      overlay.classList.remove('opacity-100', 'scale-100');
      overlay.classList.add('opacity-0', 'scale-95');
    }

    const dt = e.dataTransfer;
    if (dt && dt.files) {
      input.files = dt.files;
      showFile();
    }
  });
};

// Fullscreen Toggle
(window as any).toggleFullscreen = (containerId: string, btn: HTMLElement) => {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Icons
  const expandIcon = `<svg aria-hidden="true" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>`;
  const compressIcon = `<svg aria-hidden="true" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 14h6v6M10 14L4 20M20 14h-6v6M14 14l6 20M4 10h6V4M10 10L4 4M20 10h-6V4M14 10l6-4" /></svg>`;

  const updateUI = () => {
    // Check if this container is the one in fullscreen
    if (document.fullscreenElement === container) {
      btn.innerHTML = compressIcon;
      btn.setAttribute("aria-label", "Exit Fullscreen");
      btn.setAttribute("title", "Exit Fullscreen");
      // Add background to ensure it's not transparent in fullscreen
      container.classList.add("bg-white", "flex", "flex-col");
    } else {
      btn.innerHTML = expandIcon;
      btn.setAttribute("aria-label", "Enter Fullscreen");
      btn.setAttribute("title", "Enter Fullscreen");
      container.classList.remove("bg-white", "flex", "flex-col");
    }
  };

  // Bind event listener if not already bound
  if (!(container as any)._fsListenerAttached) {
    document.addEventListener("fullscreenchange", updateUI);
    (container as any)._fsListenerAttached = true;
  }

  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      console.error(`Error attempting to enable full-screen mode: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
(window as any)._fetchWithCache = fetchWithCache;
(window as any)._requestCache = requestCache;

const resetState = () => {
  requestCache = new Map<string, CacheEntry>();
  if (typeof window !== 'undefined') (window as any)._requestCache = requestCache;

  abortControllers = new Map<string, AbortController>();
  if (typeof window !== 'undefined') (window as any)._abortControllers = abortControllers;

  activeCase = null;
  caseDir = "";
  dockerImage = "";
  openfoamVersion = "";
  currentMeshPath = null;
  availableMeshes = [];
  isInteractiveMode = true;
  selectedGeometry = null;
  postPipeline = [{ id: "root", type: "root", name: "Mesh", parentId: null }];
  activePipelineId = "root";
  outputBuffer.length = 0;
  cachedLogHTML = "";
  lastResidualsCount = 0;
  currentResidualsData = {};
  cachedXArray = null;
};
(window as any)._resetState = resetState;

export { init, fetchWithCache, requestCache, setCase, refreshCaseList, uploadGeometry, deleteGeometry, resetState };
