import React, { useRef, useEffect, useState } from "react";

export const PdfPreviewWrapper = ({ children }: { children: React.ReactNode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentSize, setContentSize] = useState({ width: 800, height: 1130 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const updateDimensionsAndScale = () => {
      const containerEl = containerRef.current;
      const contentEl = contentRef.current;
      if (!containerEl) return;

      const firstChild = contentEl?.firstElementChild as HTMLElement | null;
      const targetWidth = firstChild?.offsetWidth || contentEl?.offsetWidth || 800;
      const targetHeight = firstChild?.offsetHeight || contentEl?.offsetHeight || 1130;

      setContentSize({ width: targetWidth, height: targetHeight });

      const availableWidth = containerEl.clientWidth - 32;
      if (availableWidth < targetWidth && availableWidth > 0) {
        setScale(availableWidth / targetWidth);
      } else {
        setScale(1);
      }
    };

    updateDimensionsAndScale();
    setMounted(true);

    const observer = new ResizeObserver(updateDimensionsAndScale);
    if (containerRef.current) observer.observe(containerRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    const firstChild = contentRef.current?.firstElementChild;
    if (firstChild) observer.observe(firstChild);

    window.addEventListener("resize", updateDimensionsAndScale);
    return () => {
      window.removeEventListener("resize", updateDimensionsAndScale);
      observer.disconnect();
    };
  }, [children]);

  const scaledHeight = contentSize.height * scale;

  return (
    <div
      ref={containerRef}
      className="pdf-preview-desk w-full bg-stone-200/60 rounded-xl border border-stone-200 overflow-x-auto overflow-y-hidden relative flex justify-center"
      style={{
        minHeight: `${Math.ceil(scaledHeight + 36)}px`,
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.2s",
      }}
    >
      <div
        ref={contentRef}
        className="a4-paper-sandbox absolute top-4 left-1/2 origin-top transition-transform duration-200 ease-out"
        style={{
          transform: `translateX(-50%) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
};
