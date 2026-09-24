import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tracksFromAudd } from "./audd";

describe("tracksFromAudd", () => {
  it("places enterprise chunks using the file offset plus the match offset", () => {
    const tracks = tracksFromAudd({
      status: "success",
      result: [
        {
          offset: "01:00",
          songs: [
            { artist: "Disclosure", title: "Latch", start_offset: 1500 },
            { artist: "Disclosure", title: "Latch", start_offset: 8000 },
          ],
        },
        {
          offset: "01:12",
          songs: [{ artist: "Overmono", title: "So U Kno", start_offset: 0 }],
        },
      ],
    });
    assert.deepEqual(
      tracks.map((track) => [track.startSeconds, track.endSeconds, track.artist, track.title]),
      [
        [61.5, 68, "Disclosure", "Latch"],
        [72, null, "Overmono", "So U Kno"],
      ],
    );
  });

  it("keeps a label and splits the same song when it returns later", () => {
    const tracks = tracksFromAudd({
      status: "success",
      result: [
        {
          offset: "00:00",
          songs: [
            {
              artist: "Riva Starr",
              title: "Take Up the Space",
              label: "Heist Recordings",
              start_offset: 0,
              end_offset: 12000,
            },
          ],
        },
        {
          offset: "00:12",
          songs: [{ artist: "Riva Starr", title: "Take Up the Space", start_offset: 0, end_offset: 8000 }],
        },
        {
          offset: "10:00",
          songs: [{ artist: "Riva Starr", title: "Take Up the Space", start_offset: 0, end_offset: 4000 }],
        },
      ],
    });
    assert.equal(tracks.length, 2);
    assert.equal(tracks[0].endSeconds, 20);
    assert.equal(tracks[0].label, "Heist Recordings");
    assert.equal(tracks[1].startSeconds, 600);
  });

  it("keeps one song when a chunk lists several guesses for the same moment", () => {
    const tracks = tracksFromAudd({
      status: "success",
      result: [
        {
          offset: "00:00",
          songs: [
            { artist: "Riva Starr", title: "Take Up the Space", label: "Heist Recordings", start_offset: 0, end_offset: 8000 },
            { artist: "Someone Else", title: "Other Song", start_offset: 40, end_offset: 7000 },
          ],
        },
      ],
    });
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].title, "Take Up the Space");
    assert.equal(tracks[0].label, "Heist Recordings");
  });

  it("reads a single standard-endpoint match", () => {
    const tracks = tracksFromAudd({
      status: "success",
      result: { artist: "Kerri Chandler", title: "Atmosphere" },
    });
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].startSeconds, null);
  });
});
