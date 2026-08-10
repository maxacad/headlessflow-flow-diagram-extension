type VsCodeApi = {
    postMessage: (message: unknown) => void;
};
declare const vscodeApi: VsCodeApi | undefined;
export default vscodeApi;
