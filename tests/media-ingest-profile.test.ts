// Gate 7 Batch 3E-B2-A1, Parts 2-4: CanonicalMediaProfile v1, the CanonicalMediaFacts 1.0.0 evidence schema and the pure profile
// evaluation. Pure: typed facts records only. No media, process, FFmpeg/ffprobe, model, clock or network. Every fixture is a labelled
// synthetic shape; shapes that replicate a B2R measurement name it. New exports are read through the module namespace, so against the
// pre-B2-A1 bytes every new behaviour fails in its own test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalSerialize } from "../packages/domain/serialization.js";
import * as ingest from "../packages/media-ingest/index.js";
import { D4_ELEMENTS, MATRICES, SAR_1_1, SAR_UNSPECIFIED, X264_UUID, X265_UUID, audioFrames, audioStream, cfr, clone, facts, gap500, heldFirstFrame, jittered,
  ntscIn600, oneTickPairs, piecewise30to24to15, sei, sideData, sixtyThenTen, timecode, videoStream, withVideo, type Json } from "./support/canonical-facts.js";

type Evaluation = { outcome: string; factsDigest: string | null; findings: { dimension: string; code: string; disposition: string }[];
  profile: { profileId: string; profileVersion: string } };
const evaluate = (value: unknown): Evaluation => ingest.evaluateCanonicalProfileV1(value) as unknown as Evaluation;
const codes = (value: unknown): string[] => evaluate(value).findings.map(f => f.code);
const has = (value: unknown, code: string): boolean => codes(value).includes(code);
const matrix = (coefficients: readonly number[]): Json => ({ state: "present", coefficients: [...coefficients] });

// ================================================================ PROFILE
test("B2A1-P01 a known-good H.264 8-bit 4:2:0 progressive BT.709 limited-range source with explicit 1:1 conforms", () => {
  for (const value of [facts(), withVideo({}, null), facts([videoStream(), audioStream({ codec: "pcm_s16le" })]),
    facts([videoStream(), audioStream({ sampleRateHz: 44_100, timeBase: { numerator: 1, denominator: 44_100 } })]),
    facts([videoStream(), audioStream({ channels: 1, channelLayout: "mono" })])]) {
    const result = evaluate(value);
    assert.equal(result.outcome, "CONFORMS", canonicalSerialize(result.findings));
    assert.deepEqual(result.findings, []);
    assert.deepEqual(result.profile, { profileId: ingest.CANONICAL_MEDIA_PROFILE_V1.profileId, profileVersion: "1.0.0" });
    assert.match(String(result.factsDigest), /^[a-f0-9]{64}$/);
  }
  assert.match(ingest.CANONICAL_MEDIA_PROFILE_V1.profileId, /^canonical_media_profile_v1_[a-f0-9]{64}$/);
});

test("B2A1-P02 interlaced or unknown scan refuses: deinterlacing is not in the v1 vocabulary", () => {
  for (const fieldOrder of ["tt", "bb", "tb", "bt"]) {
    const result = evaluate(withVideo({ fieldOrder }));
    assert.equal(result.outcome, "REFUSE", fieldOrder);
    assert.deepEqual(result.findings.filter(f => f.dimension === "video_scan"), [{ dimension: "video_scan", code: "interlaced", disposition: "refuse" }]);
  }
  assert.ok(has(withVideo({ fieldOrder: "unknown" }), "field_order_unknown"));
});

test("B2A1-P03 an explicit non-square SAR does not conform: a future pixel transform, never a declaration", () => {
  for (const ratio of [[4, 3], [16, 15], [40, 33], [1, 2], [8, 9], [64, 45]] as const) {
    const declared = { state: "declared", numerator: ratio[0], denominator: ratio[1] };
    for (const sar of [{ container: declared, bitstream: declared }, { container: declared, bitstream: SAR_UNSPECIFIED }, { container: SAR_UNSPECIFIED, bitstream: declared }]) {
      const result = evaluate(withVideo({ sampleAspectRatio: sar }));
      assert.equal(result.outcome, "CANONICALIZABLE_REENCODE_DEFERRED", canonicalSerialize(sar));
      assert.deepEqual(result.findings, [{ dimension: "video_sample_aspect", code: "sar_non_square", disposition: "deferred_reencode" }]);
    }
  }
  // An equal ratio written unreduced is still square.
  const two = { state: "declared", numerator: 2, denominator: 2 };
  assert.equal(evaluate(withVideo({ sampleAspectRatio: { container: two, bitstream: SAR_1_1 } })).outcome, "CONFORMS");
});

test("B2A1-P04 an unspecified SAR does not conform but is an exact-remux candidate; explicit 1:1 in either declaration conforms", () => {
  const result = evaluate(withVideo({ sampleAspectRatio: { container: SAR_UNSPECIFIED, bitstream: SAR_UNSPECIFIED } }));
  assert.equal(result.outcome, "CANONICALIZABLE_EXACT_REMUX");
  assert.deepEqual(result.findings, [{ dimension: "video_sample_aspect", code: "sar_unspecified", disposition: "exact_remux" }]);
  for (const sar of [{ container: SAR_1_1, bitstream: SAR_UNSPECIFIED }, { container: SAR_UNSPECIFIED, bitstream: SAR_1_1 }]) {
    assert.equal(evaluate(withVideo({ sampleAspectRatio: sar })).outcome, "CONFORMS", canonicalSerialize(sar));
  }
});

test("B2A1-P05 every non-identity D4 display transform is a deferred re-encode candidate, never DIRECT and never malformed", () => {
  for (const element of D4_ELEMENTS) {
    const result = evaluate(withVideo({ displayMatrix: matrix(MATRICES[element]) }));
    assert.equal(result.outcome, "CANONICALIZABLE_REENCODE_DEFERRED", element);
    assert.deepEqual(result.findings, [{ dimension: "video_display_matrix", code: "display_d4_non_identity", disposition: "deferred_reencode" }], element);
  }
});

test("B2A1-P06 a matrix that reads 0 degrees but mirrors (e01s M05, M09) is not DIRECT; the explicit identity matrix is", () => {
  assert.ok(has(withVideo({ displayMatrix: matrix(MATRICES.mirror_vertical) }), "display_d4_non_identity"));
  assert.notEqual(evaluate(withVideo({ displayMatrix: matrix(MATRICES.mirror_vertical) })).outcome, "CONFORMS");
  for (const name of ["translate", "scale2x1", "scale2x2", "shear", "perspective", "wNotUnit"] as const) {
    assert.equal(evaluate(withVideo({ displayMatrix: matrix(MATRICES[name]) })).outcome, "REFUSE", `${name} also reads 0 degrees`);
  }
  assert.equal(evaluate(withVideo({ displayMatrix: matrix(MATRICES.identity) })).outcome, "CONFORMS");
});

test("B2A1-P07 a container clean aperture / Frame Cropping is never DIRECT", () => {
  const crop = { state: "present", top: 5, bottom: 5, left: 10, right: 10 };
  // e04 CR01: ffprobe declares 320x180 while every decoded frame is 300x170.
  const result = evaluate(withVideo({ frameCropping: crop, geometry: { declared: { width: 320, height: 180 }, decoded: [{ width: 300, height: 170 }] } }));
  assert.equal(result.outcome, "REFUSE");
  assert.ok(result.findings.some(f => f.code === "frame_cropping_present" && f.dimension === "video_frame_cropping" && f.disposition === "refuse"));
  assert.ok(has(withVideo({ frameCropping: { state: "present", top: 0, bottom: 0, left: 0, right: 0 } }), "frame_cropping_present"), "presence alone refuses");
});

test("B2A1-P08 an unreadable display matrix is never DIRECT", () => {
  const result = evaluate(withVideo({ displayMatrix: { state: "unparsed" } }));
  assert.equal(result.outcome, "REFUSE");
  assert.deepEqual(result.findings, [{ dimension: "video_display_matrix", code: "display_matrix_unknown", disposition: "refuse" }]);
  assert.ok(has(withVideo({ sideData: [{ carrier: "frame", kind: "display_matrix", seiUuid: null }] }), "display_matrix_unsupported"), "a per-frame matrix");
});

test("B2A1-P09 an HDR transfer refuses (PQ, HLG), with or without BT.2020 tags", () => {
  for (const transfer of ["smpte2084", "arib-std-b67"]) {
    for (const color of [{ range: "tv", primaries: "bt709", transfer, matrix: "bt709" }, { range: "tv", primaries: "bt2020", transfer, matrix: "bt2020nc" }]) {
      const result = evaluate(withVideo({ color }));
      assert.equal(result.outcome, "REFUSE", canonicalSerialize(color));
      assert.ok(result.findings.some(f => f.code === "color_hdr" && f.dimension === "color_description"), canonicalSerialize(color));
    }
  }
});

test("B2A1-P10 10-bit or any non-8-bit decode refuses", () => {
  for (const [pixelFormat, bitDepth] of [["yuv420p10le", 10], ["yuv420p12le", 12], ["yuv420p", 10], ["yuv420p10be", 10]] as const) {
    const result = evaluate(withVideo({ pixelFormat, bitDepth }));
    assert.equal(result.outcome, "REFUSE", pixelFormat);
    assert.ok(result.findings.some(f => f.code === "bit_depth_unsupported" && f.dimension === "video_pixel_format"), pixelFormat);
  }
  for (const pixelFormat of ["yuv422p", "yuv444p"]) assert.ok(has(withVideo({ pixelFormat }), "chroma_subsampling_unsupported"), pixelFormat);
  assert.ok(has(withVideo({ pixelFormat: "nv12" }), "pixel_format_unsupported"));
});

test("B2A1-P11 full range does not conform, and an unspecified range is not assumed limited (B2R established no range assumption)", () => {
  for (const value of [withVideo({ color: { range: "pc", primaries: "bt709", transfer: "bt709", matrix: "bt709" } }),
    withVideo({ pixelFormat: "yuvj420p", color: { range: "pc", primaries: null, transfer: null, matrix: null } })]) {
    const result = evaluate(value);
    assert.equal(result.outcome, "REFUSE");
    assert.ok(result.findings.some(f => f.code === "color_range_full" && f.dimension === "color_range"));
  }
  const unspecified = evaluate(withVideo({ color: { range: null, primaries: "bt709", transfer: "bt709", matrix: "bt709" } }));
  assert.equal(unspecified.outcome, "REFUSE");
  assert.deepEqual(unspecified.findings, [{ dimension: "color_range", code: "color_range_unspecified", disposition: "refuse" }]);
  const semantics = ingest.CANONICAL_MEDIA_PROFILE_V1_SEMANTICS as unknown as { color: { ranges: unknown; assumptions: Json } };
  assert.deepEqual(semantics.color.ranges, ["tv"]);
  assert.equal(semantics.color.assumptions.unspecifiedRange, "none_not_established_by_b2r_explicit_tv_required");
});

test("B2A1-P12 unsupported primaries, transfer or matrix do not conform; unspecified ones are BT.709 under the explicit profile assumption", () => {
  for (const color of [{ range: "tv", primaries: "smpte170m", transfer: "smpte170m", matrix: "smpte170m" }, { range: "tv", primaries: "bt709", transfer: "bt709", matrix: "smpte170m" },
    { range: "tv", primaries: "bt470bg", transfer: "bt709", matrix: "bt709" }, { range: "tv", primaries: "bt2020", transfer: "bt709", matrix: "bt709" },
    { range: "tv", primaries: "bt709", transfer: "iec61966-2-1", matrix: "bt709" }, { range: "tv", primaries: "bt709", transfer: "log316", matrix: "bt709" },
    { range: "tv", primaries: "bt709", transfer: "bt709", matrix: "bt2020nc" }]) {
    const result = evaluate(withVideo({ color }));
    assert.equal(result.outcome, "REFUSE", canonicalSerialize(color));
    assert.ok(result.findings.some(f => f.code === "color_unsupported" && f.dimension === "color_description"), canonicalSerialize(color));
  }
  for (const color of [{ range: "tv", primaries: null, transfer: null, matrix: null }, { range: "tv", primaries: "bt709", transfer: null, matrix: "bt709" }]) {
    const result = evaluate(withVideo({ color }));
    assert.equal(result.outcome, "CONFORMS", canonicalSerialize(color));
    assert.deepEqual(result.findings, [{ dimension: "color_description", code: "color_unspecified_assumed_bt709", disposition: "allowed" }], "the assumption is recorded");
  }
  const semantics = ingest.CANONICAL_MEDIA_PROFILE_V1_SEMANTICS as unknown as { color: { assumptions: Json } };
  assert.equal(semantics.color.assumptions.unspecifiedPrimariesTransferMatrix, "interpreted_as_bt709_v1");
});

test("B2A1-P13 only the B2R-established x264 encoder-information SEI is informational, and it can conform", () => {
  const result = evaluate(withVideo({ sideData: [sei(X264_UUID)] }));
  assert.equal(result.outcome, "CONFORMS");
  assert.deepEqual(result.findings, [{ dimension: "side_data", code: "informational_sei_allowed", disposition: "allowed" }]);
  assert.equal(ingest.X264_ENCODER_INFO_SEI_UUID, X264_UUID);
  assert.equal(ingest.X265_ENCODER_INFO_SEI_UUID, X265_UUID);
  const semantics = ingest.CANONICAL_MEDIA_PROFILE_V1_SEMANTICS as unknown as { sideData: { informational: unknown[] } };
  assert.deepEqual(semantics.sideData.informational, [{ codec: "h264", carrier: "frame", kind: "user_data_unregistered_sei", seiUuid: X264_UUID },
    { codec: "hevc", carrier: "frame", kind: "user_data_unregistered_sei", seiUuid: X265_UUID }]);
});

test("B2A1-P14 unknown side data never conforms, whatever FFmpeg does with it", () => {
  for (const entry of [sideData("unknown"), sideData("unknown", "stream"), sei(X265_UUID), sei("0".repeat(32)), sei(X264_UUID, "stream")]) {
    const result = evaluate(withVideo({ sideData: [entry] }));
    assert.equal(result.outcome, "REFUSE", canonicalSerialize(entry));
    assert.deepEqual(result.findings, [{ dimension: "side_data", code: "unknown_side_data", disposition: "refuse" }], canonicalSerialize(entry));
  }
  for (const [kind, code] of [["mastering_display_metadata", "hdr_side_data_present"], ["content_light_level", "hdr_side_data_present"],
    ["hdr_dynamic_metadata", "hdr_side_data_present"], ["dolby_vision", "hdr_side_data_present"], ["icc_profile", "icc_profile_present"],
    ["spherical_mapping", "spatial_side_data_unsupported"], ["stereo_3d", "spatial_side_data_unsupported"]] as const) {
    assert.deepEqual(codes(withVideo({ sideData: [sideData(kind)] })), [code], kind);
  }
});

test("B2A1-P15 the profile identity binds every semantic rule and the version", () => {
  const semantics = ingest.CANONICAL_MEDIA_PROFILE_V1_SEMANTICS as unknown;
  const id = ingest.canonicalMediaProfileIdOf(semantics);
  assert.equal(id, ingest.CANONICAL_MEDIA_PROFILE_V1.profileId);
  assert.equal(ingest.canonicalMediaProfileIdOf(clone(semantics)), id, "deterministic");
  const leaves: string[][] = [];
  const walk = (value: unknown, path: string[]): void => {
    if (value !== null && typeof value === "object") for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
    else leaves.push(path);
  };
  walk(semantics, []);
  assert.ok(leaves.length >= 40, `every rule is a leaf (${leaves.length})`);
  for (const path of leaves) {
    const changed = clone(semantics) as Record<string, unknown>;
    let at: Record<string, unknown> = changed;
    for (const key of path.slice(0, -1)) at = at[key] as Record<string, unknown>;
    const last = path.at(-1)!, old = at[last];
    at[last] = typeof old === "number" ? old + 1 : typeof old === "boolean" ? !old : old === null ? "changed" : `${String(old)}_changed`;
    assert.notEqual(ingest.canonicalMediaProfileIdOf(changed), id, path.join("."));
  }
  const text = canonicalSerialize(semantics);
  assert.doesNotMatch(text, /[\\/]|\d{4}-\d{2}-\d{2}T/, "no path or instant in the profile");
  // The profile's bounds are exactly the accepted B1 bounds, and its frozen assumption label is the accepted one.
  const timing = (semantics as { timing: { frameRate: Json; maxFrames: number; maxDurationSeconds: number }; video: { geometry: { maxDimension: number } } });
  assert.deepEqual([timing.timing.frameRate.maxFramesPerSecond, timing.timing.frameRate.maxNumerator, timing.timing.frameRate.maxDenominator, timing.timing.maxFrames,
    timing.timing.maxDurationSeconds, timing.video.geometry.maxDimension], [ingest.N1_BOUNDS.maxFramesPerSecond, ingest.N1_BOUNDS.maxRateNumerator,
    ingest.N1_BOUNDS.maxRateDenominator, ingest.N1_BOUNDS.maxFrames, ingest.N1_BOUNDS.maxDurationSeconds, ingest.N1_BOUNDS.maxDimension]);
});

test("B2A1-P16 known future candidates are deferred, never malformed; HEVC 10-bit or HDR stays refused (Part 9)", () => {
  // e04 SD04 / e08: HEVC Main 8-bit 4:2:0, limited range, colour otherwise unset, with its x265 encoder SEI.
  const hevc = withVideo({ codec: "hevc", color: { range: "tv", primaries: null, transfer: null, matrix: null }, sideData: [sei(X265_UUID)] });
  for (const [label, value, code] of [["hevc 8-bit sdr", hevc, "codec_hevc_8bit_sdr_candidate"], ["d4 rotation", withVideo({ displayMatrix: matrix(MATRICES.rotate_90_cw) }),
    "display_d4_non_identity"], ["non-square sar", withVideo({ sampleAspectRatio: { container: { state: "declared", numerator: 4, denominator: 3 }, bitstream: SAR_UNSPECIFIED } }),
    "sar_non_square"], ["true vfr", withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: gap500() }), "true_vfr"]] as const) {
    const result = evaluate(value);
    assert.equal(result.outcome, "CANONICALIZABLE_REENCODE_DEFERRED", label);
    assert.ok(result.findings.some(f => f.code === code && f.disposition.startsWith("deferred_")), label);
    assert.equal(result.findings.some(f => f.disposition === "refuse"), false, `${label} is not malformed`);
  }
  for (const patch of [{ pixelFormat: "yuv420p10le", bitDepth: 10 }, { color: { range: "tv", primaries: "bt2020", transfer: "smpte2084", matrix: "bt2020nc" } },
    { fieldOrder: "tt" }, { color: { range: "pc", primaries: null, transfer: null, matrix: null } }]) {
    const result = evaluate(withVideo({ codec: "hevc", sideData: [sei(X265_UUID)], ...patch }));
    assert.equal(result.outcome, "REFUSE", canonicalSerialize(patch));
    assert.ok(result.findings.some(f => f.code === "codec_unsupported"), canonicalSerialize(patch));
  }
});

test("B2A1-P17 every other finding is reachable and names exactly its dimension and disposition", () => {
  const conflict = { container: SAR_1_1, bitstream: { state: "declared", numerator: 4, denominator: 3 } }; // e02 C01: FFmpeg reports 1:1, legacy DIRECT
  const prime = 2_147_483_647, ntscPrime = Array.from({ length: 60 }, (_, i) => Math.round((i * prime * 1001) / 30_000));
  const f = (code: string, dimension: string, disposition: string) => ({ dimension, code, disposition });
  const cases: [string, unknown, Json[]][] = [
    ["container", facts([videoStream(), audioStream()], { container: "other" }), [f("container_unsupported", "stream_layout", "refuse")]],
    ["extra stream", facts([videoStream(), audioStream(), timecode(2)]), [f("extra_non_av_stream", "stream_layout", "exact_remux")]],
    ["other codec", withVideo({ codec: "other" }), [f("codec_unsupported", "video_codec", "refuse")]],
    ["too wide", withVideo({ geometry: { declared: { width: 16_385, height: 1080 }, decoded: [{ width: 16_385, height: 1080 }] } }),
      [f("geometry_out_of_bounds", "video_geometry", "refuse")]],
    ["SAR conflict", withVideo({ sampleAspectRatio: conflict }), [f("sar_declarations_conflict", "video_sample_aspect", "refuse")]],
    ["declared 60 for exact 30", withVideo({ declaredFrameRate: { numerator: 60, denominator: 1 } }), [f("frame_rate_declaration_mismatch", "timing_grid", "refuse")]],
    ["snap timescale overflow", withVideo({ timeBase: { numerator: 1, denominator: prime }, declaredFrameRate: { numerator: 30_000, denominator: 1001 }, presentationTimestamps: ntscPrime }),
      [f("near_cfr_snap_candidate", "timing_grid", "exact_remux"), f("snap_time_base_unrepresentable", "timing_grid", "refuse")]],
    ["72001 frames", withVideo({ presentationTimestamps: cfr(72_001, 512) }), [f("frame_count_out_of_bounds", "timing_bounds", "refuse")]],
    ["601 s", withVideo({ declaredFrameRate: { numerator: 1, denominator: 1 }, presentationTimestamps: cfr(601, 15_360) }), [f("duration_out_of_bounds", "timing_bounds", "refuse")]],
    ["0.5 fps", withVideo({ declaredFrameRate: { numerator: 1, denominator: 2 }, presentationTimestamps: cfr(10, 30_720) }), [f("frame_rate_out_of_bounds", "timing_bounds", "refuse")]],
    ["late common start", facts([videoStream({ presentationTimestamps: cfr(60, 512, 15_360) }), audioStream({ frames: audioFrames(94, 1024, 48_000) })]),
      [f("timeline_nonzero", "timing_start", "exact_remux")]],
    ["HE-AAC", facts([videoStream(), audioStream({ codec: "aac_other" })]), [f("audio_codec_unsupported", "audio_format", "refuse")]],
    ["22.05 kHz", facts([videoStream(), audioStream({ sampleRateHz: 22_050, timeBase: { numerator: 1, denominator: 22_050 } })]),
      [f("audio_sample_rate_unsupported", "audio_format", "refuse")]],
    ["5.1", facts([videoStream(), audioStream({ channels: 6, channelLayout: "other" })]), [f("audio_layout_unsupported", "audio_format", "refuse")]],
    ["mono label, two channels", facts([videoStream(), audioStream({ channels: 2, channelLayout: "mono" })]), [f("audio_layout_unsupported", "audio_format", "refuse")]],
    ["audio in 1/90000", facts([videoStream(), audioStream({ timeBase: { numerator: 1, denominator: 90_000 } })]), [f("audio_time_base_unsupported", "audio_format", "refuse")]],
    ["tiny audio step", facts([videoStream(), audioStream({ frames: audioFrames(94, 1024, 0, [{ at: 3, delta: -7 }]) })]),
      [f("audio_small_timestamp_discontinuity", "audio_timeline", "exact_remux")]]];
  for (const [label, value, expected] of cases) assert.deepEqual(evaluate(value).findings, expected, label);
  // Every code of the closed table is distinct and has one dimension and one disposition.
  assert.equal(new Set(ingest.PROFILE_FINDING_CODES).size, ingest.PROFILE_FINDING_CODES.length);
});

// ================================================================ FACTS
test("B2A1-F01 the full-matrix classification distinguishes the identity and all seven non-identity D4 elements", () => {
  assert.deepEqual(ingest.classifyDisplayMatrix({ state: "absent" }), { kind: "absent" });
  assert.deepEqual(ingest.classifyDisplayMatrix(matrix(MATRICES.identity)), { kind: "identity" });
  const seen = new Set<string>();
  for (const element of D4_ELEMENTS) {
    const result = ingest.classifyDisplayMatrix(matrix(MATRICES[element])) as unknown as Json;
    assert.deepEqual(result, { kind: "d4", element }, element);
    seen.add(String(result.element));
  }
  assert.equal(seen.size, 7);
});

test("B2A1-F02 a vertical flip can never collapse to the 0-degree identity", () => {
  assert.deepEqual(ingest.classifyDisplayMatrix(matrix(MATRICES.mirror_vertical)), { kind: "d4", element: "mirror_vertical" });
  assert.notEqual(ingest.CanonicalMediaFactsSchema.safeParse(withVideo({ displayMatrix: { state: "present", rotation: 0 } })).success, true, "no rotation-number form");
});

test("B2A1-F03 rot180 + hflip is a vertical flip, and rot180 and hflip are distinct although ffprobe reads -180 for both", () => {
  assert.deepEqual(ingest.classifyDisplayMatrix(matrix(MATRICES.rotate_180)), { kind: "d4", element: "rotate_180" });
  assert.deepEqual(ingest.classifyDisplayMatrix(matrix(MATRICES.mirror_horizontal)), { kind: "d4", element: "mirror_horizontal" });
  assert.deepEqual(ingest.classifyDisplayMatrix(matrix(MATRICES.transpose)), { kind: "d4", element: "transpose" });
  assert.deepEqual(ingest.classifyDisplayMatrix(matrix(MATRICES.transverse)), { kind: "d4", element: "transverse" });
});

test("B2A1-F04 translation, scale, shear, perspective, non-unit w and non-right-angle rotation classify non-D4", () => {
  for (const [name, features] of [["translate", ["translation"]], ["scale2x1", ["scale"]], ["scale2x2", ["scale"]], ["shear", ["shear"]], ["perspective", ["perspective"]],
    ["wNotUnit", ["non_unit_w"]], ["rotate45", ["rotation"]], ["rotate90Translate", ["translation"]]] as const) {
    assert.deepEqual(ingest.classifyDisplayMatrix(matrix(MATRICES[name])), { kind: "unsupported", features: [...features] }, name);
    assert.deepEqual(codes(withVideo({ displayMatrix: matrix(MATRICES[name]) })), ["display_matrix_unsupported"], name);
  }
  assert.deepEqual(ingest.classifyDisplayMatrix(matrix([0, 0, 0, 0, 0, 0, 0, 0, 1 << 30])), { kind: "unsupported", features: ["singular"] });
  assert.deepEqual(ingest.classifyDisplayMatrix({ state: "unparsed" }), { kind: "unknown" });
});

test("B2A1-F05 exact CFR is recognized independently of a harmless time-base representation (e03 A, B1-B6)", () => {
  for (const [den, step, rate] of [[15_360, 512, [30, 1]], [30_000, 1000, [30, 1]], [600, 20, [30, 1]], [90_000, 3000, [30, 1]], [30_000, 1001, [30_000, 1001]],
    [90_000, 3003, [30_000, 1001]], [1_200_000, 20_000, [60, 1]], [90_000, 1500, [60, 1]], [90_000, 6000, [15, 1]]] as const) {
    const value = withVideo({ timeBase: { numerator: 1, denominator: den }, declaredFrameRate: { numerator: rate[0], denominator: rate[1] }, presentationTimestamps: cfr(60, step) });
    assert.equal(evaluate(value).outcome, "CONFORMS", `${step}/${den}`);
  }
  // e03 B4: 30000/1001 in a 1/600 track is quantized, not exact: a snap candidate, never DIRECT.
  const b4 = withVideo({ timeBase: { numerator: 1, denominator: 600 }, declaredFrameRate: { numerator: 30_000, denominator: 1001 }, presentationTimestamps: ntscIn600(60) });
  assert.deepEqual(codes(b4), ["near_cfr_snap_candidate"]);
});

test("B2A1-F06 near-CFR (e03 C1 2 ms, C2 7 ms) is recognized separately from true VFR (e03 C3 12 ms)", () => {
  const at = (amplitude: number) => withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: jittered(60, 3000, amplitude) });
  for (const amplitude of [180, 630]) assert.deepEqual(codes(at(amplitude)), ["near_cfr_snap_candidate"], `${amplitude}`);
  const worst = Math.max(...jittered(60, 3000, 1080).map((t, i) => Math.abs(t - 3000 * i)));
  assert.ok(4 * worst > 3000, "the 12 ms shape exceeds a quarter period");
  assert.deepEqual(codes(at(1080)), ["true_vfr"]);
});

test("B2A1-F07 true VFR (e03 D1, E1, E2) never becomes a snap candidate", () => {
  for (const pts of [piecewise30to24to15(), sixtyThenTen(), gap500()]) {
    const result = evaluate(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: pts }));
    assert.equal(result.outcome, "CANONICALIZABLE_REENCODE_DEFERRED");
    assert.deepEqual(result.findings, [{ dimension: "timing_grid", code: "true_vfr", disposition: "deferred_temporal_reencode" }]);
  }
});

test("B2A1-F08 a held first frame (e07r assets 02/06 shape) is refused as ambiguous, never snapped", () => {
  const result = evaluate(withVideo({ timeBase: { numerator: 1, denominator: 1_200_000 }, declaredFrameRate: { numerator: 60, denominator: 1 },
    presentationTimestamps: heldFirstFrame() }));
  assert.equal(result.outcome, "REFUSE");
  assert.deepEqual(result.findings, [{ dimension: "timing_grid", code: "held_first_frame_ambiguous", disposition: "refuse" }]);
});

test("B2A1-F09 B-frame decode reordering does not make exact-CFR presentation timestamps VFR (e03 H1, H2, owner asset_07)", () => {
  assert.equal(evaluate(withVideo({ decodeReordering: true })).outcome, "CONFORMS");
  // Timestamps handed over in decode order are malformed evidence, never silently sorted.
  const decodeOrder = cfr(60, 512);
  [decodeOrder[1], decodeOrder[3]] = [decodeOrder[3]!, decodeOrder[1]!];
  assert.deepEqual(codes(withVideo({ decodeReordering: true, presentationTimestamps: decodeOrder })), ["timing_malformed"]);
});

test("B2A1-F10 malformed, duplicate and below-minimum-interval timing refuses", () => {
  const duplicate = cfr(60, 512); duplicate[10] = duplicate[9]!;
  const decreasing = cfr(60, 512); decreasing[10] = decreasing[9]! - 1;
  for (const pts of [duplicate, decreasing]) assert.deepEqual(codes(withVideo({ presentationTimestamps: pts })), ["timing_malformed"]);
  assert.deepEqual(codes(withVideo({ timeBase: { numerator: 1, denominator: 90_000 }, presentationTimestamps: oneTickPairs() })), ["timing_interval_below_minimum"]);
  assert.deepEqual(codes(withVideo({ presentationTimestamps: [] })), ["video_frames_absent"]);
  for (const bad of [{ presentationTimestamps: [0.5, 1] }, { timeBase: { numerator: 2, denominator: 15_360 } }, { timeBase: { numerator: 1, denominator: 0 } },
    { declaredFrameRate: { numerator: 0, denominator: 1 } }, { presentationTimestamps: "0,512" }]) {
    const result = evaluate(withVideo(bad));
    assert.equal(result.outcome, "REFUSE", canonicalSerialize(bad));
    assert.deepEqual(result.findings, [{ dimension: "evidence", code: "facts_invalid", disposition: "refuse" }]);
    assert.equal(result.factsDigest, null);
  }
  // The audio timeline is held to the same discipline.
  assert.ok(has(facts([videoStream(), audioStream({ frames: audioFrames(10).map((f, k) => (k === 5 ? { ...f, pts: 0 } : f)) })]), "audio_timing_malformed"));
  assert.ok(has(facts([videoStream(), audioStream({ frames: [] })]), "audio_frames_absent"));
});
