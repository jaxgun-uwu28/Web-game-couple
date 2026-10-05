import {readFile, writeFile} from 'node:fs/promises';
// PNG tEXt provenance travels with generated launcher and splash assets.
export async function pngOrigin(file, origin) {
  const png = await readFile(file);
  const data = Buffer.from('impeccable:prompt\0' + origin, 'latin1');
  const type = Buffer.from('tEXt');
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([type, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  await writeFile(file, Buffer.concat([png.subarray(0, -12), size, type, data, checksum, png.subarray(-12)]));
}
