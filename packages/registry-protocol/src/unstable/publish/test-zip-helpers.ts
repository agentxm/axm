import * as zlib from "node:zlib";

interface ZipFileEntry {
  fileName: string;
  content: Uint8Array;
  compressionMethod?: number;
  externalAttributes?: number;
}

const textEncoder = new TextEncoder();

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;

const writeUint32LE = (buf: DataView, offset: number, value: number) =>
  buf.setUint32(offset, value, true);

const writeUint16LE = (buf: DataView, offset: number, value: number) =>
  buf.setUint16(offset, value, true);

const concatBytes = (arrays: Uint8Array[]): Uint8Array => {
  const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const array of arrays) {
    result.set(array, offset);
    offset += array.length;
  }
  return result;
};

export const buildZip = (entries: ZipFileEntry[]): Uint8Array => {
  const centralDirs: Uint8Array[] = [];
  let currentOffset = 0;
  const localParts: Uint8Array[] = [];

  for (const entry of entries) {
    const fileNameBytes = textEncoder.encode(entry.fileName);
    const compressionMethod = entry.compressionMethod ?? 0;

    let compressedData: Uint8Array;
    if (compressionMethod === 8) {
      const deflated = zlib.deflateRawSync(entry.content);
      compressedData = new Uint8Array(deflated.buffer, deflated.byteOffset, deflated.byteLength);
    } else {
      compressedData = entry.content;
    }

    const localBuf = new ArrayBuffer(30);
    const localView = new DataView(localBuf);

    writeUint32LE(localView, 0, LOCAL_FILE_HEADER_SIG);
    writeUint16LE(localView, 4, 20);
    writeUint16LE(localView, 6, 0);
    writeUint16LE(localView, 8, compressionMethod);
    writeUint16LE(localView, 10, 0);
    writeUint16LE(localView, 12, 0);
    writeUint32LE(localView, 14, 0);
    writeUint32LE(localView, 18, compressedData.length);
    writeUint32LE(localView, 22, entry.content.length);
    writeUint16LE(localView, 26, fileNameBytes.length);
    writeUint16LE(localView, 28, 0);

    const localHeaderBytes = new Uint8Array(localBuf);
    const localRecord = concatBytes([localHeaderBytes, fileNameBytes, compressedData]);
    localParts.push(localRecord);

    const cdirBuf = new ArrayBuffer(46);
    const cdirView = new DataView(cdirBuf);

    writeUint32LE(cdirView, 0, CENTRAL_DIR_SIG);
    writeUint16LE(cdirView, 4, 20);
    writeUint16LE(cdirView, 6, 20);
    writeUint16LE(cdirView, 8, 0);
    writeUint16LE(cdirView, 10, compressionMethod);
    writeUint16LE(cdirView, 12, 0);
    writeUint16LE(cdirView, 14, 0);
    writeUint32LE(cdirView, 16, 0);
    writeUint32LE(cdirView, 20, compressedData.length);
    writeUint32LE(cdirView, 24, entry.content.length);
    writeUint16LE(cdirView, 28, fileNameBytes.length);
    writeUint16LE(cdirView, 30, 0);
    writeUint16LE(cdirView, 32, 0);
    writeUint16LE(cdirView, 34, 0);
    writeUint16LE(cdirView, 36, 0);
    writeUint32LE(cdirView, 38, entry.externalAttributes ?? 0);
    writeUint32LE(cdirView, 42, currentOffset);

    centralDirs.push(concatBytes([new Uint8Array(cdirBuf), fileNameBytes]));
    currentOffset += localRecord.length;
  }

  const cdirStartOffset = currentOffset;
  const allCdir = concatBytes(centralDirs);
  const eocdBuf = new ArrayBuffer(22);
  const eocdView = new DataView(eocdBuf);

  writeUint32LE(eocdView, 0, EOCD_SIG);
  writeUint16LE(eocdView, 4, 0);
  writeUint16LE(eocdView, 6, 0);
  writeUint16LE(eocdView, 8, entries.length);
  writeUint16LE(eocdView, 10, entries.length);
  writeUint32LE(eocdView, 12, allCdir.length);
  writeUint32LE(eocdView, 16, cdirStartOffset);
  writeUint16LE(eocdView, 20, 0);

  return concatBytes([...localParts, allCdir, new Uint8Array(eocdBuf)]);
};

export const buildSymlinkZip = (symlinkName: string, targetPath: string): Uint8Array => {
  const symlinkAttrs = (0xa000 | 0o777) << 16;
  return buildZip([
    {
      fileName: symlinkName,
      content: textEncoder.encode(targetPath),
      externalAttributes: symlinkAttrs,
    },
  ]);
};

export const buildDecompressionBombZip = (
  uncompressedSize: number,
  compressedSize: number,
  entryName = "bomb.bin",
): Uint8Array => {
  const content = new Uint8Array(compressedSize);
  const zip = buildZip([
    {
      fileName: entryName,
      content,
      compressionMethod: 0,
    },
  ]);

  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  view.setUint32(22, uncompressedSize, true);

  for (let i = zip.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      const cdirOffset = view.getUint32(i + 16, true);
      view.setUint32(cdirOffset + 24, uncompressedSize, true);
      break;
    }
  }

  return zip;
};

export const buildMalformedZip = (): Uint8Array =>
  new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);

export const textContent = (text: string): Uint8Array => textEncoder.encode(text);
