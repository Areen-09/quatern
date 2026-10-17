import { useState } from "react"
import { State, dailySales } from "../lib/store"
import { expSmoothing, movingAverage } from "../lib/forecast"
import { Badge, Card, CardHead, PageHead, Spark } from "../ui"

export default function Forecast({ s }: { s: State }) {
  const [method, setMethod] = useState<"ma" | "es">("es")
  const [sel, setSel] = useState(s.products[0]?.id)
  const rows = s.products
    .map((p) => {
      const hist = dailySales(s, p.id, 28)
      const perDay =
        method === "ma" ? movingAverage(hist, 7) : expSmoothing(hist, 0.3)
      const days = perDay > 0 ? p.stock / perDay : Infinity
      const need = Math.max(0, Math.ceil(perDay * 14) - p.stock)
      return { p, hist, perDay, days, need }
    })
    .sort((a, b) => a.days - b.days)
  const cur = rows.find((r) => r.p.id === sel) ?? rows[0]

  if (!rows.length || !cur) {
    return (
      <>
        <PageHead
          title="Demand Forecast"
          sub="Daily demand projected from sales history. Suggested purchase orders cover 14 days."
        />
        <Card className="p-12 text-center">
          <div className="text-sm font-semibold text-stone-800">
            No products available to forecast
          </div>
          <p className="mt-1 max-w-sm mx-auto text-xs text-stone-500">
            Add products to your store inventory and record sales bills. Quatern
            uses exponential smoothing and moving averages to project weekly
            demand and calculate 14-day stock replenishment automatically.
          </p>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHead
        title="Demand Forecast"
        sub="Daily demand projected from sales history. Suggested orders cover 14 days."
        right={
          <div className="flex rounded-md bg-stone-200/60 p-0.5">
            {([
              ["es", "Exp. smoothing (α 0.3)"],
              ["ma", "7-day moving avg"],
            ] as const).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setMethod(k)}
                className={`h-7 rounded px-3 text-[12px] ${
                  method === k ? "bg-white shadow-sm" : "text-stone-500"
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        }
      />
      <Card className="mb-3">
        <CardHead
          title={`${cur.p.name} · units per day`}
          right={
            <span className="text-[12px] text-stone-500">
              <span className="text-amber-600">- - -</span> next 7 days at{" "}
              {cur.perDay.toFixed(1)}/day
            </span>
          }
        />
        <div className="p-4">
          <Spark
            data={cur.hist}
            forecast={Array(7).fill(cur.perDay)}
            height={150}
          />
        </div>
      </Card>
      <Card>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-stone-100 text-left text-[12px] text-stone-500">
              {[
                "Product",
                "Forecast / day",
                "In stock",
                "Days of cover",
                "Suggested order",
              ].map((h, i) => (
                <th
                  key={h}
                  className={`px-4 py-2.5 font-normal ${i ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((r) => (
              <tr
                key={r.p.id}
                onClick={() => setSel(r.p.id)}
                className={`cursor-pointer ${
                  r.p.id === cur.p.id ? "bg-stone-50" : "hover:bg-stone-50/60"
                }`}
              >
                <td className="px-4 py-2.5">{r.p.name}</td>
                <td className="px-4 text-right tabular-nums">
                  {r.perDay.toFixed(2)}
                </td>
                <td className="px-4 text-right tabular-nums">{r.p.stock}</td>
                <td className="px-4 text-right">
                  {r.days === Infinity ? (
                    "—"
                  ) : (
                    <Badge
                      tone={r.days < 3 ? "red" : r.days < 7 ? "amber" : "green"}
                    >
                      {r.days.toFixed(1)} days
                    </Badge>
                  )}
                </td>
                <td className="px-4 text-right font-medium tabular-nums">
                  {r.need || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
