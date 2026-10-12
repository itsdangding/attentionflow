import { defaults, VERSION, type Settings } from "../shared/config";
import type {
  Batch,
  Exposure,
  Read,
  Candidate,
  Request,
} from "../shared/types";
import {
  rows,
  currentTopic,
  visiblePostNumbers,
  loadTopicTotal,
  notificationTopic,
  detect,
  pageIdentity,
  isPrivateMessage,
  type Row,
} from "../adapters/linuxdo/parser";
import { newExposure, accumulate } from "../core/exposure";
import { appendSegment } from "../core/time";
import { classify, stages } from "../core/model";
import { sendMessage } from "../shared/runtime";
export default defineContentScript({
  matches: ["https://linux.do/*"],
  main(ctx) {
    let config: Settings = structuredClone(defaults),
      pageVisitId = crypto.randomUUID(),
      sessionId: string | null = null,
      lastActivity = Date.now(),
      lastFrame = Date.now(),
      lastY = scrollY,
      lastScroll = 0,
      velocity = 0,
      hovered: Element | null = null,
      read: Read | null = null,
      lastFlush = Date.now(),
      busy = false,
      generation = 0,
      referrer = document.referrer,
      trackedUrl = location.href,
      lastPulse = 0,
      authorized = false;
    let tracked: Row[] = [],
      pending: Batch = {
        topics: [],
        exposures: [],
        clicks: [],
        reads: [],
        debugTraces: [],
      };
    const sampledAt = new Map<Element, number>();
    const exposures = new Map<Element, Exposure>(),
      visibility = new Map<Element, number>(),
      zones = new Map<Element, number>();
    const full = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          sample(e.target, Date.now());
          visibility.set(e.target, e.intersectionRatio);
          if (e.intersectionRatio > 0 && active() && sessionId && authorized) {
            const row = tracked.find((r) => r.element === e.target);
            if (row && !exposures.has(e.target)) {
              const record = newExposure(
                row.topic,
                row.source,
                row.position,
                sessionId,
                pageVisitId,
                Date.now(),
                velocity,
              );
              record.maxVisibilityRatio = e.intersectionRatio;
              exposures.set(e.target, record);
              sampledAt.set(e.target, Date.now());
            }
          } else if (e.intersectionRatio === 0) finish(e.target, Date.now());
        }
      },
      { threshold: [0, 0.01, 0.25, 0.5, 0.6, 0.75, 1] },
    );
    const zoneCallback = (entries: IntersectionObserverEntry[]) => {
      for (const e of entries) {
        sample(e.target, Date.now());
        zones.set(e.target, e.intersectionRatio);
      }
    };
    // IntersectionObserver percentage margins resolve against width; pixels preserve the vertical 20–80% zone.
    const makeZone = () =>
      new IntersectionObserver(zoneCallback, {
        rootMargin: `-${innerHeight * 0.2}px 0px -${innerHeight * 0.2}px 0px`,
        threshold: [0, 0.01, 0.25, 0.5, 0.6, 0.75, 1],
      });
    let zone = makeZone();
    ctx.addEventListener(window, "resize", () => {
      pause();
      zone.disconnect();
      zone = makeZone();
      for (const row of tracked) zone.observe(row.element);
    });
    const active = () =>
      config.tracking &&
      detect(location.pathname).kind !== "excluded" &&
      !isPrivateMessage() &&
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      Date.now() - lastActivity < config.model.readIdleMs;
    // 扩展重新加载后，旧页面里的脚本不再发送消息，避免 Extension context invalidated。
    const send = (message: Request) =>
      ctx.isValid
        ? sendMessage(message)
        : Promise.reject(new Error("Extension context invalidated"));
    const post = (message: Request) => {
      send(message).catch(() => undefined);
    };
    const restart = (route = false) => {
      reset(route).catch(() => undefined);
    };
    async function flush() {
      if (!Object.values(pending).some((a) => a.length)) return;
      const batch = pending;
      pending = {
        topics: [],
        exposures: [],
        clicks: [],
        reads: [],
        debugTraces: [],
      };
      try {
        await send({ type: "batch", batch });
      } catch {
        for (const key of Object.keys(batch) as (keyof Batch)[])
          (pending[key] as unknown[]).unshift(...batch[key]);
      }
    }
    function checkpoint(at: number, close = false) {
      if (!read) return;
      read.lastCheckpointAt = at;
      if (close) read.closedAt = at;
      pending.reads.push(structuredClone(read));
      if (close) read = null;
    }
    function sample(element: Element, at: number) {
      const e = exposures.get(element);
      if (!e) return;
      const dt = Math.max(
        0,
        Math.min(2000, at - (sampledAt.get(element) ?? at)),
      );
      const count = tracked.filter(
        (r) => (zones.get(r.element) ?? 0) > 0,
      ).length;
      accumulate(
        e,
        dt,
        visibility.get(element) ?? 0,
        zones.get(element) ?? 0,
        count,
        velocity,
        hovered === element,
        config.model,
      );
      sampledAt.set(element, at);
    }
    function finish(element: Element, at: number) {
      sample(element, at);
      const e = exposures.get(element);
      if (e) {
        e.leftAt = at;
        pending.exposures.push(e);
        exposures.delete(element);
        sampledAt.delete(element);
      }
    }
    function pause(at = Date.now(), submit = true) {
      for (const el of exposures.keys()) finish(el, at);
      checkpoint(at);
      lastFrame = at;
      if (submit) void flush();
    }
    let panel: HTMLPreElement | null = null;
    function debug(at: number, candidates: Candidate[]) {
      if (
        !config.debug ||
        detect(location.pathname).kind === "excluded" ||
        isPrivateMessage()
      ) {
        panel?.remove();
        panel = null;
        return;
      }
      if (!panel) {
        panel = document.createElement("pre");
        panel.style.cssText =
          "position:fixed;right:12px;bottom:12px;z-index:2147483647;padding:14px;background:#112019;color:#9effbf;font:12px monospace;pointer-events:none;max-height:45vh;overflow:hidden;border-radius:8px";
        document.documentElement.append(panel);
      }
      panel.textContent = Array.from(exposures.values())
        .slice(0, 6)
        .map(
          (e) =>
            `Topic ${e.externalTopicId}  ${stages[classify([e], [], config.model)]}\nvisibility ${(e.maxVisibilityRatio * 100).toFixed(0)}% zone ${(e.maxAttentionZoneRatio * 100).toFixed(0)}%\nattention ${(e.attentionZoneMs / 1000).toFixed(2)}s shared ${(e.sharedAttentionMs / 1000).toFixed(2)}s\nco-visible ${e.avgCoVisibleCount.toFixed(1)} scroll ${velocity.toFixed(2)} vh/s`,
        )
        .join("\n\n");
      pending.debugTraces.push({
        id: crypto.randomUUID(),
        site: "linuxdo",
        collectorVersion: VERSION,
        timestamp: at,
        scrollY,
        viewportHeight: innerHeight,
        visibleTopics: candidates,
        pageVisible: document.visibilityState === "visible",
        hasFocus: document.hasFocus(),
      });
    }
    function discover() {
      const next = rows();
      const elements = new Set(next.map((r) => r.element));
      for (const el of visibility.keys())
        if (
          !elements.has(el) ||
          tracked.find((r) => r.element === el)?.topic.externalTopicId !==
            next.find((r) => r.element === el)?.topic.externalTopicId
        ) {
          finish(el, Date.now());
          full.unobserve(el);
          zone.unobserve(el);
          visibility.delete(el);
          zones.delete(el);
        }
      for (const row of next)
        if (!visibility.has(row.element)) {
          visibility.set(row.element, 0);
          zones.set(row.element, 0);
          full.observe(row.element);
          zone.observe(row.element);
          pending.topics.push(row.topic);
        }
      tracked = next;
    }
    let discoveryTimer: ReturnType<typeof setTimeout> | undefined;
    const mutation = new MutationObserver(() => {
      if (discoveryTimer) return;
      discoveryTimer = setTimeout(() => {
        discoveryTimer = undefined;
        discover();
      }, 150);
    });
    mutation.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    function candidates(): Candidate[] {
      return tracked
        .filter((r) => (visibility.get(r.element) ?? 0) > 0)
        .map((r) => ({
          externalTopicId: r.topic.externalTopicId,
          listPosition: r.position,
          visibilityRatio: visibility.get(r.element) ?? 0,
          attentionZoneRatio: zones.get(r.element) ?? 0,
        }));
    }
    async function beginRead(at: number, epoch: number) {
      const topic = currentTopic();
      if (!topic || !sessionId) return;
      void loadTopicTotal(topic.externalTopicId);
      const sid = sessionId;
      const pv = pageVisitId;
      const meta = await send({
        type: "visit",
        topicId: topic.externalTopicId,
        url: location.href,
        pageVisitId: pv,
        referrer,
      });
      if (epoch !== generation || !active() || sid !== sessionId || !meta)
        return;
      read = {
        id: crypto.randomUUID(),
        site: "linuxdo",
        collectorVersion: VERSION,
        externalTopicId: topic.externalTopicId,
        sessionId: sid,
        pageVisitId: pv,
        ...meta,
        openedAt: at,
        closedAt: null,
        lastCheckpointAt: at,
        activeReadMs: 0,
        maxPostNumberSeen: 0,
        highestPostNumber: topic.highestPostNumber,
        activeSegments: [],
      };
      pending.topics.push(topic);
      checkpoint(at);
      await flush();
    }
    async function tick() {
      if (busy) return;
      busy = true;
      try {
        const epoch = generation,
          at = Date.now(),
          isActive = active();
        if (at - lastPulse >= 1000 || (!sessionId && isActive)) {
          const response = await send({
            type: "pulse",
            at,
            active: isActive,
            lastActivity,
          });
          if (epoch !== generation) return;
          lastPulse = at;
          const next = response?.sessionId ?? null;
          authorized = Boolean(next);
          if (next && next !== sessionId) {
            pause(at);
            checkpoint(at, true);
            sessionId = next;
          }
        }
        const dt = Math.min(2000, Math.max(0, at - lastFrame));
        lastFrame = at;
        if (Date.now() - lastScroll > 160) velocity = 0;
        if (!active() || !sessionId || !authorized) {
          pause(at);
          debug(at, []);
          return;
        }
        for (const row of tracked) {
          const v = visibility.get(row.element) ?? 0,
            z = zones.get(row.element) ?? 0;
          if (v <= 0) {
            finish(row.element, at);
            continue;
          }
          let e = exposures.get(row.element);
          if (!e) {
            e = newExposure(
              row.topic,
              row.source,
              row.position,
              sessionId,
              pageVisitId,
              at,
              velocity,
            );
            e.maxVisibilityRatio = v;
            e.maxAttentionZoneRatio = z;
            exposures.set(row.element, e);
            sampledAt.set(row.element, at);
          } else sample(row.element, at);
        }
        if (!read) await beginRead(at, generation);
        else {
          appendSegment(read.activeSegments, at - dt, at);
          read.activeReadMs += dt;
          read.maxPostNumberSeen = Math.max(
            read.maxPostNumberSeen,
            ...visiblePostNumbers(),
          );
          const topic = currentTopic();
          if (topic) {
            if (!read.highestPostNumber)
              void loadTopicTotal(topic.externalTopicId, at);
            read.highestPostNumber = Math.max(
              read.highestPostNumber,
              topic.highestPostNumber,
            );
          }
        }
        debug(at, candidates());
        if (at - lastFlush >= 15000) {
          const topic = read && currentTopic();
          if (topic?.externalTopicId === read?.externalTopicId && topic)
            pending.topics.push(topic);
          checkpoint(at);
          await flush();
          lastFlush = at;
        }
      } catch (error) {
        console.warn(
          "[AttentionFlow] Collector checkpoint failed",
          error instanceof Error ? error.message : "unknown error",
        );
      } finally {
        busy = false;
      }
    }
    async function reset(route = false) {
      generation++;
      pause();
      checkpoint(Date.now(), true);
      await flush();
      if (route) {
        referrer = trackedUrl;
        trackedUrl = location.href;
        pageVisitId = crypto.randomUUID();
      }
      sessionId = null;
      authorized = false;
      lastPulse = 0;
      const epoch = generation;
      const nextConfig = await send({ type: "settings" });
      if (epoch !== generation) return;
      config = nextConfig;
      lastFrame = Date.now();
      discover();
      if (!config.debug) {
        panel?.remove();
        panel = null;
      }
    }
    ctx.addEventListener(window, "wxt:locationchange", () => {
      if (pageIdentity(trackedUrl) === pageIdentity(location.href)) {
        trackedUrl = location.href;
        return;
      }
      restart(true);
    });
    browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg.type === "drain") {
        generation++;
        pause(Date.now(), false);
        const batch = pending;
        pending = {
          topics: [],
          exposures: [],
          clicks: [],
          reads: [],
          debugTraces: [],
        };
        config = { ...config, tracking: false };
        authorized = false;
        sendResponse({ batch });
        return true;
      }
      if (msg.type === "settingsChanged") {
        generation++;
        config = msg.settings;
        lastFrame = Date.now();
        lastPulse = 0;
        if (!config.debug) {
          panel?.remove();
          panel = null;
        }
        discover();
        return;
      }
      if (msg.type === "reset") {
        pending = {
          topics: [],
          exposures: [],
          clicks: [],
          reads: [],
          debugTraces: [],
        };
        exposures.clear();
        read = null;
        restart();
      }
    });
    for (const event of [
      "pointermove",
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
    ] as const)
      ctx.addEventListener(
        window,
        event,
        () => {
          lastActivity = Date.now();
        },
        { passive: true },
      );
    ctx.addEventListener(
      window,
      "scroll",
      () => {
        const now = Date.now();
        velocity =
          Math.abs(scrollY - lastY) /
          Math.max(0.001, (now - (lastScroll || now - 100)) / 1000) /
          Math.max(1, innerHeight);
        lastY = scrollY;
        lastScroll = now;
        lastActivity = now;
      },
      { passive: true },
    );
    ctx.addEventListener(document, "pointerover", (event) => {
      hovered =
        tracked.find(
          (r) =>
            event.target instanceof Node && r.element.contains(event.target),
        )?.element ?? null;
    });
    ctx.addEventListener(document, "pointerout", (event) => {
      if (
        hovered &&
        (!(event.relatedTarget instanceof Node) ||
          !hovered.contains(event.relatedTarget))
      )
        hovered = null;
    });
    const click = (event: MouseEvent) => {
      if (event.type === "auxclick" && event.button !== 1) return;
      if (!config.tracking || !document.hasFocus() || document.hidden) return;
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (target) {
        const notificationId = notificationTopic(target);
        if (notificationId) {
          post({
            type: "notificationEntry",
            topicId: notificationId,
            openMode:
              event.ctrlKey ||
              event.metaKey ||
              event.button === 1 ||
              target.target === "_blank"
                ? "new_tab"
                : "same_tab",
          });
          return;
        }
      }
      if (!active() || !sessionId || !authorized) return;
      const row = tracked.find((r) => target && r.element.contains(target));
      if (!row || !target || !/\/t\//.test(target.pathname)) return;
      const id = crypto.randomUUID();
      const record = {
        id,
        site: "linuxdo",
        collectorVersion: VERSION,
        externalTopicId: row.topic.externalTopicId,
        sessionId,
        pageVisitId,
        clickedAt: Date.now(),
        listSource: row.source,
        listPosition: row.position,
        openMode:
          event.ctrlKey ||
          event.metaKey ||
          event.button === 1 ||
          target.target === "_blank"
            ? ("new_tab" as const)
            : ("same_tab" as const),
        candidates: candidates(),
        targetUrl: target.href,
      };
      pending.clicks.push(record);
      const e = exposures.get(row.element);
      if (e) {
        e.clicked = true;
        e.clickId = id;
        finish(row.element, Date.now());
      }
      void flush();
    };
    ctx.addEventListener(document, "click", click, { capture: true });
    ctx.addEventListener(document, "auxclick", click, { capture: true });
    for (const event of ["blur", "pagehide"] as const)
      ctx.addEventListener(window, event, () => {
        pause();
        checkpoint(Date.now(), event === "pagehide");
        post({
          type: "pulse",
          at: Date.now(),
          active: false,
          lastActivity,
        });
        void flush();
      });
    ctx.addEventListener(document, "visibilitychange", () => {
      if (document.hidden) {
        pause();
        post({
          type: "pulse",
          at: Date.now(),
          active: false,
          lastActivity,
        });
      } else {
        lastActivity = Date.now();
        lastFrame = Date.now();
      }
    });
    ctx.addEventListener(window, "focus", () => {
      lastActivity = Date.now();
      lastFrame = Date.now();
    });
    ctx.setInterval(() => {
      void tick();
    }, 100);
    ctx.onInvalidated(() => {
      mutation.disconnect();
      full.disconnect();
      zone.disconnect();
      panel?.remove();
    });
    restart();
  },
});
