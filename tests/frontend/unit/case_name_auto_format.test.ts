
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('plotly.js', () => ({
  react: vi.fn(),
  newPlot: vi.fn(),
  extendTraces: vi.fn(),
  toImage: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  relayout: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../static/ts/frontend/isosurface.js', () => ({
  generateContours: vi.fn(),
}));

describe('FoamFlask Frontend - Case Name Auto Format', () => {

  beforeEach(async () => {
    vi.resetModules(); // Ensure fresh module import

    // Reset DOM with just the elements we need
    document.body.innerHTML = `
      <div id="notificationContainer"></div>
      <template id="notification-template">
        <div class="notification"></div>
      </template>

      <!-- Elements required for init() to run without error -->
      <div id="output"></div>
      <input id="caseDir" />
      <input id="dockerImage" />
      <input id="openfoamRoot" />
      <select id="caseSelect"><option value="">-- Select --</option></select>

      <!-- Target Element for Test -->
      <div class="mb-1">
        <label for="newCaseName">Case Name</label>
        <p id="caseNameHelp">Alphanumeric characters...</p>
      </div>
      <input type="text" id="newCaseName" aria-describedby="caseNameHelp" />

      <select id="tutorialSelect"><option value="tut1">Tut 1</option></select>
      <select id="geometrySelect"><option value="">-- Select Geometry --</option></select>
      <input id="bmCells" />

      <!-- Other required elements -->
      <div id="page-setup" class="page"></div>
      <div id="nav-setup"></div>
      <div id="page-geometry" class="page hidden"></div><div id="nav-geometry"></div>
      <div id="page-meshing" class="page hidden"></div><div id="nav-meshing"></div>
      <div id="page-visualizer" class="page hidden"></div><div id="nav-visualizer"></div>
      <div id="page-plots" class="page hidden"></div><div id="nav-plots"></div>
      <div id="page-post" class="page hidden"></div><div id="nav-post"></div>
      <div id="page-run" class="page hidden"></div><div id="nav-run"></div>
    `;

    // Mock LocalStorage
    const localStorageMock = (function() {
      let store: any = {};
      return {
        getItem: function(key: string) { return store[key] || null; },
        setItem: function(key: string, value: string) { store[key] = value.toString(); },
        removeItem: function(key: string) { delete store[key]; },
        clear: function() { store = {}; }
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });

    // Mock fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ files: [], cases: [] })
    });
    window.fetch = mockFetch;
    global.fetch = mockFetch;

    // Load the module
    const module = await import('../../../static/ts/foamflask_frontend.ts');

    // Initialize
    if (module.init) {
        module.init();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('should replace spaces with underscores on blur', () => {
    const input = document.getElementById('newCaseName') as HTMLInputElement;
    const help = document.getElementById('caseNameHelp') as HTMLElement;

    expect(input).toBeTruthy(); // Verify element exists

    // Simulate user typing "my new case"
    input.value = 'my new case';

    // Trigger blur event
    const blurEvent = new Event('blur');
    input.dispatchEvent(blurEvent);

    // Check formatting
    expect(input.value).toBe('my_new_case');

    // Check visual feedback (input classes)
    expect(input.classList.contains('border-green-500')).toBe(true);
    expect(input.classList.contains('bg-green-50')).toBe(true);

    // Check help text update
    expect(help.textContent).toContain('✨ Auto-formatted: spaces to underscores');
    expect(help.classList.contains('text-green-600')).toBe(true);
  });

  it('should remove invalid characters on blur', () => {
    const input = document.getElementById('newCaseName') as HTMLInputElement;

    // Simulate user typing invalid chars
    input.value = 'case@#$123!';

    // Trigger blur event
    const blurEvent = new Event('blur');
    input.dispatchEvent(blurEvent);

    // Check formatting (only alphanumeric, _ and - allowed)
    expect(input.value).toBe('case123');

    // Check feedback
    expect(input.classList.contains('border-green-500')).toBe(true);
  });

  it('should handle mixed spaces and invalid characters', () => {
    const input = document.getElementById('newCaseName') as HTMLInputElement;

    input.value = 'my case #1';

    input.dispatchEvent(new Event('blur'));

    // "my" -> "my"
    // " " -> "_"
    // "case" -> "case"
    // " " -> "_"
    // "#" -> removed
    // "1" -> "1"
    // Result: "my_case_1"
    expect(input.value).toBe('my_case_1');
  });

  it('should not show feedback if value is unchanged', () => {
    const input = document.getElementById('newCaseName') as HTMLInputElement;
    const help = document.getElementById('caseNameHelp') as HTMLElement;
    const originalHelpText = help.textContent;

    input.value = 'valid_case_123';

    input.dispatchEvent(new Event('blur'));

    // Value remains same
    expect(input.value).toBe('valid_case_123');

    // No visual feedback classes
    expect(input.classList.contains('border-green-500')).toBe(false);

    // Help text unchanged
    expect(help.textContent).toBe(originalHelpText);
  });
});
