import { describe, expect, it } from 'vitest';
import { statusFor } from './status';

describe('statusFor', () => {
  it('lets users connect when backend-rendered key markup is found without an SDK', () => {
    expect(
      statusFor({
        error: null,
        tolgeePresent: 'not_present',
        appliedValues: null,
        keyMarkupFound: true,
      })
    ).toBe(null);
  });

  it('keeps the not-present state when no key markup is found', () => {
    expect(
      statusFor({
        error: null,
        tolgeePresent: 'not_present',
        appliedValues: null,
        keyMarkupFound: false,
      })
    ).toBe('not_present');
  });
});
