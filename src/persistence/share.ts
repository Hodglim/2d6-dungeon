/**
 * Hands a file to the user: the share sheet where the browser can share files (iPad: Save to
 * Files, AirDrop), otherwise a download. Call it straight from a click handler, with the File
 * already built, so the user gesture is still alive when navigator.share runs.
 */
export function shareOrDownload(file: File): void {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    nav.share({ files: [file] }).catch((err: unknown) => {
      if (err instanceof Error && err.name === 'AbortError') return; // the user cancelled: nothing more to do
      download(file);
    });
    return;
  }
  download(file);
}

function download(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
