import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreMatch } from "./score";

describe("scoreMatch", () => {
  it("ranks the same recording above a remix and a different song", () => {
    const original = scoreMatch("Disclosure", "Latch", { artist: "Disclosure", title: "Latch", durationSec: 257 });
    const remix = scoreMatch("Disclosure", "Latch", {
      artist: "Disclosure",
      title: "Latch (Jax Jones Remix)",
      durationSec: 240,
    });
    const other = scoreMatch("Disclosure", "Latch", { artist: "Someone Else", title: "Other Song", durationSec: 180 });
    assert.ok(original > 0.8);
    assert.ok(original > remix);
    assert.ok(remix > other);
    assert.ok(other < 0.4);
  });

  it("still matches when the upload title contains the artist", () => {
    const score = scoreMatch("LF SYSTEM", "Lift You Up", {
      artist: "LF SYSTEM",
      title: "LF SYSTEM - Lift You Up",
      durationSec: 200,
    });
    assert.ok(score > 0.75);
  });
});
