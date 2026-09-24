import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assembleHeard, coverageOf, mergeHeardWithWritten, shiftTracks } from "./listen";
import type { PreparedTrack } from "./sources";

function track(artist: string, title: string, startSeconds: number, endSeconds?: number): PreparedTrack {
  return { artist, title, startSeconds, endSeconds: endSeconds ?? null };
}

describe("heard tracklists", () => {
  it("fills a gap the recognizer missed and keeps the heard span", () => {
    const heard = [track("Disclosure", "Latch", 0, 60)];
    const written = [track("Disclosure", "Latch", 0), track("Kerri Chandler", "Atmosphere", 90)];
    const merged = mergeHeardWithWritten(heard, written);
    assert.deepEqual(
      merged.map((item) => [item.artist, item.startSeconds]),
      [
        ["Disclosure", 0],
        ["Kerri Chandler", 90],
      ],
    );
  });

  it("reports coverage from identified spans", () => {
    const coverage = coverageOf([track("Disclosure", "Latch", 0, 30), track("Overmono", "So U Kno", 40, 60)], 100);
    assert.equal(coverage, 0.5);
  });

  it("does not double-count overlapping spans", () => {
    const coverage = coverageOf([track("DJ Beatbox", "Gare Good", 0, 15), track("DJ Beatbox", "Ritmo", 12, 15)], 19);
    assert.equal(coverage, 15 / 19);
  });

  it("offsets a later slice onto the set timeline", () => {
    const shifted = shiftTracks([track("Riva Starr", "Take Up the Space", 10, 40)], 180);
    assert.deepEqual(
      shifted.map((item) => [item.startSeconds, item.endSeconds]),
      [[190, 220]],
    );
  });

  it("keeps the first slice when the next one hits the AudD quota", () => {
    const heard = assembleHeard([
      { tracks: [track("Disclosure", "Latch", 0, 60)] },
      { tracks: [], quota: true },
    ]);
    assert.equal(heard.partial, true);
    assert.deepEqual(
      heard.tracks.map((item) => item.title),
      ["Latch"],
    );
  });
});
