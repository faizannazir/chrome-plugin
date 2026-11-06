const SOURCE_ATTRIBUTE = 'data-key';
const TOLGEE_KEY_ATTRIBUTE = 'data-tolgee-key-only';

/**
 * Bridges conventional data-key markup to the attribute understood by the
 * Tolgee JS ObserverPlugin. The SDK remains responsible for rendering and
 * opening its in-context editor; this extension only makes the key discoverable.
 */
export function bridgeDataKeys(root: ParentNode = document): () => void {
  const bridged = new WeakSet<Element>();

  const syncElement = (element: Element) => {
    const key = element.getAttribute(SOURCE_ATTRIBUTE);
    if (key?.trim()) {
      if (!element.hasAttribute(TOLGEE_KEY_ATTRIBUTE)) {
        element.setAttribute(TOLGEE_KEY_ATTRIBUTE, key);
        bridged.add(element);
      } else if (bridged.has(element)) {
        element.setAttribute(TOLGEE_KEY_ATTRIBUTE, key);
      }
    } else if (bridged.has(element)) {
      element.removeAttribute(TOLGEE_KEY_ATTRIBUTE);
      bridged.delete(element);
    }
  };

  const syncTree = (node: Node) => {
    if (node instanceof Element) {
      syncElement(node);
      node.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`).forEach(syncElement);
    } else if (node instanceof Document || node instanceof DocumentFragment) {
      node.querySelectorAll(`[${SOURCE_ATTRIBUTE}]`).forEach(syncElement);
    }
  };

  syncTree(root as Node);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof Element) {
        syncElement(mutation.target);
      }
      mutation.addedNodes.forEach(syncTree);
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [SOURCE_ATTRIBUTE],
  });

  return () => observer.disconnect();
}
