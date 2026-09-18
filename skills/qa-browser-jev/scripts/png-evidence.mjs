/** Bounded PNG validation. No shell, browser, network, or optional native decoder.
 * Supports static non-interlaced 8/16-bit grayscale/RGB(+alpha) browser captures.
 * Other encodings are explicitly blocked, never accepted by magic bytes alone.
 * PNG layout/CRC/filter contracts: https://www.w3.org/TR/png-3/
 */
import { inflateSync } from 'node:zlib';
import { demand } from './jev-core.mjs';
import { sameSubject, timestamp, record } from './run-contract.mjs';

const MAGIC = Buffer.from([137,80,78,71,13,10,26,10]);
const TABLE = Uint32Array.from({length:256}, (_, n) => {
  for (let k=0;k<8;k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc=0xffffffff;
  for (const b of bytes) crc=TABLE[(crc ^ b) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function validatePng(bytes) {
  demand(Buffer.isBuffer(bytes) && bytes.length >= 57 && bytes.length <= 50*1024*1024 &&
    bytes.subarray(0,8).equals(MAGIC), 'INVALID_PNG');
  let offset=8, header=null, ended=false, idatEnded=false, seenIdat=false, palette=false;
  const data=[];
  while (offset < bytes.length) {
    demand(offset+12 <= bytes.length && !ended, 'TRUNCATED_PNG');
    const length=bytes.readUInt32BE(offset);
    demand(length <= bytes.length-offset-12, 'TRUNCATED_PNG');
    const typeBytes=bytes.subarray(offset+4,offset+8);
    demand(typeBytes.every(b=>(b>=65&&b<=90)||(b>=97&&b<=122)), 'PNG_CHUNK_TYPE');
    const type=typeBytes.toString('ascii'), body=bytes.subarray(offset+8,offset+8+length);
    demand(/^[A-Za-z]{4}$/.test(type) && /[A-Z]/.test(type[2]), 'PNG_CHUNK_TYPE');
    demand(crc32(bytes.subarray(offset+4,offset+8+length)) === bytes.readUInt32BE(offset+8+length), 'PNG_CRC');
    demand(header || type === 'IHDR', 'PNG_HEADER_ORDER');
    if (seenIdat && type !== 'IDAT') idatEnded=true;
    if (type === 'IHDR') {
      demand(!header && offset===8 && length===13, 'PNG_HEADER');
      const width=body.readUInt32BE(0),height=body.readUInt32BE(4),depth=body[8],color=body[9];
      demand(width>0 && height>0 && width<=32768 && height<=32768 && width*height<=32*1024*1024, 'PNG_DIMENSION_LIMIT');
      demand([8,16].includes(depth) && [0,2,4,6].includes(color) && body[10]===0 && body[11]===0 && body[12]===0,
        'PNG_ENCODING_UNSUPPORTED');
      header={width,height,depth,color};
    } else if (type === 'PLTE') {
      demand(!palette && !seenIdat && [2,6].includes(header.color) && length>0 && length<=768 && length%3===0, 'PNG_PALETTE');
      palette=true;
    } else if (type === 'IDAT') {
      demand(!idatEnded, 'PNG_IDAT_ORDER');seenIdat=true;data.push(body);
    } else if (type === 'IEND') {
      demand(seenIdat && length===0, 'PNG_END');ended=true;
    } else {
      demand(/[a-z]/.test(type[0]) && !['acTL','fcTL','fdAT'].includes(type), 'PNG_CHUNK_UNSUPPORTED');
    }
    offset+=length+12;
  }
  demand(ended && data.length>0, 'TRUNCATED_PNG');
  const channels={0:1,2:3,4:2,6:4}[header.color];
  const stride=header.width*channels*(header.depth/8)+1, expected=stride*header.height;
  demand(expected<=64*1024*1024, 'PNG_DECODE_LIMIT');
  const compressed=Buffer.concat(data);
  let decoded;
  try { decoded=inflateSync(compressed,{maxOutputLength:expected,info:true}); }
  catch { demand(false, 'PNG_DECODE_FAILED'); }
  demand(decoded.buffer.length===expected && decoded.engine.bytesWritten===compressed.length, 'PNG_DATA_LENGTH');
  for (let y=0;y<header.height;y++) demand(decoded.buffer[y*stride]<=4, 'PNG_FILTER');
  return {format:'png',width:header.width,height:header.height};
}
const positive = v => Number.isFinite(v) && v>0 && v<=32768;
const size = v => record(v) && positive(v.width) && positive(v.height);

export function validateCapture(meta, image, {contract,caseSpec,config}) {
  demand(record(meta) && meta.schemaVersion===1 && meta.runId===contract.runId && meta.caseId===caseSpec.id &&
    sameSubject(meta.subject,contract.subject) && timestamp(meta.capturedAt), 'CAPTURE_IDENTITY');
  const viewport=config.browser.viewports.find(v=>v.id===caseSpec.viewport);
  demand(size(meta.viewport) && viewport && meta.viewport.width===viewport.width && meta.viewport.height===viewport.height &&
    Number.isFinite(meta.dpr) && meta.dpr>=0.25 && meta.dpr<=4, 'CAPTURE_VIEWPORT');
  let url;try {url=new URL(meta.url);}catch {demand(false,'CAPTURE_URL');}
  demand(config.target.allowedOrigins.includes(url.origin) && !url.username && !url.password && !url.search && !url.hash, 'CAPTURE_URL');
  let target;
  if (meta.mode==='viewport') {
    demand(meta.clip===undefined && meta.documentSize===undefined, 'CAPTURE_MODE'); target=viewport;
  } else if (meta.mode==='full-page') {
    demand(meta.clip===undefined && size(meta.documentSize) && meta.documentSize.width>=viewport.width &&
      meta.documentSize.height>=viewport.height, 'CAPTURE_DOCUMENT_SIZE'); target=meta.documentSize;
  } else if (meta.mode==='clip') {
    const clip=meta.clip;
    demand(meta.documentSize===undefined && size(clip) && Number.isFinite(clip.x) && Number.isFinite(clip.y) &&
      clip.x>=0 && clip.y>=0 && clip.x+clip.width<=viewport.width && clip.y+clip.height<=viewport.height, 'CAPTURE_CLIP');target=clip;
  } else demand(false,'CAPTURE_MODE');
  demand(['width','height'].every(k=>Math.abs(image[k]-target[k]*meta.dpr)<=1), 'CAPTURE_DIMENSIONS_MISMATCH');
  return meta;
}
