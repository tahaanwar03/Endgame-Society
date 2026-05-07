"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const FRAME_COUNT = 68;
const PRELOAD_RADIUS = 6; // load a small window around the current frame for smooth scrub

function framePath(index: number) {
  return `/frames/frame_${String(index).padStart(4, "0")}.webp`;
}

export function HeroFrameSequence() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);
  const messagingRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cleanup = () => {};
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    const section = sectionRef.current;
    const intro = introRef.current;
    const messaging = messagingRef.current;
    const footer = footerRef.current;

    if (!canvas || !section || !intro || !messaging || !footer) {
      return cleanup;
    }

    const context = canvas.getContext("2d");

    if (!context) {
      return cleanup;
    }

    let active = true;
    const state = { frame: reducedMotion ? FRAME_COUNT - 1 : 0 };
    const images: Array<HTMLImageElement | null> = Array.from({ length: FRAME_COUNT }, () => null);
    const decodePromises: Array<Promise<void> | null> = Array.from({ length: FRAME_COUNT }, () => null);
    let lastFrameDrawn = -1;
    let drawQueued = false;
    let cssWidth = 0;
    let cssHeight = 0;

    const resize = () => {
      // High DPR canvas is expensive for scroll-scrubbed redraws; cap it.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      cssWidth = section.clientWidth;
      cssHeight = section.clientHeight;
      canvas.width = Math.max(1, Math.floor(cssWidth * ratio));
      canvas.height = Math.max(1, Math.floor(cssHeight * ratio));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      scheduleDraw();
    };

    const ensureFrameLoaded = (frameIndex: number) => {
      if (frameIndex < 0 || frameIndex >= FRAME_COUNT) {
        return;
      }
      if (images[frameIndex]) {
        return;
      }

      const image = new Image();
      // Hint to decode off the main thread where possible.
      (image as any).decoding = "async";
      image.src = framePath(frameIndex + 1);
      image.onload = () => scheduleDraw();
      images[frameIndex] = image;

      if (!decodePromises[frameIndex]) {
        const decode = image.decode ? image.decode().then(() => undefined).catch(() => undefined) : Promise.resolve();
        decodePromises[frameIndex] = decode;
      }
    };

    const maybePreloadAround = (frameIndex: number) => {
      ensureFrameLoaded(frameIndex);
      for (let i = 1; i <= PRELOAD_RADIUS; i++) {
        ensureFrameLoaded(frameIndex - i);
        ensureFrameLoaded(frameIndex + i);
      }
    };

    const draw = () => {
      const frameIndex = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(state.frame)));
      if (frameIndex === lastFrameDrawn && !reducedMotion) {
        return;
      }
      lastFrameDrawn = frameIndex;

      const image = images[frameIndex];

      if (!image?.complete) {
        // If we haven't loaded this frame yet, kick off a small preload window.
        maybePreloadAround(frameIndex);
        return;
      }

      const width = cssWidth;
      const height = cssHeight;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const x = (width - image.naturalWidth * scale) / 2;
      const y = (height - image.naturalHeight * scale) / 2;

      context.clearRect(0, 0, cssWidth, cssHeight);
      // Keep filter work minimal; blur in particular is expensive per-frame.
      // Brightness provides the "assembly glow" without blowing up scroll perf.
      const glow = 0.68 + (frameIndex / (FRAME_COUNT - 1)) * 0.18;
      context.filter = `brightness(${glow})`;
      context.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
      context.filter = "none";
    };

    const scheduleDraw = () => {
      if (drawQueued) {
        return;
      }
      drawQueued = true;
      requestAnimationFrame(() => {
        drawQueued = false;
        if (!active) {
          return;
        }
        draw();
      });
    };

    resize();
    window.addEventListener("resize", resize);

    if (reducedMotion) {
      // Ensure final frame is at least requested; we still show static content.
      ensureFrameLoaded(FRAME_COUNT - 1);
      intro.style.opacity = "1";
      intro.style.transform = "translateY(0)";
      messaging.style.opacity = "0";
      footer.style.opacity = "1";
      footer.style.transform = "translateY(0)";

      cleanup = () => {
        active = false;
        window.removeEventListener("resize", resize);
      };

      return cleanup;
    }

    // Load the first frame immediately for fast paint, and start a small preload window.
    ensureFrameLoaded(0);
    maybePreloadAround(0);

    // Give the browser a moment to paint the first frame before importing GSAP.
    const startGsap = async () => {
      if (!active) {
        return;
      }

      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      gsap.set(intro, { opacity: 1, y: 0 });
      gsap.set(messaging, { opacity: 0, y: 32 });
      gsap.set(footer, { opacity: 0, y: 28 });

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=220%",
          scrub: 0.35,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: () => {
            const frameIndex = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(state.frame)));
            // Keep a small decode window around the current frame.
            // Use idle callback when possible to reduce main-thread contention.
            if ("requestIdleCallback" in window) {
              (window as any).requestIdleCallback(() => maybePreloadAround(frameIndex), { timeout: 120 });
            } else {
              maybePreloadAround(frameIndex);
            }
          }
        }
      });

      timeline.to(
        state,
        {
          frame: FRAME_COUNT - 1,
          ease: "none",
          onUpdate: scheduleDraw,
          duration: 1
        },
        0
      );

      timeline
        .to(
          intro,
          {
            opacity: 0,
            y: -28,
            ease: "power2.out",
            duration: 0.16
          },
          0.14
        )
        .to(
          messaging,
          {
            opacity: 1,
            y: 0,
            ease: "power2.out",
            duration: 0.18
          },
          0.28
        )
        .to(
          messaging,
          {
            opacity: 0,
            y: -20,
            ease: "power2.out",
            duration: 0.16
          },
          0.62
        )
        .to(
          footer,
          {
            opacity: 1,
            y: 0,
            ease: "power2.out",
            duration: 0.18
          },
          0.78
        );

      cleanup = () => {
        active = false;
        timeline.scrollTrigger?.kill();
        timeline.kill();
        window.removeEventListener("resize", resize);
      };
    };

    // Start GSAP on the next tick to let the first frame paint.
    queueMicrotask(() => {
      if (!active) return;
      startGsap().catch(() => {
        // If GSAP fails to import, we still keep the static first frame.
      });
    });

    return () => cleanup();
  }, []);

  return (
    <section ref={sectionRef} className="relative h-screen min-h-[760px] w-full overflow-hidden bg-black">
      <picture>
        <source srcSet="/hero-poster.webp" type="image/webp" />
        <img
          src="/hero-poster.webp"
          alt=""
          className="absolute inset-0 z-0 h-full w-full object-cover object-center opacity-75"
        />
      </picture>
      <canvas ref={canvasRef} className="absolute inset-0 z-10 h-full w-full" aria-hidden="true" />
      <div className="absolute inset-0 z-20 bg-[radial-gradient(circle_at_top,rgba(164,121,72,0.16),transparent_30%),radial-gradient(circle_at_center,rgba(219,164,88,0.08),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.48)_0%,rgba(0,0,0,0.22)_42%,rgba(7,7,7,0.78)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(90deg,rgba(0,0,0,0.28)_0%,transparent_12%,rgba(188,147,95,0.08)_50%,transparent_88%,rgba(0,0,0,0.24)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-20 opacity-70 [background-image:linear-gradient(rgba(183,146,98,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(183,146,98,0.06)_1px,transparent_1px)] [background-position:center] [background-size:160px_160px]" />

      <div ref={introRef} className="absolute inset-x-0 top-0 z-30 mx-auto w-full max-w-[1440px] px-5 pb-20 pt-10 md:px-8 md:pt-14">
        <div className="max-w-[540px]">
          <p className="bg-gradient-to-b from-[#f1dfc6] via-[#d8c0a0] to-[#9b7448] bg-clip-text font-serif text-[2rem] uppercase tracking-[0.07em] text-transparent drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] md:text-[3.4rem]">
            The Endgame Society
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-px w-full max-w-[400px] bg-gradient-to-r from-[#b79262] via-[#7f603d] to-transparent" />
            <span className="hidden h-2 w-2 rotate-45 border border-[#9f7952] md:block" />
          </div>
          <p className="mt-5 max-w-[470px] bg-gradient-to-b from-[#efe3d4] via-[#d4ccbf] to-[#a9875c] bg-clip-text text-base leading-7 text-transparent md:text-lg">
            A platform built to capture every game, every result, and every decisive moment on the board.
            From opening to endgame, every match in one place.
          </p>
        </div>
      </div>

      <div ref={messagingRef} className="absolute inset-0 z-30 translate-y-8 opacity-0">
        <div className="mx-auto h-full w-full max-w-[1440px] px-5 py-24 md:px-8">
          <div className="relative hidden h-full md:block">
            <div className="absolute left-0 top-[16%]">
              <Callout align="left" text="Play." />
            </div>
            <div className="absolute right-0 top-[29%]">
              <Callout align="right" text="Think." />
            </div>
            <div className="absolute left-0 top-[53%]">
              <Callout align="left" text="Dominate." />
            </div>
            <div className="absolute left-1/2 top-[73%] -translate-x-1/2">
              <Callout align="center" text="The board is set!" />
            </div>
          </div>

          <div className="mt-auto grid gap-4 self-end pb-28 text-center md:hidden">
            <MobileWord>Play.</MobileWord>
            <MobileWord>Think.</MobileWord>
            <MobileWord>Dominate.</MobileWord>
            <MobileWord>The board is set!</MobileWord>
          </div>
        </div>
      </div>

      <div ref={footerRef} className="absolute inset-x-0 bottom-0 z-30 translate-y-7 opacity-0">
        <div className="mx-auto mb-5 flex w-full max-w-[1440px] justify-center px-5 md:mb-6 md:px-8">
          <Link
            href="/tournaments"
            aria-label="View tournaments"
            className="inline-flex min-h-12 items-center justify-center border border-[#b79262] bg-[#b79262] px-8 text-xs font-bold uppercase tracking-[0.22em] text-[#120d09] shadow-[0_12px_36px_rgba(0,0,0,0.35)] transition hover:bg-[#c7a170]"
          >
            View Tournaments
          </Link>
        </div>
        <div className="border-t border-[#6e5234] bg-[linear-gradient(180deg,rgba(8,8,8,0.72)_0%,rgba(8,8,8,0.9)_100%)] backdrop-blur-[4px]">
          <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-5 py-5 md:grid-cols-[1.3fr_auto] md:items-end md:px-8 md:py-6">
            <div>
              <p className="bg-gradient-to-b from-[#f1dfc6] via-[#d8c0a0] to-[#9b7448] bg-clip-text font-serif text-2xl uppercase tracking-[0.06em] text-transparent md:text-[2.15rem]">
                Experience evolves from structure.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Callout({ text, align }: { text: string; align: "left" | "right" | "center" }) {
  return (
    <div className={`flex items-center gap-5 ${align === "right" ? "justify-end" : "justify-center"}`}>
      {align === "right" ? <span className="h-px w-32 bg-gradient-to-r from-transparent to-[#8c6a44]" /> : null}
      <div className="rounded-sm bg-black/24 px-3 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-[2px]">
        <p className="bg-gradient-to-b from-[#f2e0c8] via-[#d2b08a] to-[#8f6940] bg-clip-text font-sans text-[2rem] font-semibold uppercase tracking-[0.06em] text-transparent drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] md:text-[3.15rem]">
          {text}
        </p>
      </div>
      {align === "left" ? <span className="h-px w-32 bg-gradient-to-r from-[#8c6a44] to-transparent" /> : null}
    </div>
  );
}

function MobileWord({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-sm bg-black/24 px-3 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-[2px]">
      <p className="bg-gradient-to-b from-[#f2e0c8] via-[#d2b08a] to-[#8f6940] bg-clip-text font-sans text-2xl font-semibold uppercase tracking-[0.08em] text-transparent drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
        {children}
      </p>
    </span>
  );
}
