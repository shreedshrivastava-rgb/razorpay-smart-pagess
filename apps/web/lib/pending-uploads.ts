// Hands files picked on the landing composer (+ button) to the chat screen.
// Uses a module singleton rather than sessionStorage: client-side navigation
// (router.push) preserves the JS heap, so this survives the hop without the
// ~5 MB sessionStorage cap that large catalogues/PDFs would blow.

export interface PendingUpload {
  name: string;
  dataUrl: string;
  type: string;
}

let store: PendingUpload[] = [];

export function setPendingUploads(files: PendingUpload[]): void {
  store = files;
}

// Read without clearing — safe to call from a useState initializer (which React
// may invoke twice in dev StrictMode). Clear explicitly via clearPendingUploads.
export function peekPendingUploads(): PendingUpload[] {
  return store;
}

export function clearPendingUploads(): void {
  store = [];
}
