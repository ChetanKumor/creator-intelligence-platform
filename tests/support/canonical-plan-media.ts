// B2-A2: structural changes only to freshly generated test fixtures. These are never production media inputs.
import { readFile, writeFile } from "node:fs/promises";

interface Box { type: string; start: number; end: number; header: number }
function boxes(bytes: Buffer, start = 0, end = bytes.length): Box[] {
  const result: Box[] = [];
  while (start < end) {
    if (start + 8 > end) throw new Error("truncated fixture box");
    const raw = bytes.readUInt32BE(start), header = raw === 1 ? 16 : 8;
    const size = raw === 1 ? Number(bytes.readBigUInt64BE(start + 8)) : raw === 0 ? end - start : raw;
    if (!Number.isSafeInteger(size) || size < header || start + size > end) throw new Error("bad fixture box");
    result.push({ type: bytes.toString("latin1", start + 4, start + 8), start, end: start + size, header }); start += size;
  }
  return result;
}
function chain(bytes: Buffer, names: string[]): Box[] {
  let list = boxes(bytes);
  return names.map(name => {
    const found = list.find(box => box.type === name);
    if (!found) throw new Error(`fixture box missing: ${name}`);
    list = name === names.at(-1) ? [] : boxes(bytes, found.start + found.header, found.end);
    return found;
  });
}
export const FIXTURE_IDENTITY_MATRIX = [65536, 0, 0, 0, 65536, 0, 0, 0, 1073741824];
export async function patchPlanFixture(from: string, to: string, patch: { pasp?: [number, number]; matrix?: number[]; crop?: boolean }): Promise<string> {
  let bytes = await readFile(from);
  if (patch.matrix) {
    const box = chain(bytes, ["moov", "trak", "tkhd"]).at(-1)!;
    const body = box.start + box.header, at = body + (bytes[body] === 1 ? 52 : 40);
    patch.matrix.forEach((value, i) => bytes.writeInt32BE(value, at + 4 * i));
  }
  if (patch.pasp || patch.crop) {
    const parents = chain(bytes, ["moov", "trak", "mdia", "minf", "stbl", "stsd"]), stsd = parents.at(-1)!;
    const entry = boxes(bytes, stsd.start + stsd.header + 8, stsd.end)[0]!;
    if (patch.pasp) {
      const pasp = boxes(bytes, entry.start + 86, entry.end).find(box => box.type === "pasp");
      if (!pasp) throw new Error("fixture pasp missing");
      bytes.writeUInt32BE(patch.pasp[0], pasp.start + pasp.header); bytes.writeUInt32BE(patch.pasp[1], pasp.start + pasp.header + 4);
    }
    if (patch.crop) {
      const moov = parents[0]!, mdat = boxes(bytes).find(box => box.type === "mdat")!;
      if (moov.start < mdat.end) throw new Error("fixture requires trailing moov");
      const clap = Buffer.alloc(40); clap.writeUInt32BE(40, 0); clap.write("clap", 4, "latin1");
      [140, 1, 80, 1, 0, 1, 0, 1].forEach((n, i) => clap.writeInt32BE(n, 8 + 4 * i));
      const out = Buffer.concat([bytes.subarray(0, entry.end), clap, bytes.subarray(entry.end)]);
      for (const box of [...parents, entry]) { if (box.header !== 8) throw new Error("fixture requires short box headers"); out.writeUInt32BE(box.end - box.start + 40, box.start); }
      bytes = out;
    }
  }
  await writeFile(to, bytes, { flag: "wx" }); return to;
}

/** Chroma hostile fixtures only: add an unknown interpretation carrier or a malformed colr to a NEW generated copy. */
export async function appendChromaFixtureBox(from:string,to:string,type:"cloc"|"colr"):Promise<string> {
  const bytes=await readFile(from); if(bytes.length>4*1024*1024)throw new Error("Chroma fixture exceeds its tiny-media bound");
  const parents=chain(bytes,["moov","trak","mdia","minf","stbl","stsd"]),stsd=parents.at(-1)!;
  const entry=boxes(bytes,stsd.start+stsd.header+8,stsd.end)[0]!,mdat=boxes(bytes).find(b=>b.type==="mdat")!;
  if(parents[0]!.start<mdat.end)throw new Error("Chroma fixture requires trailing moov");
  const extra=Buffer.alloc(12);extra.writeUInt32BE(12,0);extra.write(type,4,"latin1");extra.write(type==="colr"?"nclx":"test",8,"latin1");
  const out=Buffer.concat([bytes.subarray(0,entry.end),extra,bytes.subarray(entry.end)]);
  for(const box of [...parents,entry]){if(box.header!==8)throw new Error("Chroma fixture requires short box headers");out.writeUInt32BE(box.end-box.start+12,box.start);}
  await writeFile(to,out,{flag:"wx"});return to;
}
