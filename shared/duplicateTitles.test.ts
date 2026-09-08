import { describe, expect, it } from "vitest";
import { findDuplicateTitles } from "./duplicateTitles";

describe("findDuplicateTitles", () => {
  it("returns an empty set when every title is unique", () => {
    expect(findDuplicateTitles([{ title: "A" }, { title: "B" }])).toEqual(new Set());
  });

  it("returns titles that appear on more than one note", () => {
    expect(findDuplicateTitles([{ title: "A" }, { title: "B" }, { title: "A" }])).toEqual(new Set(["A"]));
  });

  it("returns multiple duplicate titles", () => {
    expect(
      findDuplicateTitles([{ title: "A" }, { title: "A" }, { title: "B" }, { title: "B" }, { title: "C" }])
    ).toEqual(new Set(["A", "B"]));
  });

  it("returns an empty set for an empty list", () => {
    expect(findDuplicateTitles([])).toEqual(new Set());
  });
});
