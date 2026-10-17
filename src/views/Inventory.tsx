import { useState } from "react"
import { Action, Product, State } from "../lib/store"
import { fmt, toPaise } from "../lib/money"
import {
  Badge,
  Btn,
  Card,
  Field,
  Icon,
  Input,
  Modal,
  PageHead,
  selectCls,
} from "../ui"
import ImportModal from "./ImportModal"

export default function Inventory({
  s,
  dispatch,
}: {
  s: State
  dispatch: (a: Action) => void
}) {
  const [filter, setFilter] = useState<"all" | "low">("all")
  const [q, setQ] = useState("")
  const [edit, setEdit] = useState<Product | null>(null)
  const [restock, setRestock] = useState<Product | null>(null)
  const [importModal, setImportModal] = useState(false)
  const [rq, setRq] = useState({ qty: "", cost: "" })
  const lowCount = s.products.filter((p) => p.stock <= p.reorder).length
  const rows = s.products.filter(
    (p) =>
      (filter === "all" || p.stock <= p.reorder) &&
      p.name.toLowerCase().includes(q.toLowerCase()),
  )
  const value = s.products.reduce(
    (a, p) => a + p.cost * Math.max(0, p.stock),
    0,
  )
  const sup = (id: string) =>
    s.suppliers.find((x) => x.id === id)?.name ?? "Direct / Self"
  const blank: Product = {
    id: "",
    sku: "",
    name: "",
    category: "General",
    price: 0,
    cost: 0,
    gst: 5,
    stock: 0,
    reorder: 5,
    supplierId: s.suppliers[0]?.id || "",
    unit: "pc",
  }

  return (
    <>
      <PageHead
        title="Inventory"
        sub={`${s.products.length} products · stock value ${fmt(value)} at cost`}
        right={
          <div className="flex items-center gap-2">
            <Btn
              variant="ghost"
              onClick={() => setImportModal(true)}
              className="text-stone-700 hover:text-stone-900"
            >
              <Icon name="upload" className="size-3.5 text-stone-500" />
              Import (Excel / CSV)
            </Btn>
            <Btn onClick={() => setEdit(blank)}>
              <Icon name="plus" />
              Add product
            </Btn>
          </div>
        }
      />
      <div className="mb-3 flex items-center gap-2">
        {(["all", "low"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-8 rounded-md px-3 text-[13px] ${
              filter === f
                ? "bg-white shadow-sm ring-1 ring-stone-200"
                : "text-stone-500 hover:text-stone-900"
            }`}
          >
            {f === "all" ? "All" : `Low stock (${lowCount})`}
          </button>
        ))}
        <div className="ml-auto w-64">
          <Input
            placeholder="Filter products"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <Card>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-stone-100 text-left text-[12px] text-stone-500">
              {[
                "Product",
                "Category",
                "Supplier",
                "Price",
                "GST",
                "Margin",
                "Stock",
                "",
              ].map((h, i) => (
                <th
                  key={i}
                  className={`px-4 py-2.5 font-normal ${
                    i >= 3 && i <= 6 ? "text-right" : ""
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((p) => (
              <tr key={p.id} className="hover:bg-stone-50/60">
                <td className="px-4 py-2.5">
                  <div>{p.name}</div>
                  <div className="text-[11px] text-stone-400">{p.sku}</div>
                </td>
                <td className="px-4 text-stone-500">{p.category}</td>
                <td className="px-4 text-stone-500">{sup(p.supplierId)}</td>
                <td className="px-4 text-right tabular-nums">{fmt(p.price)}</td>
                <td className="px-4 text-right tabular-nums text-stone-500">
                  {p.gst}%
                </td>
                <td className="px-4 text-right tabular-nums text-stone-500">
                  {p.price
                    ? Math.round(((p.price - p.cost) / p.price) * 100)
                    : 0}
                  %
                </td>
                <td className="px-4 text-right">
                  {p.stock <= p.reorder ? (
                    <Badge tone={p.stock <= p.reorder / 2 ? "red" : "amber"}>
                      {p.stock}
                    </Badge>
                  ) : (
                    <span className="tabular-nums">{p.stock}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 text-right">
                  <button
                    onClick={() => {
                      setRestock(p)
                      setRq({
                        qty: String(p.reorder * 2),
                        cost: String(p.cost / 100),
                      })
                    }}
                    className="text-[12px] text-stone-500 hover:text-stone-900"
                  >
                    Restock
                  </button>
                  <button
                    onClick={() => setEdit(p)}
                    className="ml-3 text-[12px] text-stone-500 hover:text-stone-900"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={8}
                  className="py-12 text-center text-xs text-stone-400"
                >
                  <div className="font-semibold text-stone-800 text-sm mb-1">
                    No products found in inventory
                  </div>
                  <div className="max-w-sm mx-auto text-stone-500 mb-4">
                    Add items manually or import your existing catalog directly
                    from an Excel (.xlsx) or CSV file.
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Btn variant="ghost" onClick={() => setImportModal(true)}>
                      <Icon name="upload" className="size-3.5 text-stone-500" />
                      Import (Excel / CSV)
                    </Btn>
                    <Btn onClick={() => setEdit(blank)}>
                      <Icon name="plus" />
                      Add product
                    </Btn>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {edit && (
        <Modal
          title={edit.id ? "Edit product" : "New product"}
          onClose={() => setEdit(null)}
        >
          <Field label="Name">
            <Input
              value={edit.name}
              onChange={(e) => setEdit({ ...edit, name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SKU / barcode">
              <Input
                value={edit.sku}
                disabled={!!edit.id}
                onChange={(e) => setEdit({ ...edit, sku: e.target.value })}
              />
            </Field>
            <Field label="Category">
              <Input
                value={edit.category}
                onChange={(e) => setEdit({ ...edit, category: e.target.value })}
              />
            </Field>
            <Field label="Selling price (₹, excl. GST)">
              <Input
                type="number"
                value={edit.price / 100 || ""}
                onChange={(e) =>
                  setEdit({ ...edit, price: toPaise(Number(e.target.value)) })
                }
              />
            </Field>
            <Field label="Cost (₹)">
              <Input
                type="number"
                value={edit.cost / 100 || ""}
                onChange={(e) =>
                  setEdit({ ...edit, cost: toPaise(Number(e.target.value)) })
                }
              />
            </Field>
            <Field label="GST slab">
              <select
                value={edit.gst}
                onChange={(e) =>
                  setEdit({ ...edit, gst: Number(e.target.value) })
                }
                className={selectCls}
              >
                {[0, 5, 12, 18, 28].map((g) => (
                  <option key={g} value={g}>
                    {g}%
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Supplier">
              <select
                value={edit.supplierId}
                onChange={(e) =>
                  setEdit({ ...edit, supplierId: e.target.value })
                }
                className={selectCls}
              >
                <option value="">Direct / Self</option>
                {s.suppliers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stock">
              <Input
                type="number"
                value={edit.stock}
                onChange={(e) =>
                  setEdit({ ...edit, stock: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Reorder level">
              <Input
                type="number"
                value={edit.reorder}
                onChange={(e) =>
                  setEdit({ ...edit, reorder: Number(e.target.value) })
                }
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Btn>
            <Btn
              disabled={!edit.name || !edit.sku}
              onClick={() => {
                dispatch({
                  type: "product",
                  product: { ...edit, id: edit.id || edit.sku },
                })
                setEdit(null)
              }}
            >
              Save
            </Btn>
          </div>
        </Modal>
      )}
      {restock && (
        <Modal
          title={`Record purchase · ${restock.name}`}
          onClose={() => setRestock(null)}
        >
          <p className="text-[12px] text-stone-500">
            From {sup(restock.supplierId)}. Current stock {restock.stock}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity received">
              <Input
                type="number"
                value={rq.qty}
                onChange={(e) => setRq({ ...rq, qty: e.target.value })}
              />
            </Field>
            <Field label="Unit cost (₹)">
              <Input
                type="number"
                value={rq.cost}
                onChange={(e) => setRq({ ...rq, cost: e.target.value })}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Btn variant="ghost" onClick={() => setRestock(null)}>
              Cancel
            </Btn>
            <Btn
              disabled={!(Number(rq.qty) > 0)}
              onClick={() => {
                dispatch({
                  type: "purchase",
                  productId: restock.id,
                  qty: Number(rq.qty),
                  cost: toPaise(Number(rq.cost)),
                })
                setRestock(null)
              }}
            >
              Add to stock
            </Btn>
          </div>
        </Modal>
      )}

      {importModal && (
        <ImportModal
          initialTarget="products"
          s={s}
          dispatch={dispatch}
          onClose={() => setImportModal(false)}
        />
      )}
    </>
  )
}
