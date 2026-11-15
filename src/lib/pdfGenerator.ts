export interface PdfOptions {
  orientation?: "portrait" | "landscape";
  format?: "a4" | "a5" | [number, number];
  marginMm?: number;
}

/**
 * High-DPI Lossless PDF Engine
 * Utilizes html-to-image (PNG format with high pixelRatio) and jsPDF
 * to eliminate JPEG compression artifacts and guarantee crisp text and graphics.
 */
async function captureClonedElement(
  sourceEl: HTMLElement,
  toPng: (node: HTMLElement, opts: any) => Promise<string>,
  stripSheetChrome: boolean
): Promise<{ dataUrl: string; width: number; height: number }> {
  const targetWidth = sourceEl.offsetWidth || 794;
  const targetHeight = sourceEl.offsetHeight || 1123;

  const clone = sourceEl.cloneNode(true) as HTMLElement;

  // Strip UI-only helpers (toolbars, rulers, selection handles) inside cloned tree
  clone.querySelectorAll(".print\\:hidden").forEach((el) => el.remove());

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "0";
  container.style.top = "0";
  container.style.width = `${targetWidth}px`;
  container.style.height = `${targetHeight}px`;
  container.style.zIndex = "-99999";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.style.overflow = "hidden";
  container.style.backgroundColor = "#ffffff";

  clone.style.transform = "none";
  clone.style.width = `${targetWidth}px`;
  clone.style.height = `${targetHeight}px`;
  clone.style.minWidth = `${targetWidth}px`;
  clone.style.maxWidth = `${targetWidth}px`;
  clone.style.minHeight = `${targetHeight}px`;
  clone.style.maxHeight = `${targetHeight}px`;
  clone.style.margin = "0";
  clone.style.boxSizing = "border-box";
  if (stripSheetChrome) {
    clone.style.border = "none";
    clone.style.borderRadius = "0";
    clone.style.boxShadow = "none";
  }
  (clone.style as any).webkitFontSmoothing = "antialiased";
  (clone.style as any).mozOsxFontSmoothing = "grayscale";
  clone.style.textRendering = "optimizeLegibility";

  container.appendChild(clone);
  document.body.appendChild(container);

  try {
    const imgs = Array.from(clone.querySelectorAll("img"));
    if (imgs.length > 0) {
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((res) => {
              if (img.complete) return res();
              img.addEventListener("load", () => res(), { once: true });
              img.addEventListener("error", () => res(), { once: true });
              setTimeout(res, 600);
            })
        )
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 180));

    const dataUrl = await toPng(clone, {
      quality: 1.0,
      pixelRatio: 3.0,
      backgroundColor: "#ffffff",
      width: targetWidth,
      height: targetHeight,
      skipFonts: false,
      style: {
        transform: "none",
        margin: "0",
      },
    });

    return { dataUrl, width: targetWidth, height: targetHeight };
  } finally {
    if (document.body.contains(container)) {
      document.body.removeChild(container);
    }
  }
}

export const generatePDF = async (
  element: HTMLElement,
  filename: string,
  options?: PdfOptions,
): Promise<void> => {
  try {
    if (typeof document !== "undefined" && document.fonts) {
      await document.fonts.ready;
    }

    const { toPng } = await import("html-to-image");
    const { jsPDF } = await import("jspdf");

    const pageNodes = element.hasAttribute("data-studio-page")
      ? [element]
      : Array.from(element.querySelectorAll<HTMLElement>("[data-studio-page]"));

    const orientation = options?.orientation || "portrait";
    const format = options?.format || "a4";

    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format,
      compress: true,
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    if (pageNodes.length > 0) {
      for (let i = 0; i < pageNodes.length; i++) {
        const { dataUrl } = await captureClonedElement(pageNodes[i], toPng, true);
        if (i > 0) {
          pdf.addPage(format, orientation);
        }
        pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
      }
      pdf.save(filename);
      return;
    }

    // Legacy single-sheet capture path (Book Closing, Finance, Procurement, etc.)
    const { dataUrl } = await captureClonedElement(element, toPng, false);
    pdf.addImage(dataUrl, "PNG", 0, 0, pdfWidth, pdfHeight, undefined, "FAST");
    pdf.save(filename);
  } catch (error: any) {
    console.error("Print Engine Failure:", error);
    throw new Error(
      `Print generation failed: ${error?.message || String(error)}`,
    );
  }
};

