import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeDataKeys } from './dataKeyBridge';

describe('bridgeDataKeys', () => {
  let stop: (() => void) | undefined;

  afterEach(() => {
    stop?.();
    document.body.innerHTML = '';
  });

  it('maps existing and dynamically added data-key elements to Tolgee key-only attributes', async () => {
    document.body.innerHTML = '<button data-key="checkout.submit">Submit</button>';
    stop = bridgeDataKeys();
    const button = document.querySelector('button')!;
    expect(button.getAttribute('data-tolgee-key-only')).toBe('checkout.submit');

    const next = document.createElement('span');
    next.setAttribute('data-key', 'profile.title');
    document.body.append(next);
    await vi.waitFor(() => expect(next.getAttribute('data-tolgee-key-only')).toBe('profile.title'));
  });

  it('updates/removes only attributes created by the bridge', async () => {
    document.body.innerHTML = '<div data-key="first"></div><div data-key="second" data-tolgee-key-only="manual"></div>';
    stop = bridgeDataKeys();
    const [bridged, manual] = document.querySelectorAll('div');
    bridged.setAttribute('data-key', 'updated');
    await vi.waitFor(() => expect(bridged.getAttribute('data-tolgee-key-only')).toBe('updated'));
    bridged.removeAttribute('data-key');
    await vi.waitFor(() => expect(bridged.hasAttribute('data-tolgee-key-only')).toBe(false));
    expect(manual.getAttribute('data-tolgee-key-only')).toBe('manual');
  });
});
