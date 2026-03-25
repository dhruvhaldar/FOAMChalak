
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('plotly.js', () => ({
  react: vi.fn(),
}));

describe('Geometry UX', () => {
  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="page-geometry" class="page">
         <label for="geometryUpload" id="geo-drop-zone">
            <div id="geo-drop-content">Drop Zone</div>
            <div id="geo-drop-overlay" class="opacity-0">Drop Here</div>
            <input type="file" id="geometryUpload" />
         </label>
         <div id="geo-file-name" class="hidden"></div>
      </div>
    `;

    // Import the frontend code to trigger initialization/setup functions
    const module = await import('../../../static/ts/foamflask_frontend.ts');

    if (module.init) {
        module.init();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('should show file name and remove button when file is selected', async () => {
    const input = document.getElementById('geometryUpload') as HTMLInputElement;
    const nameDisplay = document.getElementById('geo-file-name') as HTMLElement;

    // Simulate file selection
    const file = new File(['content'], 'test.stl', { type: 'model/stl' });
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: true
    });

    // Trigger change event
    input.dispatchEvent(new Event('change'));

    // Verify name is displayed
    expect(nameDisplay.classList.contains('hidden')).toBe(false);
    expect(nameDisplay.textContent).toContain('test.stl');

    // Check for remove button
    const removeBtn = nameDisplay.querySelector('button');
    expect(removeBtn).toBeTruthy();
    expect(removeBtn?.getAttribute('aria-label')).toBe('Remove file');
  });

  it('should clear selection when remove button is clicked', async () => {
    const input = document.getElementById('geometryUpload') as HTMLInputElement;
    const nameDisplay = document.getElementById('geo-file-name') as HTMLElement;

    // Simulate file selection first (assuming implementation exists)
    const file = new File(['content'], 'test.stl', { type: 'model/stl' });
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: true
    });

    // Trigger change event to run the logic
    input.dispatchEvent(new Event('change'));

    // Check if button exists
    const removeBtn = nameDisplay.querySelector('button');
    expect(removeBtn).toBeTruthy();

    if (removeBtn) {
        removeBtn.click();
        expect(input.value).toBe('');
        expect(nameDisplay.classList.contains('hidden')).toBe(true);
    }
  });
});
