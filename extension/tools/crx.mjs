// Packing and identifying a CRX3, with node:crypto and nothing else.
//
// The format (chrome/common/extensions/api/_crx3.proto) is:
//
//   "Cr24" | uint32le version=3 | uint32le header length | header | zip
//
// where the header is a CrxFileHeader protobuf carrying the public key, the
// signature, and a SignedData block holding the extension's own id. The
// signature covers a context string, the SignedData, and the zip — so the id,
// the key and the payload are all bound together and none can be swapped.
//
// Three protobuf fields are needed, so they are written by hand rather than
// pulled in with a protobuf runtime.
import crypto from 'node:crypto';
import { zipDirectory } from './zip.mjs';

const SIGNATURE_CONTEXT = Buffer.from('CRX3 SignedData\0', 'latin1');

function varint(value) {
  const out = [];
  let n = value;
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n) byte |= 0x80;
    out.push(byte);
  } while (n);
  return Buffer.from(out);
}

// Wire type 2 — a length-delimited field, which is the only kind used here.
function field(number, payload) {
  return Buffer.concat([varint((number << 3) | 2), varint(payload.length), payload]);
}

/** The SubjectPublicKeyInfo DER for the public half of a PEM private key. */
export function publicKeyDer(pem) {
  return crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' });
}

/**
 * The extension id Chrome will give this key: the first 16 bytes of the
 * SHA-256 of the public key, rendered in "mpdecimal" — hex digits 0-f shifted
 * up into a-p, which is why every extension id is 32 letters and never a digit.
 */
export function extensionId(publicKeyDerBytes) {
  const digest = crypto.createHash('sha256').update(publicKeyDerBytes).digest();
  return [...digest.subarray(0, 16)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .replace(/[0-9a-f]/g, (c) => String.fromCharCode(parseInt(c, 16) + 0x61));
}

/** Packs a built dist/ directory into a signed .crx buffer. */
export function packCrx(dir, privateKeyPem) {
  const key = crypto.createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'rsa') {
    throw new Error(`the signing key must be RSA, this one is ${key.asymmetricKeyType}`);
  }

  const publicKey = publicKeyDer(key);
  const id = extensionId(publicKey);
  const crxId = Buffer.from(id.replace(/[a-p]/g, (c) => (c.charCodeAt(0) - 0x61).toString(16)), 'hex');

  const { archive, files } = zipDirectory(dir);

  const signedHeaderData = field(1, crxId); // SignedData { crx_id }
  const lengthPrefix = Buffer.alloc(4);
  lengthPrefix.writeUInt32LE(signedHeaderData.length);

  const signature = crypto.createSign('sha256')
    .update(SIGNATURE_CONTEXT)
    .update(lengthPrefix)
    .update(signedHeaderData)
    .update(archive)
    .sign(key);

  const proof = Buffer.concat([field(1, publicKey), field(2, signature)]);
  const header = Buffer.concat([
    field(2, proof), // sha256_with_rsa
    field(10000, signedHeaderData),
  ]);

  const preamble = Buffer.alloc(12);
  preamble.write('Cr24', 0, 'latin1');
  preamble.writeUInt32LE(3, 4); // CRX3
  preamble.writeUInt32LE(header.length, 8);

  return { crx: Buffer.concat([preamble, header, archive]), id, files };
}
