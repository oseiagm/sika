// opus-decoder optionally decodes in a browser Web Worker; Cloudflare Workers have none and Sika never uses it.
export default class NoWebWorker {
  constructor() {
    throw new Error("Web Workers are not available here");
  }
}
