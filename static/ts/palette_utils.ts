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
