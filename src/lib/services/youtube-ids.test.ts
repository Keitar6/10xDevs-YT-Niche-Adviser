import { describe, expect, it } from "vitest";
import { parseChannelRef } from "./youtube-ids";

describe("parseChannelRef", () => {
  it("accepts the shapes a user actually pastes", () => {
    expect(parseChannelRef("UCBJycsmduvYEL83R_U4JriQ")).toEqual({ kind: "id", id: "UCBJycsmduvYEL83R_U4JriQ" });
    expect(parseChannelRef("@mkbhd")).toEqual({ kind: "handle", handle: "mkbhd" });
    expect(parseChannelRef("mkbhd")).toEqual({ kind: "handle", handle: "mkbhd" });
    expect(parseChannelRef("https://www.youtube.com/@mkbhd")).toEqual({ kind: "handle", handle: "mkbhd" });
    expect(parseChannelRef("youtube.com/@mkbhd/videos")).toEqual({ kind: "handle", handle: "mkbhd" });
    expect(parseChannelRef("https://www.youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ/shorts")).toEqual({
      kind: "id",
      id: "UCBJycsmduvYEL83R_U4JriQ",
    });
    expect(parseChannelRef("https://www.youtube.com/c/Kurzgesagt")).toEqual({ kind: "handle", handle: "Kurzgesagt" });
    expect(parseChannelRef("https://youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ")).toEqual({
      kind: "id",
      id: "UCBJycsmduvYEL83R_U4JriQ",
    });
    expect(parseChannelRef("  @mkbhd  ")).toEqual({ kind: "handle", handle: "mkbhd" });
  });

  it("rejects what cannot be a channel reference", () => {
    expect(parseChannelRef("")).toBeNull();
    expect(parseChannelRef("ab")).toBeNull();
    expect(parseChannelRef("has spaces")).toBeNull();
    expect(parseChannelRef("@")).toBeNull();
  });
});
