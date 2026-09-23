import { describe, expect, it } from "vitest";
import { downmixToMono, type DecodedAudio } from "./audioDecode";

function makeBuffer(channels: number[][]): DecodedAudio {
  return {
    numberOfChannels: channels.length,
    length: channels[0].length,
    getChannelData: (channel: number) => Float32Array.from(channels[channel]),
  };
}

describe("downmixToMono", () => {
  it("returns the single channel unchanged for mono input", () => {
    const buffer = makeBuffer([[0.1, 0.2, 0.3]]);
    expect(downmixToMono(buffer)).toEqual(Float32Array.from([0.1, 0.2, 0.3]));
  });

  it("averages two channels sample-by-sample", () => {
    const buffer = makeBuffer([
      [1, 0, -1],
      [0, 1, 1],
    ]);
    const result = downmixToMono(buffer);
    expect(result[0]).toBeCloseTo(0.5);
    expect(result[1]).toBeCloseTo(0.5);
    expect(result[2]).toBeCloseTo(0);
  });

  it("averages more than two channels", () => {
    const buffer = makeBuffer([
      [3, 0],
      [0, 3],
      [0, 0],
    ]);
    const result = downmixToMono(buffer);
    expect(result[0]).toBeCloseTo(1);
    expect(result[1]).toBeCloseTo(1);
  });

  it("returns an array of the correct length", () => {
    const buffer = makeBuffer([
      [1, 2, 3, 4],
      [1, 2, 3, 4],
    ]);
    expect(downmixToMono(buffer)).toHaveLength(4);
  });
});
