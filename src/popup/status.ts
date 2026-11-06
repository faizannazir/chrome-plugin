import { State } from './popupState';

export type Status = 'error' | 'loading' | 'legacy' | 'not_present' | 'keys_found';

export const statusFor = ({
  error,
  tolgeePresent,
  appliedValues,
  keyMarkupFound,
}: Pick<State, 'error' | 'tolgeePresent' | 'appliedValues' | 'keyMarkupFound'>): Status | null => {
  if (error) {
    return 'error';
  }
  if (tolgeePresent === 'loading') {
    return 'loading';
  }
  if (tolgeePresent === 'present' || appliedValues) {
    return null;
  }
  if (keyMarkupFound) {
    return 'keys_found';
  }
  return tolgeePresent === 'legacy' ? 'legacy' : 'not_present';
};
