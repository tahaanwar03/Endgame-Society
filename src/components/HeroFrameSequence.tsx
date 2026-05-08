"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const FRAME_COUNT = 68;

function framePath(index: number) {
  return `/frames/frame_${String(index).padStart(4, "0")}.webp`;
}

export function HeroFrameSequence() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);
  const messagingRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  
  const [isCanvasReady, setIsCanvasReady] = useState(false);

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

    const context = canvas.getContext("2d", { alpha: false }); // Optimize for opaque frames

    if (!context) {
      return cleanup;
    }

    let active = true;
    const state = { frame: reducedMotion ? FRAME_COUNT - 1 : 0 };
    const images: Array<HTMLImageElement> = [];
    const PRELOAD_BATCH_SIZE = 12;
    
    let lastFrameDrawn = -1;
    let drawQueued = false;
    let cssWidth = 0;
    let cssHeight = 0;

    const resize = () => {
      // Mobile adaptive DPR: Cap at 1.0 for small screens, 1.5 for desktop to balance quality/speed
      const isMobile = window.innerWidth < 768;
      const ratio = Math.min(window.devicePixelRatio || 1, isMobile ? 1.0 : 1.5);
      
      cssWidth = section.clientWidth;
      cssHeight = section.clientHeight;
      
      canvas.width = Math.max(1, Math.floor(cssWidth * ratio));
      canvas.height = Math.max(1, Math.floor(cssHeight * ratio));
      canvas.style.width = `${cssWidth}px`;
      canvas.style.height = `${cssHeight}px`;
      
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      scheduleDraw();
    };

    const loadFrame = (index: number): Promise<HTMLImageElement> => {
      return new Promise((resolve) => {
        if (images[index]) return resolve(images[index]);
        const img = new Image();
        img.src = framePath(index + 1);
        (img as any).decoding = "async";
        img.onload = () => {
          images[index] = img;
          resolve(img);
        };
      });
    };

    const preloadSequence = async () => {
      // Prioritize the first frame and immediate neighbors
      await loadFrame(0);
      scheduleDraw();
      
      if (reducedMotion) return;

      // Load in batches to avoid blocking the network/main thread entirely
      for (let i = 1; i < FRAME_COUNT; i += PRELOAD_BATCH_SIZE) {
        if (!active) break;
        const batch = [];
        for (let j = 0; j < PRELOAD_BATCH_SIZE && (i + j) < FRAME_COUNT; j++) {
           batch.push(loadFrame(i + j));
        }
        await Promise.all(batch);
      }
    };

    const draw = () => {
      const frameIndex = Math.max(0, Math.min(FRAME_COUNT - 1, Math.round(state.frame)));
      const image = images[frameIndex];

      if (!image || !image.complete) {
        return;
      }

      if (frameIndex === lastFrameDrawn && !reducedMotion) {
        return;
      }
      
      lastFrameDrawn = frameIndex;

      const scale = Math.max(cssWidth / image.naturalWidth, cssHeight / image.naturalHeight);
      const x = (cssWidth - image.naturalWidth * scale) / 2;
      const y = (cssHeight - image.naturalHeight * scale) / 2;

      context.drawImage(image, x, y, image.naturalWidth * scale, image.naturalHeight * scale);
      
      // Notify UI that we've successfully painted at least one frame
      if (!isCanvasReady) {
        setIsCanvasReady(true);
      }
    };

    const scheduleDraw = () => {
      if (drawQueued) return;
      drawQueued = true;
      requestAnimationFrame(() => {
        drawQueued = false;
        if (active) draw();
      });
    };

    resize();
    window.addEventListener("resize", resize);
    preloadSequence();

    if (reducedMotion) {
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

    const startGsap = async () => {
      if (!active) return;

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
          end: "+=250%", 
          scrub: 0.15,   
          pin: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          fastScrollEnd: true
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

      // Map the frame index to a CSS brightness filter and assembly glow
      // We do this on the element style instead of canvas context for speed
      timeline.to(canvas, {
        filter: "brightness(0.86)",
        ease: "power1.inOut",
        duration: 1
      }, 0);

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

    queueMicrotask(() => {
      if (active) startGsap().catch(() => {});
    });

    return () => cleanup();
  }, [isCanvasReady]);

  return (
    <section ref={sectionRef} className="relative h-screen min-h-[760px] w-full overflow-hidden bg-black">
      {/* Smart Hand-off Poster: Fades out once the canvas sequence is ready */}
      <picture className={`transition-opacity duration-1000 ${isCanvasReady ? "opacity-0 pointer-events-none" : "opacity-75"}`}>
        <source srcSet="/hero-poster.webp" type="image/webp" />
        <img
          src="/hero-poster.webp"
          alt=""
          className="absolute inset-0 z-0 h-full w-full object-cover object-center"
        />
      </picture>
      
      <canvas 
        ref={canvasRef} 
        className="absolute inset-0 z-10 h-full w-full transition-filter duration-300" 
        style={{ filter: "brightness(0.68)" }} // Starting brightness
        aria-hidden="true" 
      />
      
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
            The central platform for university chess - bringing together tournaments, standings, fixtures, and recorded games within a structured competitive environment.
          </p>
        </div>
      </div>

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
