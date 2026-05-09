"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const FRAME_COUNT = 68;

// How many frames to preload ahead AND behind the current position.
// 15 covers even aggressive momentum flicks on mobile.
const PRELOAD_RADIUS = 15;

// How many frames must be fully decoded before we consider the pipeline "warm".
// We decode eagerly; this just controls the initial burst.
const INITIAL_DECODE_BURST = 20;

function framePath(index: number) {
  return `/frames/frame_${String(index).padStart(4, "0")}.webp`;
}

export function HeroFrameSequence() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const posterRef = useRef<HTMLImageElement | null>(null);
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
    const poster = posterRef.current;

    if (!canvas || !section || !intro || !messaging || !footer) return cleanup;

    const context = canvas.getContext("2d");
    if (!context) return cleanup;

    let active = true;
    const state = { frame: reducedMotion ? FRAME_COUNT - 1 : 0 };

    // Separate tracking: loaded (src set, may still be decoding) vs decoded (ready to draw instantly)
    const images: Array<HTMLImageElement | null> = Array.from({ length: FRAME_COUNT }, () => null);
    const decoded: Array<boolean> = Array.from({ length: FRAME_COUNT }, () => false);
    const loading: Array<boolean> = Array.from({ length: FRAME_COUNT }, () => false);

    let lastFrameDrawn = -1;
    let drawQueued = false;
    let cssWidth = 0;
    let cssHeight = 0;

    // ─── Canvas Resize ─────────────────────────────────────────────────────────
    const resize = () => {
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

    // ─── Frame Loading & Decoding ──────────────────────────────────────────────
    const loadFrame = (frameIndex: number) => {
      if (frameIndex < 0 || frameIndex >= FRAME_COUNT) return;
      if (loading[frameIndex]) return;

      loading[frameIndex] = true;
      const image = new Image();
      // Hint: async decode off main thread
      (image as HTMLImageElement & { decoding: string }).decoding = "async";
      image.src = framePath(frameIndex + 1);
      images[frameIndex] = image;

      // Use decode() API for off-main-thread decode when available
      const decodeAndMark = () => {
        if (!active) return;
        if (image.decode) {
          image
            .decode()
            .then(() => {
              if (!active) return;
              decoded[frameIndex] = true;
              // Only trigger a draw if this is close to the current frame
              const current = Math.round(state.frame);
              if (Math.abs(frameIndex - current) <= 2) scheduleDraw();
            })
            .catch(() => {
              // decode() can fail on hidden tabs; fall back to complete check
              if (image.complete) {
                decoded[frameIndex] = true;
              }
            });
        } else {
          decoded[frameIndex] = true;
          scheduleDraw();
        }
      };

      if (image.complete) {
        decodeAndMark();
      } else {
        image.onload = decodeAndMark;
        image.onerror = () => {
          // Mark as decoded anyway so we don't retry endlessly
          decoded[frameIndex] = false;
          loading[frameIndex] = false; // allow retry
        };
      }
    };

    // Load a window of frames around a given position.
    // Direction: +1 = scrolling down (prefer ahead), -1 = up, 0 = both equally.
    const preloadAround = (frameIndex: number, direction = 0) => {
      loadFrame(frameIndex);

      if (direction >= 0) {
        // Prioritise ahead
        for (let i = 1; i <= PRELOAD_RADIUS; i++) {
          loadFrame(frameIndex + i);
        }
        for (let i = 1; i <= Math.floor(PRELOAD_RADIUS / 2); i++) {
          loadFrame(frameIndex - i);
        }
      } else {
        // Prioritise behind
        for (let i = 1; i <= PRELOAD_RADIUS; i++) {
          loadFrame(frameIndex - i);
        }
        for (let i = 1; i <= Math.floor(PRELOAD_RADIUS / 2); i++) {
          loadFrame(frameIndex + i);
        }
      }
    };

    // ─── Draw ─────────────────────────────────────────────────────────────────
    const draw = () => {
      const frameIndex = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(state.frame)));

      // Skip only if the frame is identical AND already drawn (not on reduced motion reset)
      if (frameIndex === lastFrameDrawn) return;

      const image = images[frameIndex];

      // Frame not decoded yet — show poster as fallback, don't blank canvas
      if (!image || !decoded[frameIndex]) {
        // Try the nearest decoded neighbour so we never show a blank
        for (let delta = 1; delta < PRELOAD_RADIUS; delta++) {
          const below = frameIndex - delta;
          const above = frameIndex + delta;
          if (below >= 0 && decoded[below] && images[below]) {
            drawImage(images[below]!);
            return;
          }
          if (above < FRAME_COUNT && decoded[above] && images[above]) {
            drawImage(images[above]!);
            return;
          }
        }
        // Nothing nearby decoded — show poster (it's opacity-0 by default, we reveal it)
        if (poster) poster.style.opacity = "1";
        return;
      }

      // We have the frame — hide poster (it may have been revealed as fallback)
      if (poster && poster.style.opacity !== "0") poster.style.opacity = "0";

      drawImage(image);
      lastFrameDrawn = frameIndex;
    };

    const drawImage = (image: HTMLImageElement) => {
      const width = cssWidth;
      const height = cssHeight;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const x = (width - image.naturalWidth * scale) / 2;
      const y = (height - image.naturalHeight * scale) / 2;

      context.clearRect(0, 0, cssWidth, cssHeight);
      // NO per-frame canvas filter — moved to a CSS overlay instead.
      // This eliminates the compositing pass that tanks mobile GPU perf.
      context.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
    };

    const scheduleDraw = () => {
      if (drawQueued) return;
      drawQueued = true;
      requestAnimationFrame(() => {
        drawQueued = false;
        if (!active) return;
        draw();
      });
    };

    // ─── Resize & Init ────────────────────────────────────────────────────────
    resize();
    window.addEventListener("resize", resize);

    // ─── Reduced Motion Path ──────────────────────────────────────────────────
    if (reducedMotion) {
      loadFrame(FRAME_COUNT - 1);
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

    // ─── Eager Decode Burst ───────────────────────────────────────────────────
    // Immediately kick off the first INITIAL_DECODE_BURST frames so by the
    // time the user starts scrolling, we already have a full head-start.
    for (let i = 0; i < Math.min(INITIAL_DECODE_BURST, FRAME_COUNT); i++) {
      loadFrame(i);
    }
    // Also pre-warm the end (footer state) so fast scrollers don't stall
    for (let i = FRAME_COUNT - 1; i >= FRAME_COUNT - 5; i--) {
      loadFrame(i);
    }

    // ─── GSAP ScrollTrigger ───────────────────────────────────────────────────
    const startGsap = async () => {
      if (!active) return;

      const gsap = (await import("gsap")).default;
      const { ScrollTrigger } = await import("gsap/ScrollTrigger");
      gsap.registerPlugin(ScrollTrigger);

      gsap.set(intro, { opacity: 1, y: 0 });
      gsap.set(messaging, { opacity: 0, y: 32 });
      gsap.set(footer, { opacity: 0, y: 28 });

      let lastScrollProgress = 0;

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "+=220%",
          // Lower scrub = more 1:1 with scroll, less rubber-band lag.
          // Let the decode pipeline carry smoothness, not scrub dampening.
          scrub: 0.1,
          pin: true,
          // anticipatePin causes a single-frame flash on iOS Safari — disable it.
          anticipatePin: 0,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const direction = self.progress > lastScrollProgress ? 1 : -1;
            lastScrollProgress = self.progress;

            const frameIndex = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(state.frame)));

            // Synchronous preload — do NOT defer to idle/setTimeout during scroll.
            // On mobile the browser is always "busy" during scroll so idle callbacks
            // may never fire, defeating the entire preload strategy.
            preloadAround(frameIndex, direction);
          },
        },
      });

      timeline.to(
        state,
        {
          frame: FRAME_COUNT - 1,
          ease: "none",
          onUpdate: scheduleDraw,
          duration: 1,
        },
        0
      );

      timeline
        .to(intro, { opacity: 0, y: -28, ease: "power2.out", duration: 0.16 }, 0.14)
        .to(messaging, { opacity: 1, y: 0, ease: "power2.out", duration: 0.18 }, 0.28)
        .to(messaging, { opacity: 0, y: -20, ease: "power2.out", duration: 0.16 }, 0.62)
        .to(footer, { opacity: 1, y: 0, ease: "power2.out", duration: 0.18 }, 0.78);

      cleanup = () => {
        active = false;
        timeline.scrollTrigger?.kill();
        timeline.kill();
        window.removeEventListener("resize", resize);
      };
    };

    // Give the browser one full animation frame to paint frame 0 before GSAP
    // injects its scroll listeners (avoids flash on initial load).
    requestAnimationFrame(() => {
      if (!active) return;
      startGsap().catch(() => {
        // GSAP failed — static first frame is already visible, acceptable fallback.
      });
    });

    return () => cleanup();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative h-screen min-h-[760px] w-full overflow-hidden bg-black"
    >
      {/*
        Poster image: opacity-0 by default.
        Only revealed by JS when the canvas has no decoded frame to show.
        Kept in DOM for LCP / SEO / accessibility — hidden visually until needed.
        The previous opacity-75 caused it to bleed through the canvas constantly.
      */}
      <picture>
        <source srcSet="/hero-poster.webp" type="image/webp" />
        <img
          ref={posterRef}
          src="/hero-poster.webp"
          alt=""
          className="absolute inset-0 z-0 h-full w-full object-cover object-center"
          style={{ opacity: 0, transition: "opacity 0.15s ease" }}
        />
      </picture>

      {/* Canvas: draws the frame sequence */}
      <canvas ref={canvasRef} className="absolute inset-0 z-10 h-full w-full" aria-hidden="true" />

      {/*
        Static CSS glow overlay — replaces the per-frame canvas brightness() filter.
        canvas filter triggers a full GPU compositing pass every single draw call.
        A CSS overlay achieves the same visual at zero per-frame cost.
        Uses a subtle animated gradient to simulate the "assembly glow" progression.
      */}
      <div
        className="pointer-events-none absolute inset-0 z-15"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 55%, rgba(219,164,88,0.07) 0%, transparent 70%)",
          mixBlendMode: "screen",
        }}
        aria-hidden="true"
      />

      {/* Colour grading overlays — unchanged from original */}
      <div className="absolute inset-0 z-20 bg-[radial-gradient(circle_at_top,rgba(164,121,72,0.16),transparent_30%),radial-gradient(circle_at_center,rgba(219,164,88,0.08),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.48)_0%,rgba(0,0,0,0.22)_42%,rgba(7,7,7,0.78)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(90deg,rgba(0,0,0,0.28)_0%,transparent_12%,rgba(188,147,95,0.08)_50%,transparent_88%,rgba(0,0,0,0.24)_100%)]" />
      <div className="pointer-events-none absolute inset-0 z-20 opacity-70 [background-image:linear-gradient(rgba(183,146,98,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(183,146,98,0.06)_1px,transparent_1px)] [background-position:center] [background-size:160px_160px]" />

      {/* Intro text */}
      <div
        ref={introRef}
        className="absolute inset-x-0 top-0 z-30 mx-auto w-full max-w-[1440px] px-5 pb-20 pt-10 md:px-8 md:pt-14"
      >
        <div className="max-w-[540px]">
          <p className="bg-gradient-to-b from-[#f1dfc6] via-[#d8c0a0] to-[#9b7448] bg-clip-text font-serif text-[2rem] uppercase tracking-[0.07em] text-transparent drop-shadow-[0_2px_10px_rgba(0,0,0,0.45)] md:text-[3.4rem]">
            The Endgame Society
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-px w-full max-w-[400px] bg-gradient-to-r from-[#b79262] via-[#7f603d] to-transparent" />
            <span className="hidden h-2 w-2 rotate-45 border border-[#9f7952] md:block" />
          </div>
          <p className="mt-5 max-w-[470px] bg-gradient-to-b from-[#efe3d4] via-[#d4ccbf] to-[#a9875c] bg-clip-text text-base leading-7 text-transparent md:text-lg">
            The central platform for university chess — bringing together tournaments, standings,
            fixtures, and recorded games within a structured competitive environment.
          </p>
        </div>
      </div>

      {/* Scroll-animated messaging */}
      <div ref={messagingRef} className="absolute inset-0 z-30 translate-y-8 opacity-0">
        <div className="mx-auto h-full w-full max-w-[1440px] px-5 py-24 md:px-8">
          <div className="relative hidden h-full md:block">
            <div className="absolute left-0 top-[16%]">
              <Callout align="left" text="Observe" />
            </div>
            <div className="absolute right-0 top-[29%]">
              <Callout align="right" text="Calculate" />
            </div>
            <div className="absolute left-0 top-[53%]">
              <Callout align="left" text="Convert" />
            </div>
            <div className="absolute left-1/2 top-[73%] -translate-x-1/2">
              <Callout align="center" text="The board is set!" />
              <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-200/80">
                compete with discipline
              </p>
            </div>
          </div>

          <div className="mt-auto grid gap-4 self-end pb-28 text-center md:hidden">
            <MobileWord>Observe</MobileWord>
            <MobileWord>Calculate</MobileWord>
            <MobileWord>Convert</MobileWord>
            <div>
              <MobileWord>The board is set!</MobileWord>
              <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-200/80">
                compete with discipline
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div ref={footerRef} className="absolute inset-x-0 bottom-0 z-30 translate-y-7 opacity-0">
        <div className="mx-auto mb-5 flex w-full max-w-[1440px] justify-center px-5 md:mb-6 md:px-8">
          <Link
            href="/tournaments"
            aria-label="Enter the arena"
            className="inline-flex min-h-12 items-center justify-center border border-[#b79262] bg-[#b79262] px-8 text-xs font-bold uppercase tracking-[0.22em] text-[#120d09] shadow-[0_12px_36px_rgba(0,0,0,0.35)] transition hover:bg-[#c7a170]"
          >
            Enter the Arena
          </Link>
        </div>
        <div className="border-t border-[#6e5234] bg-[linear-gradient(180deg,rgba(8,8,8,0.72)_0%,rgba(8,8,8,0.9)_100%)] backdrop-blur-[4px]">
          <div className="mx-auto grid w-full max-w-[1440px] gap-5 px-5 py-5 md:grid-cols-[1.3fr_auto] md:items-end md:px-8 md:py-6">
            <div>
              <p className="bg-gradient-to-b from-[#f1dfc6] via-[#d8c0a0] to-[#9b7448] bg-clip-text font-serif text-2xl uppercase tracking-[0.06em] text-transparent md:text-[2.15rem]">
                Every move carries consequence.
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
      {align === "right" ? (
        <span className="h-px w-32 bg-gradient-to-r from-transparent to-[#8c6a44]" />
      ) : null}
      <div className="rounded-sm bg-black/24 px-3 py-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-[2px]">
        <p className="bg-gradient-to-b from-[#f2e0c8] via-[#d2b08a] to-[#8f6940] bg-clip-text font-sans text-[2rem] font-semibold uppercase tracking-[0.06em] text-transparent drop-shadow-[0_2px_8px_rgba(0,0,0,0.45)] md:text-[3.15rem]">
          {text}
        </p>
      </div>
      {align === "left" ? (
        <span className="h-px w-32 bg-gradient-to-r from-[#8c6a44] to-transparent" />
      ) : null}
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
