// A deterministic zip writer, because a .crx is a signed zip and Node has no
// zip in its standard library.
//
// Deterministic matters here: every file gets the same DOS timestamp
// (1980-01-01), so packing the same dist/ twice produces byte-identical
// archives, and therefore byte-identical .crx files. A build that differs only
// in its timestamps is a build you cannot compare.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { crc32 } from './crc32.mjs';

const DOS_DATE = 0x0021; // 1980-01-01
const DOS_TIME = 0x0000;

function listFiles(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry) => {
      const name = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return listFiles(path.join(dir, entry.name), name);
      return [{ name, body: fs.readFileSync(path.join(dir, entry.name)) }];
    });
}

export function zipDirectory(dir) {
  const files = listFiles(dir);
  const locals = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const deflated = zlib.deflateRawSync(file.body, { level: 9 });
    // Only compress when it actually helps; otherwise store it.
    const compress = deflated.length < file.body.length;
    const body = compress ? deflated : file.body;
    const method = compress ? 8 : 0;
    const sum = crc32(file.body);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.body.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    locals.push(local, name, body);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4); // version made by
    entry.writeUInt16LE(20, 6); // version needed
    entry.writeUInt16LE(0, 8); // flags
    entry.writeUInt16LE(method, 10);
    entry.writeUInt16LE(DOS_TIME, 12);
    entry.writeUInt16LE(DOS_DATE, 14);
    entry.writeUInt32LE(sum, 16);
    entry.writeUInt32LE(body.length, 20);
    entry.writeUInt32LE(file.body.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt16LE(0, 30); // extra length
    entry.writeUInt16LE(0, 32); // comment length
    entry.writeUInt16LE(0, 34); // disk number
    entry.writeUInt16LE(0, 36); // internal attributes
    entry.writeUInt32LE(0, 38); // external attributes
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);

    offset += local.length + name.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); // this disk
  end.writeUInt16LE(0, 6); // disk with the directory
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20); // comment length

  return { archive: Buffer.concat([...locals, directory, end]), files: files.map((f) => f.name) };
}
