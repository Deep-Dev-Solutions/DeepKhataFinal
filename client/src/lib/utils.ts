import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPakistaniPhone(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.replace(/\D/g, "");
  if (!cleaned) return "";
  if (cleaned.startsWith("0")) {
    return "92" + cleaned.slice(1);
  }
  if (cleaned.startsWith("92")) {
    return cleaned;
  }
  if (cleaned.length === 10 && cleaned.startsWith("3")) {
    return "92" + cleaned;
  }
  return cleaned;
}

export function generateWhatsAppReceipt(
  order: any,
  customer?: any,
  runningBalance?: number,
): string {
  const cust = customer || order?.customer;
  const custName = cust?.name || "Walk-in Customer";
  const custPhone = cust?.phone || "";
  const targetPhone = formatPakistaniPhone(custPhone);

  const orderNum =
    order?.orderNumber ||
    (order?.id ? `ORD-${order.id.slice(0, 8)}` : "ORD-NEW");

  const orderDate = order?.date
    ? order.date
    : order?.createdAt
      ? new Date(order.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : new Date().toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });

  const statusLabel =
    order?.status === "MEMO"
      ? "MEMO (AMANAT)"
      : order?.status === "RETURNED"
        ? "RETURNED TO STOCK"
        : order?.status === "CANCELLED"
          ? "CANCELLED"
          : "FINAL SALE";

  // Items
  const items = (order?.items || []).map((item: any) => {
    const isService = item.isService || false;
    const rawName =
      item.name ||
      (isService ? item.serviceName : item.product?.name) ||
      "Item";
    const name = isService ? `[Service] ${rawName}` : rawName;
    const qty = Number(item.qty ?? item.quantity ?? 1);
    const price = Number(item.price ?? 0);
    const total = Number(item.total ?? price * qty);
    const notesStr = item.notes ? `\n   Note: ${item.notes}` : "";
    return `• ${name} (x${qty}) - Rs. ${total.toLocaleString()}${notesStr}`;
  });

  const subtotal = Number(
    order?.financials?.subtotal ??
      (order?.items || []).reduce((s: number, i: any) => {
        const q = Number(i.qty ?? i.quantity ?? 1);
        const p = Number(i.price ?? 0);
        return s + (i.total ?? p * q);
      }, 0),
  );

  const discount = Number(order?.financials?.discount ?? order?.discount ?? 0);
  const total = Number(
    order?.financials?.total ??
      order?.totalAmount ??
      Math.max(0, subtotal - discount),
  );

  const paid = Number(
    order?.financials?.paid ??
      order?.amountPaid ??
      (order?.payments || []).reduce(
        (s: number, p: any) => s + Number(p.amount ?? 0),
        0,
      ),
  );

  const balance = Math.max(0, total - paid);

  const lines = [
    `🧾 *DEEPKHATA RECEIPT*`,
    `--------------------------------`,
    `*Order:* ${orderNum}`,
    `*Date:* ${orderDate}`,
    `*Customer:* ${custName} ${custPhone ? `(${custPhone})` : ""}`,
    `*Status:* ${statusLabel}`,
    `--------------------------------`,
    `*Items:*`,
    ...(items.length > 0 ? items : ["(No items listed)"]),
    `--------------------------------`,
    `*Subtotal:* Rs. ${subtotal.toLocaleString()}`,
    ...(discount > 0 ? [`*Discount:* -Rs. ${discount.toLocaleString()}`] : []),
    `*Net Total:* Rs. ${total.toLocaleString()}`,
    `*Amount Paid:* Rs. ${paid.toLocaleString()}`,
    `*Order Balance:* Rs. ${balance.toLocaleString()}`,
  ];

  if (typeof runningBalance === "number") {
    lines.push(`--------------------------------`);
    lines.push(
      `*Total Udhar Balance (Baqaya):* Rs. ${runningBalance.toLocaleString()}`,
    );
  }

  lines.push(`--------------------------------`);
  lines.push(`_Thank you for your business!_`);
  lines.push(`*DeepKhata / BizFlow*`);

  const messageText = lines.join("\n");
  const encodedText = encodeURIComponent(messageText);

  if (targetPhone) {
    return `https://wa.me/${targetPhone}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}
