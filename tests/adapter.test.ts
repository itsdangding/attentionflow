// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { rows, currentTopic, topicId, pageIdentity } from "../adapters/linuxdo/parser";
describe("DOM adapter", () => {
  it("retains the topic ID in slugless floor URLs", () => {
    expect(topicId("https://linux.do/t/43/70")).toBe(43);
    expect(pageIdentity("https://linux.do/t/43/70")).toBe(pageIdentity("https://linux.do/t/43"));
  });
  it("discovers desktop/mobile rows and search results", () => {
    document.body.innerHTML =
      '<div class="topic-list-item"><a class="title" href="https://linux.do/t/test/42">Test</a><span class="category-name">开发</span><span class="discourse-tag">JS</span></div><div class="search-result"><a class="search-link" href="https://linux.do/t/43">Search</a></div>';
    const found = rows("/search");
    expect(found.map((r) => r.topic.externalTopicId)).toEqual([42, 43]);
    expect(found[0]!.topic.tags).toEqual(["JS"]);
    expect(found[0]!.topic.category).toBe("开发");
    expect(rows("/u/test")).toEqual([]);
  });
  it("topic page exposes only suggested lists", () => {
    document.body.innerHTML =
      '<div class="topic-list-item"><a class="title" href="https://linux.do/t/1">Outside</a></div><div class="suggested-topics"><div class="topic-list-item"><a class="title" href="https://linux.do/t/2">Suggested</a></div></div>';
    expect(rows("/t/9").map((r) => r.topic.externalTopicId)).toEqual([2]);
    expect(rows("/t/9")[0]!.source).toBe("suggested");
  });
});
