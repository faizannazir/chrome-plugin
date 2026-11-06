import { PROTOCOL_VERSION } from '../protocol';
import { LibConfig } from '../types';
import { acceptsCredentialDelivery } from './acceptsCredentialDelivery';
import {
  readAppliedCredentials,
  writeCredentialsIfChanged,
} from './credentialSink';
import { Messages } from './Messages';
import { updateState } from './updateState';
import { bridgeDataKeys, hasTolgeeKeyElements } from './dataKeyBridge';
import { startStandaloneTranslations } from './standaloneTranslations';

let configuration: LibConfig | undefined = undefined;
let stopStandaloneTranslations: (() => void) | undefined;

// Translate conventional data-key markup into the key-only attribute the SDK observes.
bridgeDataKeys();

const messages = new Messages();
messages.startWindowListening();

// Give a normal SDK time to announce itself. If it does not, pages with
// backend-rendered key attributes can use the extension's standalone renderer.
window.setTimeout(() => {
  if (!configuration && hasTolgeeKeyElements()) {
    stopStandaloneTranslations = startStandaloneTranslations(messages);
  }
}, 1_200);

// handshake with library
messages.listenWindow('TOLGEE_READY', (c: LibConfig) => {
  const firstHandshake = !configuration;
  configuration = c;
  // The SDK owns its page integration whenever it is present. Stop the fallback
  // renderer if a delayed SDK handshake arrives after the fallback was started.
  stopStandaloneTranslations?.();
  stopStandaloneTranslations = undefined;
  updateState(configuration, messages);
  if (firstHandshake) {
    messages.sendToLib('TOLGEE_PLUGIN_READY');
  } else {
    // !!!! different message to make it backward compatible with old Tolgee
    // if we keep it same, it will cause infinite loop
    messages.sendToLib('TOLGEE_PLUGIN_UPDATED');
  }
  messages.sendToPlugin('TOLGEE_CONFIG_LOADED', configuration);
});

messages.listenWindow('TOLGEE_PING', () => {
  messages.sendToLib('TOLGEE_PONG', { protocolVersion: PROTOCOL_VERSION });
});

// resend message to take screenshot to background
messages.listenWindow('TOLGEE_TAKE_SCREENSHOT', () => {
  messages.sendToPlugin('TOLGEE_TAKE_SCREENSHOT').then((response) => {
    messages.sendToLib('TOLGEE_SCREENSHOT_TAKEN', response);
  });
});

messages.listenWindow('TOLGEE_OPEN_PLUGIN', () => {
  messages.sendToPlugin('OPEN_POPUP');
});

messages.startRuntimeListening();

// popup will ask if tolgee is present on the page
messages.listenRuntime('DETECT_TOLGEE', async () => {
  if (configuration) {
    messages.sendToPlugin('TOLGEE_CONFIG_LOADED', configuration);
  }
  // data-tolgee-key-only is SDK-compatible markup, but by itself does not
  // prove that the Tolgee runtime is initialized on this page.
  return { keyMarkupFound: hasTolgeeKeyElements() };
});

messages.listenRuntime('GET_CREDENTIALS', async () =>
  readAppliedCredentials(sessionStorage)
);

messages.listenRuntime('SET_CREDENTIALS', async (data) => {
  if (
    !acceptsCredentialDelivery({
      currentOrigin: window.location.origin,
      isTopFrame: window.top === window.self,
      pageOrigin: data.pageOrigin,
    })
  ) {
    return;
  }
  if (writeCredentialsIfChanged(sessionStorage, data)) {
    location.reload();
  }
  updateState(configuration, messages);
});
