(() => {
  // Inject only in the trusted top-level document. No token or general shell API is exposed.
  if (window.top !== window || location.origin !== __EXPECTED_ORIGIN__) return;
  const pending = new Map();
  window.chrome.webview.addEventListener('message', ({ data }) => {
    if (!data || data.type !== 'reply') return;
    const operation = pending.get(data.id);
    if (!operation) return;
    pending.delete(data.id);
    data.error ? operation.reject(new Error(data.error)) : operation.resolve(data.result);
  });
  const call = (method, argument) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    pending.set(id, { resolve, reject });
    window.chrome.webview.postMessage({ id, method, argument });
  });
  Object.defineProperty(window, 'syukatsuDesktop', { configurable: false, writable: false, value: Object.freeze({
    getSession: () => call('getSession'), signIn: () => call('signIn'),
    cancelSignIn: () => call('cancelSignIn'), signOut: () => call('signOut'),
    listModels: () => call('listModels'), generate: value => call('generate', value),
    openUsage: () => call('openUsage'), getCareerProfile: () => call('getCareerProfile'),
    saveCareerProfile: value => call('saveCareerProfile', value),
  }) });
})();
