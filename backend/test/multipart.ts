export interface FormPart {
  name: string;
  value?: string;
  filename?: string;
  content?: Buffer | string;
  contentType?: string;
}

const BOUNDARY = '----caraoke-test-boundary';

export function buildMultipart(parts: FormPart[]): { payload: Buffer; headers: Record<string, string> } {
  const chunks: Buffer[] = [];

  for (const part of parts) {
    const disposition = part.filename
      ? `form-data; name="${part.name}"; filename="${part.filename}"`
      : `form-data; name="${part.name}"`;
    const header = `--${BOUNDARY}\r\nContent-Disposition: ${disposition}\r\n`;
    const contentType = part.filename
      ? `Content-Type: ${part.contentType ?? 'application/octet-stream'}\r\n`
      : '';
    chunks.push(Buffer.from(`${header}${contentType}\r\n`));
    chunks.push(Buffer.from(part.filename ? (part.content ?? '') : (part.value ?? '')));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));

  return {
    payload: Buffer.concat(chunks),
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
  };
}
