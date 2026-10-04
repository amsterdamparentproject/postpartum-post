"use client";

import { useState } from "react";
import { planIncludes } from "@/lib/plans";

const GIFT_OPTIONS = [
  {
    id: "3mo" as const,
    icon: "⭐",
    name: "3-round gift (€8 per round)",
    priceLine: "💶 €24 one-time payment",
    badge: "Best value",
  },
  {
    id: "1mo" as const,
    icon: "🎁",
    name: "1-round gift (€12 per round)",
    priceLine: "💶 €12 one-time payment",
  },
];

type GiftOption = "1mo" | "3mo";

export default function GiftCardForm({
  links,
  monthlyPerksValue,
}: {
  links: { oneMonth: string; threeMonth: string };
  monthlyPerksValue?: number | null;
}) {
  const [selected, setSelected] = useState<GiftOption>("3mo");

  const href = selected === "1mo" ? links.oneMonth : links.threeMonth;

  return (
    <>
      <div className="space-y-3 mb-6">
                    <h1
              className="text-3xl text-dark mb-2"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              Choose your gift card
            </h1>
        <p className="text-muted text-md leading-relaxed mt-2 mb-6">
          Give one round, or three.
        </p>
        {GIFT_OPTIONS.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelected(option.id)}
              data-umami-event="Gift: Select Option"
              data-umami-event-option={option.id}
              className={`w-full text-left p-4 rounded-lg border-2 transition-all focus:outline-none focus:ring-2 focus:ring-coral/40 ${
                isSelected
                  ? "border-coral bg-coral/5"
                  : "border-border bg-white hover:border-coral/50"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xl">{option.icon}</span>
                {option.badge && (
                  <span className="text-xs font-medium text-coral bg-coral/10 px-2 py-0.5 rounded-full">
                    {option.badge}
                  </span>
                )}
              </div>
              <span className="block text-lg font-semibold text-dark leading-snug">
                {option.name}
              </span>
              <span className="block text-sm text-muted leading-relaxed mt-1 space-y-0.5">
                {[...planIncludes(monthlyPerksValue), option.priceLine].map((item) => (
                  <span key={item} className="block">{item}</span>
                ))}
              </span>
            </button>
          );
        })}
        <p className="text-xs text-muted leading-relaxed pt-1">
          Their membership continues after the gift unless they cancel. They can skip a round at no cost, or cancel anytime.
        </p>
      </div>

      <a
        href={href || "#"}
        data-umami-event="Gift: Buy Card"
        data-umami-event-option={selected}
        className="block w-full py-3 px-6 bg-purple-light hover:bg-purple text-dark font-semibold rounded-lg transition text-center"
      >
        Buy gift card →
      </a>

      <p className="text-xs text-muted text-center mt-4 leading-relaxed">
        At checkout, you can add the recipient&apos;s email so they receive the code directly — or we&apos;ll send it to you to pass along yourself.
      </p>
    </>
  );
}
