export interface UploadedFileResult {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  isImage: boolean;
  markdown: string;
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

export async function uploadFileToKanso(
  file: File,
  apiUrl: string
): Promise<UploadedFileResult> {
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Datei überschreitet das Limit von 10 MB.');
  }

  const dataBase64 = await readFileAsDataUrl(file);
  const res = await fetch(`${apiUrl}/api/uploads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name || `upload-${Date.now()}.png`,
      mimeType: file.type || 'application/octet-stream',
      dataBase64,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Upload fehlgeschlagen.');
  }

  const fullUrl = apiUrl ? `${apiUrl}${data.url}` : data.url;
  const markdown = data.isImage
    ? `![${data.filename}](${fullUrl})`
    : `[📎 ${data.filename}](${fullUrl})`;

  return {
    ...data,
    url: fullUrl,
    markdown,
  };
}

export function insertMarkdownAtCursor(
  textarea: HTMLTextAreaElement | null,
  currentValue: string,
  snippet: string,
  onChange: (next: string) => void
) {
  if (!textarea) {
    const prefix = currentValue && !currentValue.endsWith('\n') ? '\n' : '';
    onChange(`${currentValue}${prefix}${snippet}\n`);
    return;
  }

  const start = textarea.selectionStart ?? currentValue.length;
  const end = textarea.selectionEnd ?? currentValue.length;
  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);
  const padBefore = before && !before.endsWith('\n') && !before.endsWith(' ') ? '\n' : '';
  const padAfter = after && !after.startsWith('\n') ? '\n' : '';
  const next = `${before}${padBefore}${snippet}${padAfter}${after}`;
  onChange(next);
}
