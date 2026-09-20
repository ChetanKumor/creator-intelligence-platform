import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DetectorConfigSchema,
} from "../packages/reference-analyzer/protocol.js";

import {
  DEFAULT_FOOTAGE_CONFIG,
  FootageConfigSchema,
  FootageDetectorConfigSchema,
} from "../packages/footage-analyzer/protocol.js";

import {
  TRANSNETV2_ADAPTER_VERSION,
  TRANSNETV2_SOURCE_COMMIT,
  TRANSNETV2_SOURCE_SHA256,
  TRANSNETV2_WEIGHT_SET_SHA256,
} from "../packages/footage-analyzer/transnetv2-protocol.js";


test(
  "footage adds TransNetV2 without changing the reference detector contract",
  () => {
    const transnet = {
      kind: "transnetv2" as const,
      threshold: 0.5,
    };

    assert.equal(
      FootageDetectorConfigSchema.safeParse(
        transnet,
      ).success,
      true,
    );

    assert.equal(
      FootageConfigSchema.safeParse({
        ...DEFAULT_FOOTAGE_CONFIG,
        detector: transnet,
      }).success,
      true,
    );

    assert.equal(
      DetectorConfigSchema.safeParse(
        transnet,
      ).success,
      false,
    );
  },
);


test(
  "PySceneDetect remains the footage default until the real-footage gate",
  () => {
    assert.deepEqual(
      DEFAULT_FOOTAGE_CONFIG.detector,
      {
        kind: "content",
        threshold: 27,
        minSceneFrames: 2,
        adaptiveThreshold: 3,
      },
    );
  },
);


test(
  "TransNetV2 cache provenance is frozen to the verified local provider",
  () => {
    assert.equal(
      TRANSNETV2_ADAPTER_VERSION,
      "transnetv2-detector-adapter-0.1.0",
    );

    assert.equal(
      TRANSNETV2_SOURCE_COMMIT,
      "85cef72af9a916bdfd7cc94a670c9cdfbf12d1ed",
    );

    assert.equal(
      TRANSNETV2_SOURCE_SHA256,
      "f55b3a75727d1502438707ac15e8f6257a736817e713e2113e4b84176500ca65",
    );

    assert.equal(
      TRANSNETV2_WEIGHT_SET_SHA256,
      "00b40cfe38c3fd6fd6d278860d339eb347254e1559839688d870ad0389bf6d0a",
    );
  },
);
