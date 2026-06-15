"use client";

import { useState } from "react";

const GIFT_OPTIONS = [
  {
    id: "3mo" as const,
    icon: "⭐",
    price: "€24",
    name: "3 months of matches",
    billing: "One-time payment",
    badge: "Best value",
    description: "3 free months of matches on the 3 month subscription",
    featured: true,
  },
  {
    id: "1mo" as const,
    icon: "🎁",
    price: "€12",
    name: "1 month of matches",
    billing: "One-time payment",
    description: "1 free month of matches on the monthly subscription",
  },
];

type GiftOption = "1mo" | "3mo";

export default function GiftCardForm({
  links,
}: {
  links: { oneMonth: string; threeMonth: string };
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
          We offer gift cards for all of our subscriptions.
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
              <span className="block text-lg font-semibold text-dark leading-tight">
                {option.name}
              </span>
              <span className="block text-sm font-medium text-dark mt-0.5 mb-1">
                {option.price}
              </span>
              {/* <span className="block text-xs text-muted mb-2">{option.price}</span> */}
              <span className="block text-sm text-muted leading-relaxed">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      <a
        href={href || "#"}
        data-umami-event="Gift: Buy Card"
        data-umami-event-option={selected}
        className="block w-full py-3 px-6 bg-coral hover:bg-coral-dark text-white font-semibold rounded-lg transition text-center"
      >
        Buy gift card →
      </a>

      <p className="text-xs text-muted text-center mt-4 leading-relaxed">
        At checkout, you can add the recipient&apos;s email so they receive the code directly — or we&apos;ll send it to you to pass along yourself.
      </p>
    </>
  );
}
