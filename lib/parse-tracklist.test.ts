import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTracklist } from "./parse-tracklist";

const MIXCLOUD = `Power up your Friday with latest mix: D House Party ep. 005. Enjoy and TURN IT UP!

1. Mr. Belt & Wezol, RSCL - Opened Up My Soul
2. Dj Kone & Marc Palacios - E Samba
3. Nautik (US) - Free
4. Killed Kassette - Burned Again
5. Peverell & Sweet Female Attitude - Hardly Breathe (Windy City Classics Remix)
6. Mele - And 1
7. Daniel Dash - I Don't Depend
8. Mike Newman, Djsakisp - Quema Quema
9. Gene Farris & Basura Boyz - In My Heart
10. Marcello V.O.R. - What to Do
11. Wake (UK) - Static
12. Buogo - Rave It
13. Piem & Leo Wood - Messin' Around
14. LF SYSTEM - Lift You Up

Find out more about https://undergroundkollektiv.co.uk/djs/DADAS.
Download the UDGK App From Your App Store http://onelink.to/zhu9mz`;

describe("parseTracklist", () => {
  it("reads a numbered description and skips the chatter", () => {
    const tracks = parseTracklist(MIXCLOUD);
    assert.equal(tracks.length, 14);
    assert.equal(tracks[0].artist, "Mr. Belt & Wezol, RSCL");
    assert.equal(tracks[0].title, "Opened Up My Soul");
    assert.equal(tracks[4].title, "Hardly Breathe (Windy City Classics Remix)");
    assert.equal(tracks[13].artist, "LF SYSTEM");
  });

  it("reads timestamps, indexes, and colons", () => {
    const tracks = parseTracklist(`00:00 Kerri Chandler - Atmosphere
1:02:03 Palms Trax - Equation
[12:40] DJ Koze - Pick Up
3. Jayda G: Both Of Us`);
    assert.deepEqual(
      tracks.map((track) => [track.startSeconds, track.artist, track.title]),
      [
        [0, "Kerri Chandler", "Atmosphere"],
        [3723, "Palms Trax", "Equation"],
        [760, "DJ Koze", "Pick Up"],
        [null, "Jayda G", "Both Of Us"],
      ],
    );
  });

  it("reads a numbered time and a pipe before the artist", () => {
    const tracks = parseTracklist(`01. 0:00 | Etta James - I Just Want To Make Love To You
02.02:30 | HUGEL & Preston Harris & Dawty - Loosen Up`);
    assert.deepEqual(
      tracks.map((track) => [track.startSeconds, track.artist, track.title]),
      [
        [0, "Etta James", "I Just Want To Make Love To You"],
        [150, "HUGEL & Preston Harris & Dawty", "Loosen Up"],
      ],
    );
  });
});
