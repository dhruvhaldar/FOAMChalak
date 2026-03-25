
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies
vi.mock('plotly.js', () => ({}));

describe('Run History UI', () => {
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

    mockFetch = vi.fn();
    window.fetch = mockFetch;
    global.fetch = mockFetch;

    vi.resetModules();
    // Import to register window functions
    await import('../../../static/ts/foamflask_frontend.ts');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('should show enhanced empty state when no runs', async () => {
    const { fetchRunHistory } = window as any;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ runs: [] })
    });

    await fetchRunHistory();

    const container = document.getElementById('runHistoryList');
    // Check for new empty state text
    expect(container?.innerHTML).toContain('No runs yet');
    expect(container?.innerHTML).toContain('Run a simulation command like');
    // Check for SVG
    expect(container?.innerHTML).toContain('<svg');
  });

  it('should show copy button for runs', async () => {
    const { fetchRunHistory } = window as any;

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        runs: [{
          id: 1,
          case_name: 'test',
          tutorial: 'tut',
          command: 'blockMesh',
          status: 'Completed',
          start_time: '2023-01-01T00:00:00Z',
          execution_duration: 1.5
        }]
      })
    });

    await fetchRunHistory();

    const container = document.getElementById('runHistoryList');
    // Check for command
    expect(container?.innerHTML).toContain('blockMesh');
    // Check for copy button
    expect(container?.innerHTML).toContain('onclick="copyText(\'blockMesh\', this)"');
    // Check for copy icon
    expect(container?.innerHTML).toContain('<svg');
  });
});
