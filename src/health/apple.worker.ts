// Apple Health import — Web Worker wrapper.
//
// The parser in `apple.ts` is pure; the only reason this file exists is
// to keep the parse off the main thread (per the ticket — a nav-click
// during a multi-GB import must still be handled within 200ms) and to
// own the zip decompression, since real exports arrive as ZIP archives
// from the iOS share sheet.
//
// We decompress via the browser's built-in `DecompressionStream` rather
// than pulling a zip library — `DecompressionStream("deflate-raw")` is in
// every browser we ship to (Safari 16.4+, Chromium 80+) and the ZIP local-
// file-header format is trivial to read out of a few hundred bytes of
// header.  No new npm dep, no supply-chain widening.

/// <reference lib="webworker" />

import { parseAppleHealthXml, type ImportResult } from "./apple";

declare const self: DedicatedWorkerGlobalScope;

/**
 * The structured message envelope this worker accepts. Only one shape today;
 * the discriminant is here so we can add (e.g.) "cancel" later without
 * breaking older callers.
 */
export interface ImportRequest {
  kind: "import";
  /** Filename — used to decide whether to unzip first. */
  name: string;
  /** Raw file bytes. Transferred (not copied) when the caller posts. */
  bytes: ArrayBuffer;
}

/** Periodic update for the main thread's progress UI (0..1). */
export interface ProgressEvent { kind: "progress"; value: number; }
/** Terminal success. */
export interface DoneEvent     { kind: "done";     result: ImportResult; }
/** Terminal failure. The message is shown verbatim in the errorCard. */
export interface ErrorEvent    { kind: "error";    message: string; }

export type WorkerEvent = ProgressEvent | DoneEvent | ErrorEvent;

self.addEventListener("message", async (e: MessageEvent<ImportRequest>) => {
  const req = e.data;
  if (req?.kind !== "import") return;

  try {
    const xml = await loadXml(req.name, req.bytes);
    // Report initial progress so the UI can swap to "parsing…" right away.
    post({ kind: "progress", value: 0 });
    const result = parseAppleHealthXml(xml, (pct) => {
      post({ kind: "progress", value: pct });
    });
    post({ kind: "done", result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    post({ kind: "error", message: msg });
  }
});

function post(ev: WorkerEvent): void { self.postMessage(ev); }

/* -------------------------------------------------------------------------- */
/*  ZIP handling                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Resolve the raw `export.xml` text from the dropped file. Three paths:
 *
 *   1. Filename ends in `.xml` → decode directly as UTF-8.
 *   2. Filename ends in `.zip` → walk the local file headers, find the
 *      first `export.xml` entry, inflate it via `DecompressionStream`.
 *   3. Anything else → bail with an editorial message.
 */
async function loadXml(name: string, bytes: ArrayBuffer): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xml")) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  if (lower.endsWith(".zip")) {
    const xmlBytes = await unzipExportXml(bytes);
    if (!xmlBytes) {
      throw new Error(
        "Could not find export.xml inside this ZIP. " +
        "Make sure you exported from Health → your profile → Export All Health Data.",
      );
    }
    return new TextDecoder("utf-8").decode(xmlBytes);
  }
  throw new Error(
    "Drop the .zip from Apple Health's export, or the export.xml inside it.",
  );
}

/**
 * Walk the ZIP local-file-header stream and return the bytes of the first
 * file named `export.xml` (case-insensitive, accepts subdirectory paths
 * like `apple_health_export/export.xml`).
 *
 * We deliberately don't parse the central directory — for the one file we
 * care about, the local headers carry everything we need (name, compressed
 * length, uncompressed length, compression method). This keeps the code
 * tiny and lets us short-circuit as soon as we find a match.
 *
 * Returns null if no matching entry exists.
 */
async function unzipExportXml(buffer: ArrayBuffer): Promise<Uint8Array | null> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let off = 0;
  const SIG = 0x04034b50;   // "PK\x03\x04" — local file header

  while (off + 30 <= bytes.length) {
    const sig = view.getUint32(off, /*littleEndian*/ true);
    if (sig !== SIG) break;   // we've walked past all local file headers

    const method   = view.getUint16(off + 8,  true);
    const compSize = view.getUint32(off + 18, true);
    const uncSize  = view.getUint32(off + 22, true);
    const nameLen  = view.getUint16(off + 26, true);
    const extraLen = view.getUint16(off + 28, true);

    const nameStart = off + 30;
    const nameEnd   = nameStart + nameLen;
    const name = new TextDecoder("utf-8").decode(bytes.subarray(nameStart, nameEnd));
    const dataStart = nameEnd + extraLen;
    const dataEnd   = dataStart + compSize;

    const baseName = name.split("/").pop() ?? name;
    if (baseName.toLowerCase() === "export.xml") {
      const slice = bytes.subarray(dataStart, dataEnd);
      if (method === 0) {
        // STORE — already the raw bytes.
        return new Uint8Array(slice);   // copy out of the backing buffer
      }
      if (method === 8) {
        // DEFLATE — raw deflate stream (no zlib header). The browser's
        // DecompressionStream with `deflate-raw` is exactly this.
        return await inflateRaw(slice, uncSize);
      }
      throw new Error(`Unsupported zip compression method (${method}) for export.xml.`);
    }

    // Skip this entry and continue scanning. compSize is reliable for
    // Apple's exporter (it writes the local header BEFORE the data with
    // sizes filled in, not using the data-descriptor trailer mode).
    off = dataEnd;
  }
  return null;
}

/**
 * Inflate a raw-deflate slice via the browser's `DecompressionStream`.
 * Returns the decoded bytes. `hintSize` is the entry's uncompressed length
 * from the local header — we pre-allocate a buffer of that size so we
 * don't grow-and-copy through tens of MB.
 */
async function inflateRaw(deflated: Uint8Array, hintSize: number): Promise<Uint8Array> {
  // Some browsers reject zero-byte deflate; bail early with an empty result.
  if (deflated.length === 0) return new Uint8Array(0);
  // Cast to the right global — TS doesn't carry the lib.dom name through
  // a worker context cleanly under strict mode. The runtime symbol IS
  // `DecompressionStream` in every browser that supports it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DS = (self as any).DecompressionStream as undefined | (new (format: string) => any);
  if (!DS) {
    throw new Error(
      "This browser doesn't support DecompressionStream. " +
      "Drop the export.xml directly (it's the file inside the ZIP).",
    );
  }
  // Copy into a fresh Uint8Array backed by a non-shared ArrayBuffer so the
  // Blob constructor's `ArrayBufferView<ArrayBuffer>` type signature is
  // satisfied. The .slice() coerces the underlying buffer cleanly.
  const blobPart = new Uint8Array(deflated.byteLength);
  blobPart.set(deflated);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stream: ReadableStream<Uint8Array> = new Blob([blobPart]).stream().pipeThrough(new DS("deflate-raw")) as any;
  const reader = stream.getReader();

  // Pre-allocate when we have a sane hint. If the hint is missing or
  // suspiciously small, fall back to a chunked array.
  if (hintSize > 0 && hintSize < 512 * 1024 * 1024) {
    const out = new Uint8Array(hintSize);
    let pos = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      // Some browsers emit Uint8Array chunks larger than the hint when the
      // header lied; fall back to grow-and-copy in that case.
      if (pos + value.byteLength > out.length) {
        return await drainToArray(reader, [out.subarray(0, pos), value]);
      }
      out.set(value, pos);
      pos += value.byteLength;
    }
    return pos === out.length ? out : out.subarray(0, pos);
  }
  return await drainToArray(reader, []);
}

async function drainToArray(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  seeded: Uint8Array[],
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [...seeded];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.byteLength, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) { out.set(c, pos); pos += c.byteLength; }
  return out;
}
