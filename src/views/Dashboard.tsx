import { useState, useEffect } from "react"
import { State, dailySales, DAY } from "../lib/store"
import { fmt0 } from "../lib/money"
import { Badge, Card, CardHead, PageHead, Spark, Icon } from "../ui"
import { getAIRecommendations, AIRecommendation } from "../lib/api"

export default function Dashboard({
  s,
  go,
  onOpenMessaging,
  onOpenAI,
}: {
  s: State
  go: (v: string) => void
  onOpenMessaging?: () => void
  onOpenAI?: () => void
}) {
  const [recs, setRecs] = useState<AIRecommendation[]>([])

  useEffect(() => {
    getAIRecommendations()
      .then((r) => setRecs(r))
      .catch(() => {})
  }, [])
  const series = dailySales(s, null, 30)
  const today = series[29],
    yest = series[28]
  const last7 = series.slice(-7).reduce((a, b) => a + b, 0)
  const prev7 = series.slice(-14, -7).reduce((a, b) => a + b, 0)
  const midnight = new Date().setHours(0, 0, 0, 0)
  const todayCount = s.invoices.filter((i) => i.at >= midnight).length
  const qty: Record<string, number> = {},
    rev: Record<string, number> = {}
  for (const inv of s.invoices.filter((i) => i.at > Date.now() - 30 * DAY))
    for (const l of inv.lines) {
      qty[l.productId] = (qty[l.productId] ?? 0) + l.qty
      rev[l.productId] = (rev[l.productId] ?? 0) + l.price * l.qty
    }
  const best = s.products
    .map((p) => ({ p, q: qty[p.id] ?? 0, r: rev[p.id] ?? 0 }))
    .filter((x) => x.q > 0)
    .sort((a, b) => b.r - a.r)
    .slice(0, 5)
  const low = s.products
    .filter((p) => p.stock <= p.reorder)
    .sort((a, b) => a.stock / a.reorder - b.stock / b.reorder)
  const pct = (a: number, b: number) =>
    b ? Math.round(((a - b) / b) * 100) : 0
  const kpis: {
    label: string
    value: string
    delta?: number
    note: string
    target?: string
  }[] = [
    {
      label: "Revenue today",
      value: fmt0(today),
      delta: pct(today, yest),
      note: "vs yesterday",
    },
    {
      label: "Last 7 days",
      value: fmt0(last7),
      delta: pct(last7, prev7),
      note: "vs prior week",
    },
    {
      label: "Bills today",
      value: String(todayCount),
      note: `avg ${fmt0(todayCount ? today / todayCount : 0)}`,
      target: "invoices",
    },
    {
      label: "Low stock items",
      value: String(low.length),
      note: "at or below reorder level",
      target: "inventory",
    },
  ]
  const first = new Date(Date.now() - 29 * DAY)
  const greetingName = s.shop.ownerName || s.shop.name || "Store Owner"

  return (
    <>
      <PageHead
        title={`Good day, ${greetingName}`}
        sub={new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        right={
          <button
            type="button"
            onClick={() => go("assistant")}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-stone-900 px-3 text-[13px] font-medium text-white shadow-xs hover:bg-stone-800 transition"
          >
            <Icon name="sparkles" className="size-3.5 text-amber-300" />
            AI Assistant
          </button>
        }
      />

      {/* Quick Start Guidance if store has no products or no bills */}
      {s.invoices.length === 0 && (
        <Card className="mb-4 border-amber-200/80 bg-gradient-to-r from-amber-50/50 via-stone-50 to-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-stone-900 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                Welcome to your store dashboard! Let&rsquo;s get you started
              </div>
              <p className="mt-0.5 text-xs text-stone-500">
                Your store is running clean on local SQLite. Complete these 3
                quick steps to make your first sale:
              </p>
            </div>
            {onOpenMessaging && (
              <button
                type="button"
                onClick={onOpenMessaging}
                className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 shadow-sm hover:bg-stone-50"
              >
                Setup WhatsApp / SMS
              </button>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => go("inventory")}
              className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2.5 text-left transition hover:border-stone-400 shadow-xs"
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-stone-100 text-xs font-bold text-stone-700">
                1
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-900 truncate">
                  Add Inventory
                </div>
                <div className="text-[11px] text-stone-400">
                  Add products & prices
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() =>
                onOpenMessaging ? onOpenMessaging() : go("campaigns")
              }
              className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2.5 text-left transition hover:border-stone-400 shadow-xs"
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-xs font-bold text-emerald-800">
                2
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-900 truncate">
                  WhatsApp API
                </div>
                <div className="text-[11px] text-stone-400">
                  Enable digital receipts
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => go("billing")}
              className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2.5 text-left transition hover:border-stone-400 shadow-xs"
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-100 text-xs font-bold text-amber-800">
                3
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-stone-900 truncate">
                  Create First Bill
                </div>
                <div className="text-[11px] text-stone-400">
                  Scan & print receipt
                </div>
              </div>
            </button>
          </div>
        </Card>
      )}

      {/* AI Customer Radar Banner */}
      {recs.length > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200/80 bg-gradient-to-r from-amber-50/70 via-stone-50 to-white px-4 py-2.5 shadow-xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex size-7 shrink-0 items-center justify-center rounded bg-stone-900 text-[10px] font-bold text-amber-300">
              AI
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-stone-900 truncate">
                AI Radar: {recs.length} actionable targeting suggestions
                available
              </div>
              <div className="text-[11px] text-stone-500 truncate">
                {recs[0]?.title} &bull; {recs[0]?.expectedReach} customers can
                be targeted today
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {onOpenAI && (
              <button
                type="button"
                onClick={onOpenAI}
                className="text-xs text-stone-500 hover:text-stone-800 underline mr-1"
              >
                Settings
              </button>
            )}
            <button
              type="button"
              onClick={() => go("campaigns")}
              className="rounded-md bg-stone-900 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-stone-800 transition"
            >
              Review Suggestions &rarr;
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3">
        {kpis.map((k) => (
          <Card
            key={k.label}
            className={`p-4 transition ${
              k.target
                ? "cursor-pointer hover:border-stone-400 hover:shadow-xs"
                : ""
            }`}
            onClick={k.target ? () => go(k.target!) : undefined}
          >
            <div className="text-[12px] text-stone-500">{k.label}</div>
            <div className="mt-1.5 text-[22px] font-semibold tabular-nums tracking-tight">
              {k.value}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-[12px] text-stone-500">
              {k.delta !== undefined && (
                <span
                  className={k.delta >= 0 ? "text-emerald-600" : "text-red-600"}
                >
                  {k.delta >= 0 ? "+" : ""}
                  {k.delta}%
                </span>
              )}
              {k.note}
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Card className="col-span-2">
          <CardHead
            title="Revenue, last 30 days"
            right={
              <span className="text-[12px] tabular-nums text-stone-500">
                {fmt0(series.reduce((a, b) => a + b, 0))}
              </span>
            }
          />
          <div className="px-4 pt-4">
            <Spark data={series} height={180} />
          </div>
          <div className="flex justify-between px-4 pb-3 pt-1 text-[11px] text-stone-400">
            <span>
              {first.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
            </span>
            <span>Today</span>
          </div>
        </Card>
        <Card>
          <CardHead
            title="Stock alerts"
            right={
              <button
                onClick={() => go("inventory")}
                className="text-[12px] text-stone-500 hover:text-stone-900"
              >
                View all
              </button>
            }
          />
          <div className="divide-y divide-stone-100">
            {low.slice(0, 6).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px]">{p.name}</div>
                  <div className="text-[11px] text-stone-400">
                    Reorder at {p.reorder}
                  </div>
                </div>
                <Badge tone={p.stock <= p.reorder / 2 ? "red" : "amber"}>
                  {p.stock} left
                </Badge>
              </div>
            ))}
            {!low.length && (
              <div className="px-4 py-8 text-center text-[12px] text-stone-400">
                All stocked up · 0 low-stock items
              </div>
            )}
          </div>
        </Card>
        <Card className="col-span-2">
          <CardHead title="Bestsellers, 30 days" />
          {best.length > 0 ? (
            <table className="w-full text-[13px]">
              <tbody className="divide-y divide-stone-100">
                {best.map(({ p, q, r }, i) => (
                  <tr key={p.id}>
                    <td className="w-8 py-2.5 pl-4 tabular-nums text-stone-400">
                      {i + 1}
                    </td>
                    <td className="py-2.5">{p.name}</td>
                    <td className="py-2.5 text-right tabular-nums text-stone-500">
                      {q} sold
                    </td>
                    <td className="w-40 px-4 py-2.5">
                      <div className="h-1.5 rounded-full bg-stone-100">
                        <div
                          className="h-1.5 rounded-full bg-stone-800"
                          style={{ width: `${(r / (best[0].r || 1)) * 100}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right font-medium tabular-nums">
                      {fmt0(r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-xs text-stone-400">
              No sales recorded yet. Your top selling products will rank here as
              you bill customers.
            </div>
          )}
        </Card>
        <Card>
          <CardHead
            title="Campaign outcomes"
            right={
              <button
                onClick={() => go("campaigns")}
                className="text-[12px] text-stone-500 hover:text-stone-900"
              >
                Open
              </button>
            }
          />
          <div className="divide-y divide-stone-100">
            {s.campaigns.slice(0, 4).map((c) => (
              <div key={c.id} className="px-4 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px]">{c.name}</span>
                  <Badge
                    tone={
                      c.status === "Sent"
                        ? "green"
                        : c.status === "Pending approval"
                          ? "amber"
                          : "stone"
                    }
                  >
                    {c.status}
                  </Badge>
                </div>
                {c.status === "Sent" && (
                  <div className="mt-0.5 text-[11px] text-stone-400">
                    {c.sentTo} reached · {c.conversions} came back to buy
                  </div>
                )}
              </div>
            ))}
            {!s.campaigns.length && (
              <div className="p-6 text-center text-xs text-stone-400">
                No campaigns yet. Connect WhatsApp/SMS to launch festive offers
                and retain customers.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
