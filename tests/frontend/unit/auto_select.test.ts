
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('plotly.js', () => ({
  react: vi.fn(),
  newPlot: vi.fn(),
  extendTraces: vi.fn(),
  toImage: vi.fn().mockResolvedValue('data:image/png;base64,mock'),
  relayout: vi.fn().mockResolvedValue(true),
}));

// Mock Isosurface (dependency of foamflask_frontend)
vi.mock('../../../static/ts/frontend/isosurface.js', () => ({
  generateContours: vi.fn(),
  loadContourMesh: vi.fn(),
}));

describe('Auto Selection Logic', () => {
  let frontend: any;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = `
      <select id="geometrySelect">
        <option value="">-- Select --</option>
        <option value="existing.stl">existing.stl</option>
      </select>
      <div id="notificationContainer"></div>
      <template id="notification-template">
        <div class="notification">
          <div class="icon-slot"></div>
          <div class="message-slot"></div>
          <div class="progress-bar hidden"></div>
          <button class="close-btn"></button>
        </div>
      </template>
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

    // Mock global Plotly
    (window as any).Plotly = { react: vi.fn() };

    // Import the module (this executes the file and monkey-patches fetch)
    await import('../../../static/ts/foamflask_frontend.ts');
    frontend = window as any; // Access functions via window

    // Mock fetch (Overwrite monkey-patch for testing)
    const mockFetch = vi.fn();
    window.fetch = mockFetch;
    global.fetch = mockFetch;

    // Set active case to enable refresh
    if (frontend.selectCase) {
        frontend.selectCase('test_case');
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('refreshGeometryList should preserve selection if target not provided', async () => {
    const select = document.getElementById('geometrySelect') as HTMLSelectElement;
    select.value = 'existing.stl'; // Simulate user selection

    // Mock fetch response with existing file + new file
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        files: ['existing.stl', 'new_file.stl']
      })
    });

    await (window as any).refreshGeometryList();

    // Should still be selected
    expect(select.value).toBe('existing.stl');
    expect(select.options.length).toBe(2); // No placeholder in refreshGeometryList logic
  });

  it('refreshGeometryList should select target if provided', async () => {
    const select = document.getElementById('geometrySelect') as HTMLSelectElement;
    select.value = 'existing.stl';

    // Mock fetch response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        files: ['existing.stl', 'new_file.stl']
      })
    });

    // Pass target selection (simulating upload completion)
    await (window as any).refreshGeometryList(undefined, 'new_file.stl');

    expect(select.value).toBe('new_file.stl');
  });

  it('refreshGeometryList should fallback to preservation if target not found', async () => {
    const select = document.getElementById('geometrySelect') as HTMLSelectElement;
    select.value = 'existing.stl';

    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        files: ['existing.stl', 'other.stl']
      })
    });

    // Target does not exist in response
    await (window as any).refreshGeometryList(undefined, 'missing_file.stl');

    // Should fallback to preserving 'existing.stl'
    expect(select.value).toBe('existing.stl');
  });

  it('refreshGeometryList should handle new format {name, size}', async () => {
    const select = document.getElementById('geometrySelect') as HTMLSelectElement;

    (global.fetch as any).mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        success: true,
        files: [{name: 'complex.stl', size: 1024}]
      })
    });

    await (window as any).refreshGeometryList(undefined, 'complex.stl');

    expect(select.value).toBe('complex.stl');
    expect(select.options[0].textContent).toContain('complex.stl');
  });
});
