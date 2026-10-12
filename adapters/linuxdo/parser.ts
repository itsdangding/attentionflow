import type { Source, Topic } from "../../shared/types";
export function topicId(url: string): number | null {
  try {
    const match = new URL(url, "https://linux.do").pathname.match(
      /^\/t\/(?:(\d+)|[^/]+\/(\d+))(?:\/|$)/,
    );
    return match ? Number(match[1] ?? match[2]) : null;
  } catch {
    return null;
  }
}
export function pageIdentity(url: string): string {
  const topic = topicId(url);
  if (topic) return `topic:${topic}`;
  const parsed = new URL(url, "https://linux.do");
  return `${parsed.pathname}${parsed.search}`;
}
export function isPrivateMessage(): boolean {
  return Boolean(
    document.querySelector(".private-message, .archetype-private_message"),
  );
}
export function detect(path: string): {
  kind: "list" | "topic" | "excluded";
  source: Source;
} {
  if (/^\/t\//.test(path)) return { kind: "topic", source: "suggested" };
  const match = path.match(
    /^\/(latest|new|unread|top|hot|c|tag|search)(?:\/|$)/,
  );
  if (path === "/" || match)
    return {
      kind: "list",
      source:
        match?.[1] === "c"
          ? "category"
          : match?.[1] === "tag"
            ? "tag"
            : ((match?.[1] ?? "latest") as Source),
    };
  return { kind: "excluded", source: "latest" };
}
// Discourse 3.2 起分类徽章使用 .badge-category__name，旧版为 .category-name。
const CATEGORY = ".badge-category__name, .category-name";
function text(root: ParentNode | null, selector: string) {
  return root?.querySelector(selector)?.textContent?.trim() ?? "";
}
export interface Row {
  element: Element;
  topic: Topic;
  position: number;
  source: Source;
}
export function rows(path = location.pathname): Row[] {
  const page = detect(path);
  if (
    page.kind === "excluded" ||
    (page.kind === "topic" && isPrivateMessage())
  )
    return [];
  const selector =
    page.kind === "topic"
      ? ".suggested-topics .topic-list-item, .related-topics .topic-list-item, #suggested-topics .topic-list-item"
      : ".topic-list-item, .search-result, .fps-result";
  return Array.from(document.querySelectorAll(selector)).flatMap(
    (element, position) => {
      const link = element.querySelector<HTMLAnchorElement>(
        "a.title, a.raw-topic-link, a.search-link, .search-result-topic a",
      );
      const id = link && topicId(link.href);
      if (!id || !link) return [];
      const now = Date.now();
      return [
        {
          element,
          position,
          source: page.source,
          topic: {
            site: "linuxdo",
            externalTopicId: id,
            title: link.textContent?.trim() ?? "",
            category: text(element, CATEGORY),
            tags: Array.from(element.querySelectorAll(".discourse-tag")).map(
              (t) => t.textContent?.trim() ?? "",
            ),
            author:
              element
                .querySelector("[data-user-card]")
                ?.getAttribute("data-user-card") ?? "",
            highestPostNumber: 0,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        },
      ];
    },
  );
}
export function currentTopic(): Topic | null {
  const id = topicId(location.href);
  if (
    !id ||
    isPrivateMessage()
  )
    return null;
  const timeline = document
    .querySelector(
      ".timeline-replies, .timeline-handle .timeline-text, #topic-progress .nums",
    )
    ?.textContent?.match(/\d[\d,]*/g);
  const total = totals.get(id) ?? 0;
  const now = Date.now();
  return {
    site: "linuxdo",
    externalTopicId: id,
    title:
      document.querySelector("#topic-title h1")?.textContent?.trim() ??
      document.title,
    category: text(document.querySelector("#topic-title"), CATEGORY),
    tags: Array.from(
      document.querySelectorAll("#topic-title .discourse-tag"),
    ).map((e) => e.textContent?.trim() ?? ""),
    author: "",
    highestPostNumber: Math.max(
      total,
      ...(timeline?.length === 2 ? timeline : []).map((n) =>
        Number(n.replaceAll(",", "")),
      ),
    ),
    firstSeenAt: now,
    lastSeenAt: now,
  };
}
export function visiblePostNumbers(): number[] {
  return Array.from(document.querySelectorAll("[data-post-number]"))
    .filter((e) => {
      const r = e.getBoundingClientRect();
      return (
        r.bottom > 0 &&
        r.top < innerHeight &&
        r.right > 0 &&
        r.left < innerWidth
      );
    })
    .map((e) => Number(e.getAttribute("data-post-number")));
}

const totals = new Map<number, number>();
const attempts = new Map<number, number>();
export const TOTAL_RETRY_MS = 15000;
export async function loadTopicTotal(id: number, now = Date.now()) {
  if (totals.has(id) || now - (attempts.get(id) ?? -Infinity) < TOTAL_RETRY_MS)
    return;
  attempts.set(id, now);
  try {
    const response = await fetch(`/t/${id}.json`, {
      credentials: "same-origin",
    });
    if (!response.ok) {
      console.debug("[AttentionFlow] Topic total unavailable", response.status);
      return;
    }
    const data = await response.json();
    if (
      Number.isInteger(data.highest_post_number) &&
      data.highest_post_number > 0
    )
      totals.set(id, data.highest_post_number);
  } catch {
    /* DOM-only fallback keeps duration-based Deep Read available. */
  }
}

export function notificationTopic(link: HTMLAnchorElement): number | null {
  if (
    link.hostname !== "linux.do" ||
    !link.closest(
      ".notification, .notifications-dropdown, .notifications-menu, .quick-access-panel",
    )
  )
    return null;
  return topicId(link.href);
}
