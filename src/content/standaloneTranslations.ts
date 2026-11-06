import { Messages } from './Messages';
import { readAppliedCredentials } from './credentialSink';

type Translation = { text?: string | null };
type TolgeeKey = {
  keyName?: string;
  keyNamespace?: string | null;
  translations?: Record<string, Translation>;
};
type TranslationPage = {
  _embedded?: { keys?: TolgeeKey[] };
  page?: { totalPages?: number; number?: number };
};
type ProjectLanguage = { tag?: string; base?: boolean };
type LanguagesPage = {
  _embedded?: { languages?: ProjectLanguage[] };
};
type ApiReply =
  | { response: { status: number; body: string } }
  | { error: { message?: string } };

const PAGE_SIZE = 500;
const MAX_PAGES = 100;

/**
 * Provides a small SDK-independent renderer for backend-rendered pages that
 * expose stable key names through data-key/data-tolgee-key-only attributes.
 * The API key stays in the extension worker; this content script only receives
 * the proxied API response.
 */
export const startStandaloneTranslations = (
  messages: Messages
): (() => void) => {
  const credentials = readAppliedCredentials(sessionStorage);
  if (
    !credentials.apiUrl ||
    !credentials.projectKey ||
    !credentials.session
  ) {
    return () => undefined;
  }

  let language = preferredLanguage() ?? '';

  let stopped = false;
  const values = new Map<string, string>();
  const keyDetails = new Map<
    string,
    { name: string; namespace?: string }
  >();
  const originalText = new WeakMap<Element, string>();
  const lastAppliedText = new WeakMap<Element, string>();
  const changedElements = new Set<Element>();

  const request = async (
    method: 'GET' | 'PUT',
    path: string,
    body?: object
  ): Promise<string> => {
    const result = (await messages.sendToPlugin('TOLGEE_API_REQUEST', {
      path,
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body
        ? { kind: 'json', text: JSON.stringify(body) }
        : { kind: 'none' },
      apiUrl: credentials.apiUrl,
      projectKey: credentials.projectKey,
      pageOrigin: window.location.origin,
    })) as ApiReply | undefined;

    if (!result || !('response' in result)) {
      throw new Error(
        result && 'error' in result
          ? result.error.message || 'Tolgee API request failed'
          : 'Tolgee extension did not answer'
      );
    }
    if (result.response.status < 200 || result.response.status >= 300) {
      throw new Error(
        `Tolgee API returned HTTP ${result.response.status}`
      );
    }
    return result.response.body;
  };

  const loadTranslations = async () => {
    const languagePath = `/v2/projects/${encodeURIComponent(
      credentials.projectKey!
    )}/languages?page=0&size=200`;
    const languageBody = JSON.parse(
      await request('GET', languagePath)
    ) as LanguagesPage;
    const available = (languageBody._embedded?.languages ?? []).filter(
      (item): item is ProjectLanguage & { tag: string } =>
        typeof item.tag === 'string'
    );
    const candidates = preferredLanguages();
    const selected = candidates
      .map((candidate) => {
        const normalized = candidate.toLowerCase();
        return (
          available.find((item) => item.tag.toLowerCase() === normalized) ??
          available.find(
            (item) =>
              item.tag.split('-')[0].toLowerCase() ===
              normalized.split('-')[0]
          )
        );
      })
      .find((item) => item !== undefined);
    const languageFallback =
      available.find((item) => item.base) ?? available[0];
    language = selected?.tag ?? languageFallback?.tag ?? language;
    if (!language) {
      throw new Error(
        'No language is available in the connected Tolgee project'
      );
    }

    const loaded = new Map<string, string>();
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        languages: language,
        page: String(page),
        size: String(PAGE_SIZE),
      });
      if (credentials.branch) {
        query.set('branch', credentials.branch);
      }
      const path = `/v2/projects/${encodeURIComponent(
        credentials.projectKey!
      )}/translations?${query.toString()}`;
      const body = JSON.parse(await request('GET', path)) as TranslationPage;
      for (const key of body._embedded?.keys ?? []) {
        const name = key.keyName;
        const text = key.translations?.[language]?.text;
        if (name && typeof text === 'string') {
          const namespace = key.keyNamespace || undefined;
          const details = { name, namespace };
          loaded.set(name, text);
          keyDetails.set(name, details);
          if (namespace) {
            const qualifiedName = `${namespace}.${name}`;
            loaded.set(qualifiedName, text);
            keyDetails.set(qualifiedName, details);
          }
        }
      }
      const totalPages = body.page?.totalPages ?? page + 1;
      if (page + 1 >= totalPages) {
        break;
      }
    }
    return loaded;
  };

  const keyOf = (element: Element): string | null => {
    const key =
      element.getAttribute('data-key') ||
      element.getAttribute('data-tolgee-key-only');
    return key?.trim() || null;
  };

  const restoreElement = (element: Element) => {
    const original = originalText.get(element);
    if (original === undefined) {
      return;
    }
    if (changedElements.has(element)) {
      element.textContent = original;
    }
    originalText.delete(element);
    lastAppliedText.delete(element);
    changedElements.delete(element);
  };

  const renderElement = (element: Element) => {
    if (element.children.length > 0) {
      restoreElement(element);
      return;
    }
    const key = keyOf(element);
    const translated = key ? values.get(key) : undefined;
    if (translated === undefined) {
      restoreElement(element);
      return;
    }
    const lastApplied = lastAppliedText.get(element);
    if (lastApplied === undefined || element.textContent !== lastApplied) {
      originalText.set(element, element.textContent ?? '');
    }
    if (element.textContent !== translated) {
      element.textContent = translated;
      lastAppliedText.set(element, translated);
      changedElements.add(element);
    }
  };

  const renderTree = (root: ParentNode = document) => {
    root.querySelectorAll('[data-key], [data-tolgee-key-only]').forEach(
      renderElement
    );
  };

  const onClick = async (event: MouseEvent) => {
    if (
      !event.altKey ||
      readAppliedCredentials(sessionStorage).editing === 'off' ||
      !(event.target instanceof Element)
    ) {
      return;
    }
    const element = event.target.closest(
      '[data-key], [data-tolgee-key-only]'
    );
    if (!element || element.children.length > 0) {
      return;
    }
    const key = keyOf(element);
    if (!key || !values.has(key)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const current = values.get(key) ?? element.textContent ?? '';
    const edited = window.prompt(`Edit Tolgee translation: ${key}`, current);
    if (edited === null || edited === current) {
      return;
    }

    try {
      const path = `/v2/projects/${encodeURIComponent(
        credentials.projectKey!
      )}/translations`;
      const details = keyDetails.get(key) ?? { name: key };
      await request('PUT', path, {
        key: details.name,
        ...(details.namespace ? { namespace: details.namespace } : {}),
        translations: { [language]: edited },
      });
      values.set(key, edited);
      renderElement(element);
    } catch (error) {
      console.warn('[Tolgee] Could not save standalone translation', error);
      window.alert(
        'Could not save this translation. Check that the connected project key has translations.edit permission.'
      );
    }
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === 'characterData' &&
        mutation.target.parentElement
      ) {
        renderElement(mutation.target.parentElement);
      }
      if (
        mutation.type === 'attributes' &&
        mutation.target instanceof Element
      ) {
        renderElement(mutation.target);
      }
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element) {
          renderElement(node);
          renderTree(node);
        } else if (node.parentElement) {
          renderElement(node.parentElement);
        }
      });
    }
  });

  loadTranslations()
    .then((loaded) => {
      if (stopped) {
        return;
      }
      loaded.forEach((text, key) => values.set(key, text));
      renderTree();
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['data-key', 'data-tolgee-key-only'],
      });
      document.addEventListener('click', onClick, true);
    })
    .catch((error) => {
      console.warn(
        '[Tolgee] Standalone translation mode could not start',
        error
      );
    });

  return () => {
    stopped = true;
    observer.disconnect();
    document.removeEventListener('click', onClick, true);
    changedElements.forEach(restoreElement);
  };
};

const preferredLanguages = (): string[] => {
  const candidates = [
    document.documentElement.lang,
    ...(navigator.languages ?? []),
    navigator.language,
  ];
  return [
    ...new Set(
      candidates
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ];
};

const preferredLanguage = (): string | null =>
  preferredLanguages()[0] ?? null;
