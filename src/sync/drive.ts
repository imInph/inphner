/**
 * inphner: the few Google Drive v3 calls sync needs, all inside the hidden
 * app folder (scope drive.appdata: inphner can't see anything else in Drive,
 * and nothing it writes shows up in the person's file list). Files are
 * gzipped JSON; 50k solves come to about a megabyte and a half.
 */

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveFile { id: string; name: string; modifiedTime: string }

export class DriveError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${token}` } });
  if (!res.ok) throw new DriveError(res.status, `Drive ${init.method ?? 'GET'} failed (${res.status})`);
  return res;
}

export async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

export async function gunzip(data: Blob): Promise<string> {
  return new Response(data.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

export async function listFiles(token: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let page = '';
  do {
    const q = new URLSearchParams({
      spaces: 'appDataFolder', pageSize: '200', fields: 'nextPageToken,files(id,name,modifiedTime)',
      ...(page ? { pageToken: page } : {}),
    });
    const body = await (await call(token, `${API}?${q}`)).json() as { files?: DriveFile[]; nextPageToken?: string };
    out.push(...body.files ?? []);
    page = body.nextPageToken ?? '';
  } while (page);
  return out;
}

export async function download(token: string, id: string): Promise<string> {
  return gunzip(await (await call(token, `${API}/${encodeURIComponent(id)}?alt=media`)).blob());
}

/** Create the file (no id yet) or replace its contents. Returns the file. */
export async function upload(token: string, name: string, data: Blob, id?: string): Promise<DriveFile> {
  const fields = 'fields=id,name,modifiedTime';
  if (id) {
    const res = await call(token, `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&${fields}`, {
      method: 'PATCH', headers: { 'content-type': 'application/gzip' }, body: data,
    });
    return res.json() as Promise<DriveFile>;
  }
  const boundary = `inphner${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, parents: ['appDataFolder'], mimeType: 'application/gzip' });
  const body = new Blob([
    `--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`,
    `--${boundary}\r\ncontent-type: application/gzip\r\n\r\n`, data, `\r\n--${boundary}--`,
  ]);
  const res = await call(token, `${UPLOAD}?uploadType=multipart&${fields}`, {
    method: 'POST', headers: { 'content-type': `multipart/related; boundary=${boundary}` }, body,
  });
  return res.json() as Promise<DriveFile>;
}

export async function remove(token: string, id: string): Promise<void> {
  await call(token, `${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
