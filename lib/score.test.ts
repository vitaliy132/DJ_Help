import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scoreMatch, searchQueries, stripReleaseTags } from "./score";

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

  it("matches a label upload that prefixes the title with PREMIERE", () => {
    const score = scoreMatch("Adam Beyer", "Your Mind", {
      artist: "Drumcode",
      title: "PREMIERE: Adam Beyer - Your Mind",
    });
    assert.equal(score >= 0.78, true);
  });

  it("matches bracketed premiere tags and free-download tags", () => {
    const bracket = scoreMatch("Adam Beyer", "Your Mind", {
      artist: "Drumcode",
      title: "[PREMIERE] Adam Beyer - Your Mind",
    });
    const free = scoreMatch("Adam Beyer", "Your Mind", {
      artist: "Adam Beyer",
      title: "Your Mind (Free Download)",
    });
    assert.equal(bracket >= 0.78, true);
    assert.equal(free >= 0.78, true);
  });

  it("does not treat a shared promo tag as the same song", () => {
    const score = scoreMatch("Adam Beyer", "Your Mind", {
      artist: "Someone Else",
      title: "PREMIERE: Other Song",
    });
    assert.equal(score < 0.4, true);
  });

  it("drops a leading premiere tag from the search text", () => {
    assert.equal(stripReleaseTags("PREMIERE: Adam Beyer - Your Mind"), "Adam Beyer - Your Mind");
    assert.equal(searchQueries("PREMIERE: Adam Beyer", "Your Mind").primary, "Adam Beyer Your Mind");
    assert.equal(searchQueries("Adam Beyer", "FREE DL: Your Mind").titleOnly, "Your Mind");
  });
});
