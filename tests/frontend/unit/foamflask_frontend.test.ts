
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Window } from 'hap-dom'; // or just rely on jsdom

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

// Helper to wait for assertions
const waitFor = async (assertion: () => void, timeout = 1000) => {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      assertion();
      return;
    } catch (e) {
      await new Promise(r => setTimeout(r, 10));
    }
  }
  assertion(); // Run one last time to throw if still failing
};

// We need to setup the DOM before importing the main file because it might access the DOM at top level or on window.onload
// However, the functions are exported to window.

describe('FoamFlask Frontend', () => {
  let frontend: any;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="page-setup" class="page"></div>
      <div id="nav-setup" class="nav-btn"></div>
      <div id="page-geometry" class="page hidden"></div>
      <div id="nav-geometry" class="nav-btn"></div>
      <div id="page-meshing" class="page hidden"></div>
      <div id="nav-meshing" class="nav-btn"></div>
      <div id="page-visualizer" class="page hidden"></div>
      <div id="nav-visualizer" class="nav-btn"></div>
      <div id="page-plots" class="page hidden"></div>
      <div id="nav-plots" class="nav-btn"></div>
      <div id="page-post" class="page hidden"></div>
      <div id="nav-post" class="nav-btn"></div>
      <div id="page-run" class="page hidden"></div>
      <div id="nav-run" class="nav-btn"></div>

      <div id="notificationContainer"></div>
      <template id="notification-template">
        <div class="notification">
          <div class="icon-slot"></div>
          <div class="message-slot"></div>
          <div class="progress-bar hidden"></div>
          <button class="close-btn"></button>
        </div>
      </template>

      <div id="output"></div>
      <input id="caseDir" />
      <input id="dockerImage" />
      <input id="openfoamRoot" />
      <select id="caseSelect"><option value="">-- Select --</option></select>
      <input id="newCaseName" />
      <select id="tutorialSelect"><option value="tut1">Tut 1</option></select>
      <select id="geometrySelect"><option value="">-- Select Geometry --</option></select>

      <input id="bmCells" aria-describedby="bmCellsHelp" />
      <p id="bmCellsHelp">Format: x y z</p>

      <div id="plotsContainer" class="hidden"></div>
      <div id="plotsLoading" class="hidden"></div>
      <button id="togglePlotsBtn"></button>
      <button id="toggleAeroBtn"></button>

      <div id="fontSettingsMenu" class="hidden"></div>
      <button id="fontSettingsBtn"></button>

      <div id="mySection" class="hidden"></div>
      <button id="mySectionToggle">▶</button>

      <div id="no-case-state" class="hidden"></div>

      <!-- Post Processing Views -->
      <div id="post-landing-view"></div>
      <div id="post-contour-view" class="hidden"></div>
    `;

    // Mock LocalStorage
    const localStorageMock = (function() {
      let store: any = {};
      return {
        getItem: function(key: string) {
          return store[key] || null;
        },
        setItem: function(key: string, value: string) {
          store[key] = value.toString();
        },
        removeItem: function(key: string) {
          delete store[key];
        },
        clear: function() {
          store = {};
        }
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });

    // Mock global Plotly to prevent lazy loader from fetching external script in tests
    (window as any).Plotly = {
      react: vi.fn(),
      newPlot: vi.fn(),
      extendTraces: vi.fn(),
      toImage: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
      relayout: vi.fn().mockResolvedValue(true),
    };

    // We import the file here to ensure it runs in the configured environment.
    // Since we removed vi.resetModules(), this ensures the module is loaded at least once.
    const module = await import('../../../static/ts/foamflask_frontend.ts');

    // Mock fetch
    // We overwrite window.fetch directly to bypass the monkey-patch and ensure our mock is called.
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({ files: [], cases: [] })
    });
    window.fetch = mockFetch;
    global.fetch = mockFetch;

    // Manually trigger initialization for new DOM elements
    if ((window as any)._resetState) (window as any)._resetState();
    if (module.init) {
        module.init();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('switchPage should toggle classes correctly when active case is set', () => {
    const { switchPage, selectCase } = window as any;

    // Set active case
    selectCase('test_case');

    // Initial state: setup is visible
    const setupPage = document.getElementById('page-setup');
    const geometryPage = document.getElementById('page-geometry');
    const setupNav = document.getElementById('nav-setup');

    // Switch to geometry
    switchPage('geometry');

    expect(setupPage?.classList.contains('hidden')).toBe(true);
    expect(geometryPage?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('no-case-state')?.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('nav-geometry')?.getAttribute('aria-current')).toBe('page');
    expect(document.getElementById('nav-setup')?.getAttribute('aria-current')).toBeNull();
  });

  it('switchPage should show empty state when no active case', () => {
    const { switchPage, selectCase } = window as any;

    // Ensure no active case
    selectCase('');

    const setupPage = document.getElementById('page-setup');
    const geometryPage = document.getElementById('page-geometry');
    const noCaseState = document.getElementById('no-case-state');

    // Switch to geometry
    switchPage('geometry');

    // Setup hidden, Geometry hidden, No Case State visible
    expect(setupPage?.classList.contains('hidden')).toBe(true);
    expect(geometryPage?.classList.contains('hidden')).toBe(true);
    expect(noCaseState?.classList.contains('hidden')).toBe(false);

    // Nav should still update to show we are "on" the geometry tab (intent)
    expect(document.getElementById('nav-geometry')?.getAttribute('aria-current')).toBe('page');
  });

  it('showNotification should add element to container', () => {
    const { showNotification } = window as any;

    // Clear any background notifications
    const container = document.getElementById('notificationContainer');
    if (container) container.innerHTML = '';

    showNotification('Test Message', 'success');

    expect(container?.children.length).toBe(1);
    const notification = container?.querySelector('.notification');
    expect(notification).toBeTruthy();
    expect(notification?.querySelector('.message-slot')?.textContent).toBe('Test Message');
    // Actual class is bg-green-500/80 which is a single class string if tailwind hasn't processed it into separate classes yet in jsdom environment?
    // The code sets className += ` ${colors[type]}`.
    // colors.success = "bg-green-500/80 text-white backdrop-blur-md border border-white/20 shadow-xl"
    // "bg-green-500/80" is the class name.
    expect(notification?.className).toContain('bg-green-500/80');
  });

  it('toggleSection should toggle visibility and rotate icon', () => {
    const { toggleSection } = window as any;

    const section = document.getElementById('mySection');
    const toggleBtn = document.getElementById('mySectionToggle');

    // Initially hidden
    expect(section?.classList.contains('hidden')).toBe(true);

    toggleSection('mySection');

    expect(section?.classList.contains('hidden')).toBe(false);
    expect(toggleBtn?.textContent).toBe('▼');
    expect(toggleBtn?.classList.contains('-rotate-90')).toBe(false);

    toggleSection('mySection');

    expect(section?.classList.contains('hidden')).toBe(true);
    expect(toggleBtn?.textContent).toBe('▶');
    expect(toggleBtn?.classList.contains('-rotate-90')).toBe(true);
  });

  it('clearLog should clear output div and storage after confirmation', async () => {
    const { clearLog } = window as any;
    const output = document.getElementById('output') as HTMLElement;
    output.innerHTML = '<div>Some log</div>';
    localStorage.setItem('foamflask_console_log', '<div>Some log</div>');

    // Start clearLog
    const clearPromise = clearLog();

    // Modal should appear
    // Wait for microtask
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check if modal exists
    const confirmBtn = document.getElementById('confirm-ok');
    expect(confirmBtn).toBeTruthy();

    // Click confirm
    confirmBtn?.click();

    await clearPromise;

    expect(output.innerHTML).toContain('output-placeholder');
    expect(localStorage.getItem('foamflask_console_log')).toBeNull();

    // Should show notification
    const container = document.getElementById('notificationContainer');
    expect(container?.textContent).toContain('Console log cleared');
  });

  it('clearLog should NOT clear output div if cancelled', async () => {
    const { clearLog } = window as any;
    const output = document.getElementById('output') as HTMLElement;
    output.innerHTML = '<div>Some log</div>';
    localStorage.setItem('foamflask_console_log', '<div>Some log</div>');

    // Start clearLog
    const clearPromise = clearLog();

    // Wait for microtask
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check if modal exists
    const cancelBtn = document.getElementById('confirm-cancel');
    expect(cancelBtn).toBeTruthy();

    // Click cancel
    cancelBtn?.click();

    await clearPromise;

    expect(output.innerHTML).toBe('<div>Some log</div>');
    expect(localStorage.getItem('foamflask_console_log')).toBe('<div>Some log</div>');
  });

  it('scrollToLogBottom should scroll output to bottom', () => {
    const { scrollToLogBottom } = window as any;
    const output = document.getElementById('output') as HTMLElement;

    // Mock scrollHeight
    Object.defineProperty(output, 'scrollHeight', { value: 1000, configurable: true });
    Object.defineProperty(output, 'scrollTop', { value: 0, writable: true });
    // Mock scrollTo
    output.scrollTo = vi.fn((options: any) => {
        if (options && typeof options === 'object') {
            output.scrollTop = options.top;
        }
    });

    scrollToLogBottom();

    expect(output.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: 'smooth' });
    expect(output.scrollTop).toBe(1000);
  });

  it('deleteGeometry should show loading state on button', async () => {
    const { deleteGeometry, selectCase } = window as any;

    // Setup environment
    selectCase('test_case');
    const geometrySelect = document.getElementById('geometrySelect') as HTMLSelectElement;
    if (geometrySelect) {
        const option = document.createElement('option');
        option.value = 'test.stl';
        geometrySelect.appendChild(option);
        geometrySelect.value = 'test.stl';
    }

    const btn = document.createElement('button');
    btn.innerHTML = 'Delete';
    document.body.appendChild(btn);

    // Mock fetch to delay
    let resolveFetch: any;
    const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
    (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/api/geometry/delete')) {
            return fetchPromise.then(() => ({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ success: true }) }));
        }
        return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ files: [] }) });
    });

    // Start deleteGeometry
    const deletePromise = deleteGeometry(btn);

    // Wait for modal to appear (microtask)
    await new Promise(resolve => setTimeout(resolve, 0));

    // Confirm modal
    const confirmBtn = document.getElementById('confirm-ok');
    expect(confirmBtn).toBeTruthy();
    confirmBtn?.click();

    // Now button should be loading
    // We need to wait for the microtask after click to process
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.innerHTML).toContain('Deleting...');

    // Resolve fetch
    resolveFetch();

    // Wait for deleteGeometry to finish
    await deletePromise;

    // Button should be restored (success state)
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute('aria-busy')).toBeNull();
    expect(btn.innerHTML).toContain('Deleted!');
    expect(btn.classList.contains('!bg-green-600')).toBe(true);
  });

  it('toggleFontSettings should toggle visibility and close on Escape', async () => {
    const { toggleFontSettings } = window as any;
    const menu = document.getElementById('fontSettingsMenu');
    const btn = document.getElementById('fontSettingsBtn');

    // Open
    toggleFontSettings();
    expect(menu?.classList.contains('hidden')).toBe(false);
    expect(btn?.getAttribute('aria-expanded')).toBe('true');

    // Wait for microtask (listeners are added in setTimeout)
    await new Promise(resolve => setTimeout(resolve, 10));

    // Press Escape
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escapeEvent);

    expect(menu?.classList.contains('hidden')).toBe(true);
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggleFontSettings rapid toggle should handle listeners correctly', async () => {
    const { toggleFontSettings } = window as any;
    const menu = document.getElementById('fontSettingsMenu');

    // Open
    toggleFontSettings();
    expect(menu?.classList.contains('hidden')).toBe(false);

    // Immediate Close (before timeout)
    toggleFontSettings();
    expect(menu?.classList.contains('hidden')).toBe(true);

    // Wait for timeout that would have fired
    await new Promise(resolve => setTimeout(resolve, 10));

    // Re-open
    toggleFontSettings();
    expect(menu?.classList.contains('hidden')).toBe(false);
    await new Promise(resolve => setTimeout(resolve, 10)); // Allow listeners to attach

    // Close via Escape
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(escapeEvent);
    expect(menu?.classList.contains('hidden')).toBe(true);
  });

  it('setupVectorInputAutoFormat should format input and provide visual feedback', async () => {
    const input = document.getElementById('bmCells') as HTMLInputElement;
    const help = document.getElementById('bmCellsHelp') as HTMLElement;

    // Simulate user typing
    input.value = '10,  20, 30 ';

    // Trigger blur event
    const blurEvent = new Event('blur');
    input.dispatchEvent(blurEvent);

    // Check formatting
    expect(input.value).toBe('10 20 30');

    // Check visual feedback (input classes)
    expect(input.classList.contains('border-green-500')).toBe(true);
    expect(input.classList.contains('bg-green-50')).toBe(true);

    // Check help text update
    expect(help.textContent).toContain('Auto-formatted');
    expect(help.classList.contains('text-green-600')).toBe(true);

    // Fast-forward timers to check revert
    // Since we are using real timers in browser environment (jsdom), we'd need to mock timers or wait.
    // Vitest uses fake timers if enabled.

    // For this test, verifying the initial state change is sufficient to prove the feature works.
    // The revert logic uses setTimeout which is hard to test without enabling fake timers globally or for this test.
  });

  it('switchPostView should toggle between landing and contour views', () => {
    const { switchPostView } = window as any;
    const landing = document.getElementById('post-landing-view') as HTMLElement;
    const contour = document.getElementById('post-contour-view') as HTMLElement;

    // Switch to contour
    switchPostView('contour');
    expect(landing.classList.contains('hidden')).toBe(true);
    expect(contour.classList.contains('hidden')).toBe(false);

    // Switch back to landing
    switchPostView('landing');
    expect(landing.classList.contains('hidden')).toBe(false);
    expect(contour.classList.contains('hidden')).toBe(true);
  });

  it('copyInputToClipboard should copy text and show visual feedback', async () => {
    const { copyInputToClipboard } = window as any;
    const input = document.getElementById('dockerImage') as HTMLInputElement;
    input.value = 'my/image:tag';

    const btn = document.createElement('button');
    btn.innerHTML = 'Copy';

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    copyInputToClipboard('dockerImage', btn);

    // Wait for promise
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('my/image:tag');
    expect(btn.dataset.isCopying).toBe('true');
    expect(btn.innerHTML).toContain('<svg'); // Check for green checkmark icon
  });

  it('setCase should show success feedback on button', async () => {
    const { setCase } = window as any;
    const input = document.getElementById('caseDir') as HTMLInputElement;
    input.value = '/tmp/case';

    const btn = document.createElement('button');
    btn.innerHTML = 'Set Root';
    document.body.appendChild(btn);

    // Mock fetch
    let resolveFetch: any;
    const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });
    (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/set_case')) {
            return fetchPromise.then(() => ({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ caseDir: '/tmp/case' }) }));
        }
        return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ files: [], cases: [] }) });
    });

    // Start setCase
    const setCasePromise = setCase(btn);

    // Wait for microtask (loading state)
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.innerHTML).toContain('Setting...');

    // Resolve fetch
    resolveFetch();

    // Wait for DOM update
    await waitFor(() => {
        // Success state
        expect(btn.disabled).toBe(false);
        expect(btn.getAttribute('aria-busy')).toBeNull();
        expect(btn.innerHTML).toContain('Set!');
        expect(btn.classList.contains('!bg-green-600')).toBe(true);
    }, 2000);
  });

  it('runCommand should show success state on completion', async () => {
    const { runCommand, selectCase } = window as any;
    selectCase('test_case');

    const btn = document.createElement('button');
    btn.innerHTML = 'Run Allrun';
    document.body.appendChild(btn);

    // Mock fetch stream
    let resolveStream: any;
    const streamPromise = new Promise(resolve => { resolveStream = resolve; });

    (global.fetch as any).mockImplementation((url: string) => {
        if (url.includes('/run')) {
            return Promise.resolve({
                ok: true,
                headers: { get: () => null },
                body: {
                    getReader: () => ({
                        read: vi.fn()
                            .mockImplementationOnce(async () => {
                                await streamPromise; // Wait for manual trigger
                                return { done: false, value: new TextEncoder().encode('Running...\n') };
                            })
                            .mockResolvedValueOnce({ done: true })
                    })
                }
            });
        }
        // Mock plot data fetch that happens after run
        if (url.includes('/api/plot_data')) {
             return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ time: [], p: [] }) });
        }
        if (url.includes('/api/residuals')) {
             return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ time: [], p: [] }) });
        }
        if (url.includes('/api/runs')) {
             return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ runs: [] }) });
        }
        return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ success: true }) });
    });

    const runPromise = runCommand('Allrun', btn);

    // Wait for microtasks
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.innerHTML).toContain('Running...');

    resolveStream(); // Resume execution
    await runPromise;

    // Check success state
    await waitFor(() => {
        expect(btn.disabled).toBe(false);
        expect(btn.getAttribute('aria-busy')).toBeNull();
        expect(btn.innerHTML).toContain('Completed!');
        expect(btn.classList.contains('!bg-green-600')).toBe(true);
    }, 2000);
  });
});
