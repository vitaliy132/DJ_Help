import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { storeZip } from "./zip";

describe("storeZip", () => {
  it("stores a file without compression", () => {
    const zip = storeZip([{ name: "Etta James - Love.mp3", data: new Uint8Array([1, 2, 3, 4]) }]);
    assert.equal(String.fromCharCode(zip[0], zip[1]), "PK");
    const text = new TextDecoder().decode(zip);
    assert.match(text, /Etta James - Love\.mp3/);
    assert.ok(text.includes(String.fromCharCode(1, 2, 3, 4)));
  });
});
