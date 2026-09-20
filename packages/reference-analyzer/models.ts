import type { EmbeddingConfig } from "./protocol.js";

// Metadata inspected on 2026-09-13. Loading is local_files_only; these are not download instructions.
export const SIGLIP_MODELS = {
  base: { model: "google/siglip2-base-patch16-naflex", revision: "b53b807d3a2d5e2b3911292f2d69e5341cdc064c", weightBytes: 1500985224 },
  so400m: { model: "google/siglip2-so400m-patch16-naflex", revision: "cc24074f717b612951c2dead130904ab9b65a81e", weightBytes: 4542792928 },
} as const;
export function siglipConfiguration(model: keyof typeof SIGLIP_MODELS = "base", device: "cpu" | "cuda" = "cpu", cpuFallback = false): EmbeddingConfig {
  const selected = SIGLIP_MODELS[model];
  return { mode: "siglip", model: selected.model, revision: selected.revision, device, cpuFallback, maxPatches: 256 };
}
