
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('plotly.js', () => ({}));

describe('Run History Refresh', () => {
  let frontend: any;
  let mockFetch: any;

  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="runHistoryList"></div>
      <div id="notificationContainer"></div>
      <template id="notification-template">
        <div class="notification">
          <div class="icon-slot"></div>
          <div class="message-slot"></div>
          <button class="close-btn"></button>
        </div>
      </template>
    `;

    // Create mock function
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ runs: [] })
    });

    // Assign to window/global BEFORE importing module
    window.fetch = mockFetch;
    global.fetch = mockFetch;

    // Reset modules to ensure fresh import
    vi.resetModules();

    frontend = await import('../../../static/ts/foamflask_frontend.ts');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('fetchRunHistory should show loading state on button', async () => {
    const { fetchRunHistory } = window as any;

    const btn = document.createElement('button');
    btn.innerHTML = 'Refresh';
    document.body.appendChild(btn);

    // Mock implementation on our stored reference
    let resolveFetch: any;
    const fetchPromise = new Promise(resolve => { resolveFetch = resolve; });

    mockFetch.mockImplementation(() => {
        return fetchPromise.then(() => ({
            ok: true,
            json: () => Promise.resolve({ runs: [] })
        }));
    });

    // Call function
    const promise = fetchRunHistory(btn);

    // Wait for microtask
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check loading state
    expect(btn.disabled).toBe(true);
    expect(btn.classList.contains('cursor-wait')).toBe(true);
    expect(btn.innerHTML).toContain('Refreshing...');
    expect(btn.innerHTML).toContain('<svg');

    // Resolve fetch
    resolveFetch();
    await promise;

    // Check restored state
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains('cursor-wait')).toBe(false);
    expect(btn.innerHTML).toBe('Refresh');

    // Check notification
    const container = document.getElementById('notificationContainer');
    expect(container?.innerHTML).toContain('Run history refreshed');
  });
});
