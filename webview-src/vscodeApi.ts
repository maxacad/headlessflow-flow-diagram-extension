type VsCodeApi = { postMessage: (message: unknown) => void };

declare function acquireVsCodeApi(): VsCodeApi;

// acquireVsCodeApi() can only be called once per webview lifetime.
// Export a single shared instance for all modules.
const vscodeApi: VsCodeApi | undefined =
  typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : undefined;

export default vscodeApi;
