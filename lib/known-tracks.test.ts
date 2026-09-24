import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { knownTracks } from "./match";
import type { PreparedTrack } from "./sources";

function track(artist: string, title: string): PreparedTrack {
  return { artist, title, startSeconds: null };
}

describe("knownTracks", () => {
  it("drops placeholder rows and keeps a real recording", () => {
    const tracks = knownTracks([
      track("ID", "ID"),
      track("HUGEL", "ID"),
      track("Etta James", "I Just Want To Make Love To You"),
      track("Unknown", "Untitled"),
    ]);
    assert.deepEqual(
      tracks.map((item) => `${item.artist} - ${item.title}`),
      ["Etta James - I Just Want To Make Love To You"],
    );
  });
});
