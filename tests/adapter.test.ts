// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import {
  rows,
  currentTopic,
  topicId,
  pageIdentity,
  loadTopicTotal,
  TOTAL_RETRY_MS,
} from "../adapters/linuxdo/parser";
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
  it("reads categories from the Discourse 3.2 badge markup", () => {
    document.body.innerHTML =
      '<div class="topic-list-item"><a class="title" href="https://linux.do/t/x/50">X</a><span class="badge-category__wrapper"><span class="badge-category"><span class="badge-category__name">资源荟萃</span></span></span></div>';
    expect(rows("/latest")[0]!.topic.category).toBe("资源荟萃");
    history.replaceState(null, "", "/t/x/50");
    document.body.innerHTML =
      '<div id="topic-title"><h1>X</h1><span class="badge-category__name">资源荟萃</span></div><div class="timeline-replies">3 / 12</div>';
    expect(currentTopic()).toMatchObject({
      category: "资源荟萃",
      highestPostNumber: 12,
    });
  });
  it("retries a failed topic total after the backoff window", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ highest_post_number: 33 }),
      });
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "debug").mockImplementation(() => {});
    history.replaceState(null, "", "/t/y/77");
    document.body.innerHTML = '<div id="topic-title"><h1>Y</h1></div>';
    await loadTopicTotal(77, 1000);
    await loadTopicTotal(77, 1000 + TOTAL_RETRY_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(currentTopic()?.highestPostNumber).toBe(0);
    await loadTopicTotal(77, 1000 + TOTAL_RETRY_MS);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(currentTopic()?.highestPostNumber).toBe(33);
    await loadTopicTotal(77, 1000 + TOTAL_RETRY_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
