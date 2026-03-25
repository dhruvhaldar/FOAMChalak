import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Plotly before import
vi.mock('plotly.js', () => ({}));

describe('Palette Re-run Button', () => {
    beforeEach(async () => {
        // Reset DOM
        document.body.innerHTML = `
            <div id="output"></div>
            <div id="notificationContainer"></div>
            <template id="notification-template">
                <div class="notification">
                    <div class="icon-slot"></div>
                    <div class="message-slot"></div>
                    <div class="progress-bar hidden"></div>
                    <button class="close-btn"></button>
                </div>
            </template>
            <div id="tutorialSelect"></div>
            <table><tbody id="runHistoryList"></tbody></table>
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

        // Import frontend
        await import('../../../static/ts/foamflask_frontend.ts');
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('runCommand should show compact loading state for icon-btn', async () => {
        const { runCommand } = window as any;

        // Mock tutorial select
        const select = document.getElementById('tutorialSelect') as HTMLSelectElement;
        if (select) {
             const opt = document.createElement('option');
             opt.value = 'tut1';
             select.appendChild(opt);
             select.value = 'tut1';
        }

        // Create a button with icon-btn class
        const btn = document.createElement('button');
        btn.className = 'icon-btn';
        document.body.appendChild(btn);

        // Mock fetch to hang so we can check loading state
        const mockFetch = vi.fn().mockReturnValue(new Promise(() => {}));
        global.fetch = mockFetch;
        window.fetch = mockFetch;

        // Run command
        runCommand('test_cmd', btn);

        // Check if button is disabled
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute('aria-busy')).toBe('true');

        // Check innerHTML contains spinner but NOT "Running..."
        expect(btn.innerHTML).toContain('<svg aria-hidden="true" class="animate-spin');
        expect(btn.innerHTML).not.toContain('Running...');
        // Check for text-current
        expect(btn.innerHTML).toContain('text-current');
    });

    it('fetchRunHistory should inject Re-run button', async () => {
        const { fetchRunHistory } = window as any;
        // Re-query container to ensure we get it from current DOM
        const container = document.getElementById('runHistoryList') as HTMLElement;
        expect(container).not.toBeNull();

        // Mock fetch response
        const mockFetch = vi.fn().mockImplementation((url) => {
            if (url.includes('/api/runs')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({
                        runs: [
                            {
                                id: 1,
                                command: 'blockMesh',
                                status: 'Completed',
                                start_time: '2023-01-01T00:00:00',
                                execution_duration: 1.5
                            }
                        ]
                    })
                });
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        });
        global.fetch = mockFetch;
        window.fetch = mockFetch;

        await fetchRunHistory();

        // Check if container has the button
        const html = container.innerHTML;
        // Check for confirmRunCommand call
        expect(html).toContain("confirmRunCommand('blockMesh', this)");
        // Check for icon-btn class
        expect(html).toContain("icon-btn");
        // Check for aria-label
        expect(html).toContain('aria-label="Re-run command"');
    });
});
