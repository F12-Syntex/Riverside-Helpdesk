// The Chrome extension's build tooling, checked the only way that means
// anything: by taking the .crx apart again with code that shares nothing with
// the code that wrote it, and verifying the signature the way Chrome does.
//
// A packer that is wrong produces a file that looks fine and refuses to
// install, which is exactly the failure this pipeline cannot debug remotely —
// nobody here has the practice's Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extensionId, packCrx, publicKeyDer } from '../extension/tools/crx.mjs';
import { zipDirectory } from '../extension/tools/zip.mjs';
import { higher, highestTag, nextVersion } from '../extension/tools/version.mjs';
import { bumpCount, readCount } from '../extension/src/counter.js';

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' });

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crx-'));
  fs.mkdirSync(path.join(dir, 'icons'));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ manifest_version: 3, version: '1.2.3' }));
  fs.writeFileSync(path.join(dir, 'popup.html'), '<!doctype html><p>hello</p>'.repeat(40));
  fs.writeFileSync(path.join(dir, 'icons', 'icon16.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return dir;
}

// A minimal protobuf reader — length-delimited fields only, which is all a CRX3
// header contains.
function fields(buf) {
  const out = [];
  let i = 0;
  const varint = () => {
    let value = 0; let shift = 0; let byte;
    do { byte = buf[i]; i += 1; value |= (byte & 0x7f) << shift; shift += 7; } while (byte & 0x80);
    return value >>> 0;
  };
  while (i < buf.length) {
    const tag = varint();
    assert.equal(tag & 7, 2, 'CRX3 headers hold only length-delimited fields');
    const length = varint();
    out.push({ number: tag >>> 3, data: buf.subarray(i, i + length) });
    i += length;
  }
  return out;
}

test('the packed crx is a CRX3 that Chrome would accept', () => {
  const { crx, id } = packCrx(fixture(), PEM);

  assert.equal(crx.subarray(0, 4).toString('latin1'), 'Cr24');
  assert.equal(crx.readUInt32LE(4), 3);

  const headerLength = crx.readUInt32LE(8);
  const header = crx.subarray(12, 12 + headerLength);
  const archive = crx.subarray(12 + headerLength);
  assert.equal(archive.subarray(0, 2).toString('latin1'), 'PK');

  const top = fields(header);
  const proofs = top.filter((f) => f.number === 2);
  const signedHeaderData = top.find((f) => f.number === 10000).data;
  assert.equal(proofs.length, 1, 'one sha256_with_rsa proof');

  // The id inside SignedData must be the id derived from the key in the proof:
  // Chrome checks exactly this, and a mismatch is what a swapped key looks like.
  const crxId = fields(signedHeaderData).find((f) => f.number === 1).data;
  assert.equal(crxId.length, 16);
  const asId = [...crxId].map((b) => b.toString(16).padStart(2, '0')).join('')
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(parseInt(c, 16) + 0x61));
  assert.equal(asId, id);

  const [{ data: publicKey }, { data: signature }] = fields(proofs[0].data);
  assert.equal(extensionId(publicKey), id);

  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(signedHeaderData.length);
  const verified = crypto.createVerify('sha256')
    .update(Buffer.from('CRX3 SignedData\0', 'latin1'))
    .update(prefix)
    .update(signedHeaderData)
    .update(archive)
    .verify(crypto.createPublicKey({ key: Buffer.from(publicKey), format: 'der', type: 'spki' }), Buffer.from(signature));
  assert.ok(verified, 'the signature covers the context, the signed header and the zip');
});

test('the signature does not survive tampering with the payload', () => {
  const { crx } = packCrx(fixture(), PEM);
  const headerLength = crx.readUInt32LE(8);
  const archive = Buffer.from(crx.subarray(12 + headerLength));
  archive[archive.length - 30] ^= 0xff;

  const header = crx.subarray(12, 12 + headerLength);
  const top = fields(header);
  const signedHeaderData = top.find((f) => f.number === 10000).data;
  const [{ data: publicKey }, { data: signature }] = fields(top.find((f) => f.number === 2).data);
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(signedHeaderData.length);

  const verified = crypto.createVerify('sha256')
    .update(Buffer.from('CRX3 SignedData\0', 'latin1'))
    .update(prefix).update(signedHeaderData).update(archive)
    .verify(crypto.createPublicKey({ key: Buffer.from(publicKey), format: 'der', type: 'spki' }), Buffer.from(signature));
  assert.equal(verified, false);
});

test('the extension id is 32 letters and belongs to the key alone', () => {
  const id = extensionId(publicKeyDer(PEM));
  assert.match(id, /^[a-p]{32}$/);
  assert.equal(id, extensionId(publicKeyDer(PEM)), 'stable across calls');
  assert.equal(packCrx(fixture(), PEM).id, id, 'the same id the packer stamps in');
});

test('packing the same directory twice gives the same bytes', () => {
  const dir = fixture();
  assert.deepEqual(packCrx(dir, PEM).crx, packCrx(dir, PEM).crx);
});

test('the zip is a real zip: local headers, central directory, end record', () => {
  const { archive, files } = zipDirectory(fixture());
  assert.deepEqual(files, ['icons/icon16.png', 'manifest.json', 'popup.html']);

  const end = archive.length - 22;
  assert.equal(archive.readUInt32LE(end), 0x06054b50);
  assert.equal(archive.readUInt16LE(end + 10), files.length);

  const directoryAt = archive.readUInt32LE(end + 16);
  assert.equal(archive.readUInt32LE(directoryAt), 0x02014b50);
  assert.equal(archive.readUInt32LE(0), 0x04034b50);

  // The text entries compress; the four-byte png does not, and is stored
  // rather than grown by a deflate stream longer than its own contents.
  const methods = [];
  for (let i = 0, at = directoryAt; i < files.length; i += 1) {
    methods.push(archive.readUInt16LE(at + 10));
    at += 46 + archive.readUInt16LE(at + 28);
  }
  assert.deepEqual(methods, [0, 8, 8]);
});

test('the shipped version is the highest tag with its patch moved on', () => {
  assert.equal(nextVersion('1.0.0', null), '1.0.0', 'nothing released yet: the baseline ships');
  assert.equal(nextVersion('1.0.0', '1.0.0'), '1.0.1');
  assert.equal(nextVersion('1.0.0', '1.0.9'), '1.0.10', 'patches are numbers, not decimals');
  assert.equal(nextVersion('1.1.0', '1.0.9'), '1.1.0', 'a hand-raised baseline ships as it is');
  assert.equal(nextVersion('2.0.0', '1.9.9'), '2.0.0');

  assert.equal(highestTag(['ext-v1.0.2', 'ext-v1.0.10', 'ext-v1.0.9']), '1.0.10');
  assert.equal(highestTag(['v3', 'not-a-tag', '']), null);
  assert.equal(higher('1.2.3', '1.2.3'), '1.2.3');
});

test('the popup counter remembers the count in chrome.storage', async (t) => {
  const store = {};
  globalThis.chrome = {
    storage: { local: {
      get: async (key) => ({ [key]: store[key] }),
      set: async (patch) => Object.assign(store, patch),
    } },
  };
  t.after(() => { delete globalThis.chrome; });

  assert.equal(await readCount(), 0);
  assert.equal(await bumpCount(), 1);
  assert.equal(await bumpCount(), 2);
  assert.equal(await readCount(), 2, 'read back from storage, not from a variable');
  assert.equal(store.clickCount, 2);
});
