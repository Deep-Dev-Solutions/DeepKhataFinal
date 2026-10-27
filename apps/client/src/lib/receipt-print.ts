/**
 * Receipt printing.
 *
 * Inside the DeepKhata desktop shell (Electron) the preload exposes
 * `window.deepkhata.printReceipt`, which prints silently to the thermal
 * printer. Everywhere else — and on any printer error — we fall back to the
 * browser print dialog, so the POS keeps working in a plain tab.
 */
export type PaperWidth = 58 | 80;

export interface ReceiptPrintResult {
  ok: boolean;
  error?: string;
}

export interface DeepKhataDesktopBridge {
  printReceipt(html: string, options?: { width?: PaperWidth }): Promise<ReceiptPrintResult>;
  openCashDrawer(): Promise<ReceiptPrintResult>;
}

type BridgeHost = { deepkhata?: Partial<DeepKhataDesktopBridge> };

/** The desktop bridge, or `null` in a browser. */
export function getDesktopBridge(): DeepKhataDesktopBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as BridgeHost).deepkhata;
  return bridge && typeof bridge.printReceipt === "function"
    ? (bridge as DeepKhataDesktopBridge)
    : null;
}

export function hasDesktopBridge(): boolean {
  return getDesktopBridge() !== null;
}

/**
 * Properties the thermal slip actually needs. Copying only these keeps the
 * payload small (the shell caps receipts at 512 KB) while still reproducing the
 * flex rows, dashed rules and font sizes of the on-screen slip.
 */
const INLINE_PROPS = [
  "display",
  "flex-direction",
  "flex-wrap",
  "justify-content",
  "align-items",
  "gap",
  "grid-template-columns",
  "grid-column",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "letter-spacing",
  "text-transform",
  "text-align",
  "text-decoration-line",
  "white-space",
  "color",
  "background-color",
  "border-top-width",
  "border-top-style",
  "border-top-color",
  "border-bottom-width",
  "border-bottom-style",
  "border-bottom-color",
  "border-left-width",
  "border-left-style",
  "border-left-color",
  "border-right-width",
  "border-right-style",
  "border-right-color",
  "border-radius",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "width",
  "max-width",
  "vertical-align",
] as const;

type StyleReader = { getComputedStyle(element: Element): CSSStyleDeclaration };

/**
 * Serialize an element with its computed styles inlined, so the receipt prints
 * identically in a window that never loaded the app's stylesheet. The slip is
 * `display:none` on screen (it only shows for `@media print`), which is why the
 * root is forced back to `display:block`.
 */
export function serializeForPrint(
  source: HTMLElement,
  styleOf: StyleReader | undefined = typeof window === "undefined" ? undefined : window,
  width: PaperWidth = 80,
): string {
  if (!styleOf) return source.outerHTML;
  const clone = source.cloneNode(true) as HTMLElement;
  const nodes: Element[] = [source, ...Array.from(source.querySelectorAll("*"))];
  const copies: Element[] = [clone, ...Array.from(clone.querySelectorAll("*"))];

  nodes.forEach((node, index) => {
    const copy = copies[index];
    if (!copy) return;
    const computed = styleOf.getComputedStyle(node);
    const isRoot = index === 0;
    const declarations = INLINE_PROPS.map((prop) => {
      let value = computed.getPropertyValue(prop);
      if (isRoot && prop === "display") value = "block";
      if (isRoot && prop === "width") value = "100%";
      if (isRoot && prop === "max-width") value = `${width}mm`;
      return value ? `${prop}:${value}` : "";
    }).filter(Boolean);
    copy.setAttribute("style", declarations.join(";"));
    copy.removeAttribute("class");
    copy.removeAttribute("hidden");
  });

  return clone.outerHTML;
}

/**
 * Print the receipt: silent thermal print in the desktop shell, browser dialog
 * everywhere else. Resolves with which path was used (handy for tests).
 */
export async function printReceiptElement(
  elementId: string,
  width: PaperWidth = 80,
): Promise<"desktop" | "browser"> {
  const bridge = getDesktopBridge();
  const element = typeof document === "undefined" ? null : document.getElementById(elementId);

  if (bridge && element) {
    try {
      const result = await bridge.printReceipt(serializeForPrint(element, window, width), { width });
      if (result.ok) return "desktop";
    } catch {
      // Fall through to the print dialog rather than swallow the print.
    }
  }

  if (typeof window !== "undefined") window.print();
  return "browser";
}
