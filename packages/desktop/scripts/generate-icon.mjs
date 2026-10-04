import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createCRC32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  return table;
}

const crcTable = createCRC32Table();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  typeBuf.copy(chunk, 4);
  data.copy(chunk, 8);
  const crcTarget = Buffer.concat([typeBuf, data]);
  const crcVal = crc32(crcTarget);
  chunk.writeUInt32BE(crcVal, 8 + len);
  return chunk;
}

export function generateNexusIcon(width = 128, height = 128) {
  const bytesPerPixel = 4;
  const scanlineLength = 1 + width * bytesPerPixel;
  const rawData = Buffer.alloc(scanlineLength * height);

  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.46;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawData[rowOffset] = 0; // Filter: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Rounded dark badge background
        const grad = 1 - (dist / r) * 0.3;
        let red = Math.floor(10 * grad);
        let green = Math.floor(14 * grad);
        let blue = Math.floor(26 * grad);
        let alpha = 255;

        // Draw "N" logo
        const nx = (x - cx) / (width * 0.28);
        const ny = (y - cy) / (height * 0.35);

        const inLeftCol = nx >= -0.8 && nx <= -0.4 && ny >= -0.8 && ny <= 0.8;
        const inRightCol = nx >= 0.4 && nx <= 0.8 && ny >= -0.8 && ny <= 0.8;
        const inDiag = Math.abs(ny - nx) <= 0.35 && nx >= -0.6 && nx <= 0.6 && ny >= -0.8 && ny <= 0.8;

        if (inLeftCol || inRightCol || inDiag) {
          // Cyan / Sky-blue glowing emblem (#38bdf8 to #0ea5e9)
          red = 14;
          green = 165;
          blue = 233;
          if (inDiag) {
            red = 56;
            green = 189;
            blue = 248;
          }
        }

        // Inner glowing border
        if (Math.abs(dist - r) < 2.5) {
          red = 56;
          green = 189;
          blue = 248;
        }

        rawData[pxOffset] = red;
        rawData[pxOffset + 1] = green;
        rawData[pxOffset + 2] = blue;
        rawData[pxOffset + 3] = alpha;
      } else {
        // Transparent outside badge
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  // PNG Header
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // Bit depth
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // Compression
  ihdrData[11] = 0; // Filter
  ihdrData[12] = 0; // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // IDAT
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const assetsDir = path.resolve(__dirname, '../assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

const pngBuffer = generateNexusIcon(128, 128);
const iconPath = path.join(assetsDir, 'icon.png');
fs.writeFileSync(iconPath, pngBuffer);
console.log(`Generated NEXUS.AI application icon at: ${iconPath} (${pngBuffer.length} bytes)`);
