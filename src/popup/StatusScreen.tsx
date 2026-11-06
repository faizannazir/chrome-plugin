import { Box, CircularProgress, Typography } from '@mui/material';
import { PLUGIN_TITLE } from './sessionCopy';
import { PopupFrame } from './PopupFrame';
import { Status } from './status';

export const StatusScreen = ({
  status,
  error,
}: {
  status: Status;
  error: string | null;
}) => {
  switch (status) {
    case 'error':
      return (
        <PopupFrame title={PLUGIN_TITLE} testId="popup-error">
          <Typography variant="body2" fontWeight="bold" color="error">
            Error: {error}
          </Typography>
        </PopupFrame>
      );
    case 'loading':
      return (
        <PopupFrame title={PLUGIN_TITLE} testId="popup-loading">
          <Box display="flex" justifyContent="center">
            <CircularProgress />
          </Box>
        </PopupFrame>
      );
    case 'legacy':
      return (
        <PopupFrame title={PLUGIN_TITLE} testId="popup-legacy">
          <Typography variant="body2">
            This website is using old version of Tolgee.
          </Typography>
        </PopupFrame>
      );
    case 'keys_found':
      return (
        <PopupFrame title={PLUGIN_TITLE} testId="popup-keys-found">
          <Typography variant="body2">
            Tolgee key attributes found (data-tolgee-key-only). The Tolgee SDK has not confirmed it is initialized on this page.
          </Typography>
        </PopupFrame>
      );
    case 'not_present':
      return (
        <PopupFrame title={PLUGIN_TITLE} testId="popup-not-present">
          <Typography variant="body2">
            This website doesn&apos;t seem to be using Tolgee.
          </Typography>
        </PopupFrame>
      );
  }
};
