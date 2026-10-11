"use client";

import {
  MessageCircle,
  Phone,
  Wallet,
  CalendarClock,
  BellOff,
} from "lucide-react";
import {
  formatRs,
  formatShortDate,
  reminderLabel,
  type DueItem,
} from "@/lib/dues";

interface Props {
  item: DueItem;
  highlighted: boolean;
  onWhatsapp: (item: DueItem) => void;
  onCall: (item: DueItem) => void;
  onPay: (item: DueItem) => void;
  onPromise: (item: DueItem) => void;
  onSnooze: (item: DueItem) => void;
}

const btn =
  "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors";

export default function DueRow({
  item,
  highlighted,
  onWhatsapp,
  onCall,
  onPay,
  onPromise,
  onSnooze,
}: Props) {
  const isReceivable = item.direction === "receivable";
  return (
    <div
      data-testid="dues-row"
      data-entity-type={item.entityType}
      data-entity-id={item.entityId}
      className={`bg-white border rounded-2xl p-4 shadow-sm flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between transition-shadow ${
        highlighted
          ? "border-blue-500 ring-2 ring-blue-300"
          : "border-slate-200"
      }`}
    >
      <div className="min-w-0 lg:w-1/3">
        <p
          data-testid="dues-row-party"
          className="font-bold text-slate-900 truncate"
        >
          {item.partyName}
        </p>
        <p className="text-xs text-slate-500 truncate">
          {item.partyPhone || "No phone"}
          {item.reference ? ` · ${item.reference}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:flex-1 text-xs text-slate-600">
        <span
          data-testid="dues-row-amount"
          className={`text-base font-black ${isReceivable ? "text-emerald-700" : "text-amber-700"}`}
        >
          {formatRs(item.amountOpen)}
        </span>
        <span>Due: {formatShortDate(item.dueDate)}</span>
        {item.daysOverdue > 0 && (
          <span
            data-testid="dues-row-overdue"
            className="font-bold text-rose-600"
          >
            {item.daysOverdue} din overdue
          </span>
        )}
        <span>{reminderLabel(item.lastReminderAt)}</span>
        {item.promiseDate && (
          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
            Promise: {formatShortDate(item.promiseDate)}
          </span>
        )}
        {item.snoozedUntil && (
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
            Snoozed: {formatShortDate(item.snoozedUntil)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {isReceivable && (
          <button
            type="button"
            data-testid="dues-action-whatsapp"
            onClick={() => onWhatsapp(item)}
            className={`${btn} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}
          >
            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
          </button>
        )}
        {item.partyPhone ? (
          <a
            data-testid="dues-action-call"
            href={`tel:${item.partyPhone}`}
            onClick={() => onCall(item)}
            className={`${btn} border-slate-200 text-slate-700 hover:bg-slate-50`}
          >
            <Phone className="w-3.5 h-3.5" /> Call
          </a>
        ) : null}
        <button
          type="button"
          data-testid="dues-action-pay"
          onClick={() => onPay(item)}
          className={`${btn} border-slate-900 bg-slate-900 text-white hover:bg-slate-800`}
        >
          <Wallet className="w-3.5 h-3.5" /> Payment
        </button>
        <button
          type="button"
          data-testid="dues-action-promise"
          onClick={() => onPromise(item)}
          className={`${btn} border-blue-200 text-blue-700 hover:bg-blue-50`}
        >
          <CalendarClock className="w-3.5 h-3.5" /> Promise
        </button>
        <button
          type="button"
          data-testid="dues-action-snooze"
          onClick={() => onSnooze(item)}
          className={`${btn} border-slate-200 text-slate-600 hover:bg-slate-50`}
        >
          <BellOff className="w-3.5 h-3.5" /> Snooze 3 din
        </button>
      </div>
    </div>
  );
}
