import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('plotly.js', () => ({
  react: vi.fn(),
  newPlot: vi.fn(),
  extendTraces: vi.fn(),
  toImage: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
}));

vi.mock('../../static/ts/frontend/isosurface.js', () => ({
  generateContours: vi.fn(),
}));

describe('Active Case Badge', () => {
  beforeEach(async () => {
    // Setup DOM with the badge
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

      <button id="activeCaseBadge" class="hidden" onclick="switchPage('setup')"></button>
      <select id="caseSelect"><option value="">-- Select --</option></select>

      <!-- Required for init -->
      <select id="tutorialSelect"><option value="tut1">Tut 1</option></select>
      <input id="caseDir" />
      <input id="dockerImage" />
      <input id="openfoamRoot" />
      <div id="notificationContainer"></div>
      <template id="notification-template"></template>
      <div id="output"></div>
      <input id="newCaseName" />
      <select id="geometrySelect"><option value="">-- Select Geometry --</option></select>
      <input id="bmCells" aria-describedby="bmCellsHelp" />
      <p id="bmCellsHelp"></p>
      <div id="plotsContainer" class="hidden"></div>
      <button id="togglePlotsBtn"></button>
      <button id="toggleAeroBtn"></button>
      <div id="fontSettingsMenu" class="hidden"></div>
      <button id="fontSettingsBtn"></button>
      <div id="no-case-state" class="hidden"></div>
      <div id="post-landing-view"></div>
      <div id="post-contour-view" class="hidden"></div>
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

    // Mock global Plotly to prevent lazy loader from fetching external script in tests
    (window as any).Plotly = {
      react: vi.fn(),
      newPlot: vi.fn(),
      extendTraces: vi.fn(),
      toImage: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
      relayout: vi.fn().mockResolvedValue(true),
    };

    // Ensure the module is loaded (only once if cached, but we need its side effects on window)
    // Since we removed vi.resetModules(), this import might return the same module.
    // However, the module attaches functions to window.
    // We need to ensure window.fetch is not messed up by multiple patches if we reload.
    // Ideally we import once at top, but we need window to be ready.

    const module = await import('../../../static/ts/foamflask_frontend.ts');

    // Mock fetch
    // We overwrite window.fetch directly to bypass the monkey-patch and ensure our mock is called.
    const mockFetch = vi.fn().mockImplementation((url) => {
        if (url && typeof url === 'string' && url.includes('/api/cases/list')) {
            return Promise.resolve({
                ok: true,
                headers: { get: () => null },
                json: () => Promise.resolve({ cases: ['case1', 'case2'] })
            });
        }
        if (url === '/get_case_root') return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ caseDir: '/tmp' }) });
        if (url === '/get_docker_config') return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ dockerImage: 'test', openfoamVersion: 'v1' }) });
        if (url === '/api/startup_status') return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ status: 'completed' }) });

        return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({}) });
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

  it('selectCase should update the badge text, visibility, and accessibility attributes', () => {
    const { selectCase } = window as any;
    const badge = document.getElementById('activeCaseBadge');

    // Badge is visible by default (No Case) after init
    expect(badge?.classList.contains('hidden')).toBe(false);

    selectCase('case1');

    expect(badge?.classList.contains('hidden')).toBe(false);
    expect(badge?.textContent).toBe('case1');
    expect(badge?.title).toContain('Active Case: case1');
    expect(badge?.title).toContain('(Click to change)');
    expect(badge?.getAttribute('aria-label')).toContain('case1');
  });

  it('badge should have correct onclick attribute to trigger setup page', () => {
    const { selectCase } = window as any;
    const badge = document.getElementById('activeCaseBadge');

    // Make it visible
    selectCase('case1');

    // Verify attribute
    expect(badge?.getAttribute('onclick')).toBe("switchPage('setup')");
  });

  it('selectCase with empty string should show "No Case" badge (visible)', () => {
    const { selectCase } = window as any;
    const badge = document.getElementById('activeCaseBadge');

    selectCase('case1');
    expect(badge?.classList.contains('hidden')).toBe(false);

    selectCase('');
    // Current implementation shows "No Case" instead of hiding
    expect(badge?.classList.contains('hidden')).toBe(false);
    expect(badge?.textContent).toBe('No Case');
  });

  it('init should restore active case badge from local storage via window.onload logic', async () => {
    localStorage.setItem('lastSelectedCase', 'restored_case');

    // Mock fetch to return the restored case so validation passes
    (global.fetch as any).mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/cases/list')) {
            return Promise.resolve({
                ok: true,
                headers: { get: () => null },
                json: () => Promise.resolve({ cases: ['restored_case', 'other_case'] })
            });
        }
        if (url === '/get_case_root') return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ caseDir: '/tmp' }) });
        if (url === '/get_docker_config') return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({ dockerImage: 'test', openfoamVersion: 'v1' }) });
        return Promise.resolve({ ok: true, headers: { get: () => null }, json: () => Promise.resolve({}) });
    });

    if (window.onload) {
        await (window.onload as any)();
    }

    // Wait for microtasks
    await new Promise(resolve => setTimeout(resolve, 0));

    const badge = document.getElementById('activeCaseBadge');
    expect(badge?.classList.contains('hidden')).toBe(false);
    expect(badge?.textContent).toBe('restored_case');
  });
});
