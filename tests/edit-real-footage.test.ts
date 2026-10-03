// Gate 7 Batch 3D: 3D-R01, the permanent regression of the first meaningful Batch-3D RED (see
// docs/phases/phase-5-gate-7-batch-3d-real-footage-e2e.md). It uses only schema calls that exist both before and after the owner-authorized
// lifecycle extension, and reads the extension's exports through the module namespace. The same file is therefore RED on the pre-3D
// accepted bytes and GREEN after the repair. Pure: no media, process or network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MediaAssetSchema } from "../packages/contracts/common.js";
import * as render from "../packages/edit-render/index.js";
import { TrustedLifecycleObservation } from "../scripts/edit-render-fixture-authority-local.js";

const SYNTHETIC_AUTHORITY = "synthetic_fixture_registry_only_not_production_v0", OWNER_AUTHORITY = "owner_local_media_manifest_registry_not_production_v0";
type Parsable = { safeParse(value: unknown): { success: boolean } };

test("3D-R01 the trusted execution boundary can carry lifecycle evidence for an owner-authorized real source; the synthetic authority keeps its meaning", () => {
  const realOrigins = MediaAssetSchema.shape.origin.options.filter(origin => origin !== "synthetic");
  assert.deepEqual(realOrigins, ["creator_upload"], "the public MediaAsset contract names exactly one real-media origin");
  // No caller can mint lifecycle evidence for the permit: only the synthetic-fixture authority's own query constructs its handle.
  assert.throws(() => new TrustedLifecycleObservation(Symbol("batch3d"), {} as never, "batch3d", () => undefined),
    (error: unknown) => error instanceof render.EditRenderError && error.code === "trust_handle_required");
  const binding = render.ExecutablePermitBindingSchema.shape.lifecycleAuthority as Parsable;
  assert.equal(binding.safeParse(SYNTHETIC_AUTHORITY).success, true, "the synthetic-fixture binding literal is unchanged");
  assert.equal(binding.safeParse(OWNER_AUTHORITY).success, true,
    `an executable permit binding must be able to name a lifecycle authority for ${realOrigins.join(", ")} media`);
  assert.equal(binding.safeParse("owner_local_media_manifest_registry_v0").success, false, "the binding names authorities exactly");
  // FixtureLifecycleObservation keeps its exact meaning: synthetic fixture assets only, from the unchanged fixture registry.
  const fixtureScope = render.FixtureLifecycleObservationSchema.shape.authorityScope as Parsable;
  assert.equal(fixtureScope.safeParse("synthetic_fixture_assets_only_v0").success, true);
  assert.equal(fixtureScope.safeParse("owner_declared_real_media_assets_only_v0").success, false, "the fixture record is never widened to real media");
  assert.equal(render.FIXTURE_AUTHORITY.descriptor.eligibility, "synthetic_origin_and_synthetic_generated_authorization_only");
  // Real-media lifecycle evidence is a separate, explicitly identified record from a separate authority.
  const exported = render as unknown as Record<string, unknown>;
  const ownerRecord = exported["OwnerMediaLifecycleObservationSchema"] as { shape?: { authorityScope?: Parsable } } | undefined;
  assert.equal(ownerRecord?.shape?.authorityScope?.safeParse("owner_declared_real_media_assets_only_v0").success, true,
    `permit lifecycle evidence must be able to cover ${realOrigins.join(", ")} media`);
  const ownerAuthority = exported["OWNER_MEDIA_AUTHORITY"] as { descriptor?: { eligibility?: string } } | undefined;
  assert.equal(ownerAuthority?.descriptor?.eligibility, "creator_upload_origin_and_owner_supplied_authorization_only");
});
