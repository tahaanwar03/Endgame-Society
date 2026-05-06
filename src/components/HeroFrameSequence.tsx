"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

const FRAME_COUNT = 68;
const MAX_CANVAS_DPR = 1.25;

function framePath(index: number) {
  return `/frames/frame_${String(index).padStart(4, "0")}.webp`;
}

function isLowEndHeroDevice() {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean; effectiveType?: string };
  };

  if (window.innerWidth < 900) {
    return true;
  }

  if (nav.deviceMemory && nav.deviceMemory <= 4) {
    return true;
  }

  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) {
    return true;
  }

  if (nav.connection?.saveData) {
    return true;
  }

  if (nav.connection?.effectiveType && ["slow-2g", "2g", "3g"].includes(nav.connection.effectiveType)) {
    return true;
  }

  return false;
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
    const lowEndDevice = isLowEndHeroDevice();
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
    let decodedImages: HTMLImageElement[] = [];
    let lastFrameDrawn = -1;
    let drawQueued = false;
    let cssWidth = 0;
    let cssHeight = 0;

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_DPR);
      cssWidth = section.clientWidth;
      cssHeight = section.clientHeight;
      canvas.width = Math.max(1, Math.floor(cssWidth * ratio));
      canvas.height = Math.max(1, Math.floor(cssHeight * ratio));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      scheduleDraw();
    };

    const draw = () => {
      if (lowEndDevice) {
        return;
      }

      const frameIndex = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(state.frame)));
      if (frameIndex === lastFrameDrawn && !reducedMotion) {
        return;
      }
      lastFrameDrawn = frameIndex;

      const image = decodedImages[frameIndex];

      if (!image?.complete) {
        return;
      }

      const width = cssWidth;
      const height = cssHeight;
      const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
      const x = (width - image.naturalWidth * scale) / 2;
      const y = (height - image.naturalHeight * scale) / 2;

      context.clearRect(0, 0, cssWidth, cssHeight);
      context.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
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

    if (reducedMotion || lowEndDevice) {
      canvas.style.display = "none";
      intro.style.opacity = "1";
      intro.style.transform = "translateY(0)";
      messaging.style.opacity = "0";
      footer.style.opacity = "1";
      footer.style.transform = "translateY(0)";

      const startStaticGsap = async () => {
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
            end: "+=180%",
            scrub: 0.2,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true
          }
        });

        timeline
          .to(
            intro,
            {
              opacity: 0,
              y: -28,
              ease: "power2.out",
              duration: 0.18
            },
            0.12
          )
          .to(
            messaging,
            {
              opacity: 1,
              y: 0,
              ease: "power2.out",
              duration: 0.18
            },
            0.26
          )
          .to(
            messaging,
            {
              opacity: 0,
              y: -20,
              ease: "power2.out",
              duration: 0.16
            },
            0.58
          )
          .to(
            footer,
            {
              opacity: 1,
              y: 0,
              ease: "power2.out",
              duration: 0.18
            },
            0.76
          );

        cleanup = () => {
          active = false;
          timeline.scrollTrigger?.kill();
          timeline.kill();
          window.removeEventListener("resize", resize);
        };
      };

      queueMicrotask(() => {
        if (!active) return;
        startStaticGsap().catch(() => {});
      });

      return () => cleanup();
    }

    const preloadAllFrames = async () => {
      const loaded = await Promise.all(
        Array.from({ length: FRAME_COUNT }, async (_, index) => {
          const image = new Image();
          image.src = framePath(index + 1);
          await (image.decode ? image.decode().catch(() => undefined) : Promise.resolve());
          images[index] = image;
          return image;
        })
      );

      return loaded;
    };

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
          scrub: 0.18,
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true
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

    queueMicrotask(async () => {
      if (!active) return;

      try {
        decodedImages = await preloadAllFrames();
        if (!active) {
          return;
        }
        draw();
        await startGsap();
      } catch {
        canvas.style.display = "none";
      }
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
            <div className="absolute left-0 top-[74%]">
              <Callout align="left" text="The board is set!" />
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
            <div className="flex flex-col gap-4 md:items-end">
              <div className="flex items-center gap-2 bg-gradient-to-b from-[#efe3d4] via-[#cbb79a] to-[#9b7448] bg-clip-text text-[10px] uppercase tracking-[0.18em] text-transparent md:text-[11px]">
                <CreditIcon />
                <span>Taha Anwar B&apos;27</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Callout({ text, align }: { text: string; align: "left" | "right" }) {
  return (
    <div className={`flex items-center gap-5 ${align === "right" ? "justify-end" : ""}`}>
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

function CreditIcon() {
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#8d6a44]/80" aria-hidden="true">
      <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 fill-none stroke-[#cbb79a]" aria-hidden="true">
        <path d="M3 8h10M8 3v10" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
