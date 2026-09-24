import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { embeddedTrackIds, mapSoundCloudTrack } from "./soundcloud";

describe("SoundCloud mapping", () => {
  it("keeps playlist track ids even when the playlist only sends ids", () => {
    assert.deepEqual(
      embeddedTrackIds({
        kind: "playlist",
        tracks: [{ id: 11, kind: "track" }, { id: "22" }, { kind: "track" }],
      }),
      [11, 22],
    );
  });

  it("builds a public link from the user and track slug", () => {
    const track = mapSoundCloudTrack({
      id: 5,
      title: "Latch",
      permalink: "latch",
      downloadable: false,
      download_url: "https://api.soundcloud.com/tracks/5/download",
      user: { username: "disclosure", permalink: "disclosure", full_name: "Disclosure" },
    });
    assert.equal(track?.url, "https://soundcloud.com/disclosure/latch");
    assert.equal(track?.downloadable, true);
    assert.equal(track?.artist, "Disclosure");
  });

  it("keeps the publisher artist and release title", () => {
    const track = mapSoundCloudTrack({
      id: 9,
      title: "PREMIERE: Adam Beyer - Your Mind",
      user: { username: "drumcode", full_name: "Drumcode" },
      publisher_metadata: { artist: "Adam Beyer", release_title: "Your Mind" },
    });
    assert.equal(track?.publisherArtist, "Adam Beyer");
    assert.equal(track?.releaseTitle, "Your Mind");
  });
});
