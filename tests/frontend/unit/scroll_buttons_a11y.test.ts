
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Scroll Buttons Accessibility', () => {
  beforeEach(async () => {
    document.body.innerHTML = `
      <div id="output" style="height: 100px; overflow: auto;">
        <div style="height: 2000px;">Content</div>
      </div>
      <button id="scrollToTopBtn" class="opacity-0 pointer-events-none" tabindex="-1"></button>
      <button id="scrollToBottomBtn" class="opacity-0 pointer-events-none" tabindex="-1"></button>
    `;

    // Mock clientHeight, scrollHeight, scrollTop
    const output = document.getElementById('output') as HTMLElement;
    Object.defineProperty(output, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(output, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(output, 'scrollTop', { value: 0, writable: true, configurable: true });

    // Load the module
    const module = await import('../../../static/ts/foamflask_frontend.ts');

    // Reset state if needed
    if ((window as any)._resetState) (window as any)._resetState();

    // Manually trigger init if available, or just the observer if exposed?
    // Since initLogScrollObserver is internal, we rely on init() or window load.
    // The test in foamflask_frontend.test.ts calls init().
    if (module.init) {
        module.init();
    }

    // We need to wait for initLogScrollObserver to attach listeners.
    // It's called in init().
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('should remove tabindex when scroll buttons become visible', async () => {
    const output = document.getElementById('output') as HTMLElement;
    const bottomBtn = document.getElementById('scrollToBottomBtn') as HTMLElement;
    const topBtn = document.getElementById('scrollToTopBtn') as HTMLElement;

    // Initial state: hidden and tabindex -1
    expect(bottomBtn.getAttribute('tabindex')).toBe('-1');
    expect(topBtn.getAttribute('tabindex')).toBe('-1');

    // Simulate scrolling to middle (both buttons should be visible?)
    // Logic:
    // Top visible if scrollTop > 200
    // Bottom visible if distanceToBottom > 150

    // 1. Scroll to top (0). Top hidden. Bottom visible (2000 - 0 - 100 = 1900 > 150)
    // Wait, initial logic:
    // handleLogScroll is called on scroll.
    // We need to trigger scroll event.

    // Set scrollTop to 0
    Object.defineProperty(output, 'scrollTop', { value: 0, writable: true });
    output.dispatchEvent(new Event('scroll'));

    // Wait for requestAnimationFrame
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 20)); // Give it a tick

    // Verify Bottom Button is visible and focusable
    expect(bottomBtn.classList.contains('opacity-100')).toBe(true);
    expect(bottomBtn.hasAttribute('tabindex')).toBe(false);

    // Verify Top Button is hidden and not focusable
    expect(topBtn.classList.contains('opacity-0')).toBe(true);
    expect(topBtn.getAttribute('tabindex')).toBe('-1');

    // 2. Scroll to middle (1000). Both visible.
    Object.defineProperty(output, 'scrollTop', { value: 1000, writable: true });
    output.dispatchEvent(new Event('scroll'));

    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(topBtn.classList.contains('opacity-100')).toBe(true);
    expect(topBtn.hasAttribute('tabindex')).toBe(false);

    expect(bottomBtn.classList.contains('opacity-100')).toBe(true);
    expect(bottomBtn.hasAttribute('tabindex')).toBe(false);

    // 3. Scroll to bottom (1900). Top visible. Bottom hidden (2000 - 1900 - 100 = 0 < 150)
    Object.defineProperty(output, 'scrollTop', { value: 1900, writable: true });
    output.dispatchEvent(new Event('scroll'));

    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(topBtn.classList.contains('opacity-100')).toBe(true);
    expect(topBtn.hasAttribute('tabindex')).toBe(false);

    expect(bottomBtn.classList.contains('opacity-0')).toBe(true);
    expect(bottomBtn.getAttribute('tabindex')).toBe('-1');
  });
});
