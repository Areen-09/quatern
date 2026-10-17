import { useMemo, useState } from "react"
import { Action, Invoice, InvoiceLine, State } from "../lib/store"
import { calcBill, calcLine, fmt, toPaise } from "../lib/money"
import { Badge, Btn, Card, Field, Icon, Input, Modal, selectCls } from "../ui"
import {
  getEscPosReceiptBytes,
  openWhatsAppLink,
  sendInvoiceReceipt,
} from "../lib/api"
import { downloadInvoicePDF, paiseToWords, CustomerInfo } from "../lib/pdf"
import {
  copyInvoiceImageToClipboard,
  downloadInvoiceImage,
} from "../lib/billImage"

export default function Billing({
  s,
  dispatch,
  onOpenMessaging,
}: {
  s: State
  dispatch: (a: Action) => void
  onOpenMessaging?: () => void
}) {
  const [q, setQ] = useState("")
  const [lines, setLines] = useState<InvoiceLine[]>([])

  // Customer fields (optional name, phone, address)
  const [customerId, setCustomerId] = useState("")
  const [custName, setCustName] = useState("")
  const [custPhone, setCustPhone] = useState("")
  const [custAddress, setCustAddress] = useState("")
  const [showCustDetails, setShowCustDetails] = useState(false)

  const [discount, setDiscount] = useState("")
  const [payment, setPayment] = useState<Invoice["payment"]>("UPI")
  const [receipt, setReceipt] = useState<Invoice | null>(null)

  // Bill format: 'style1' (Detailed Showroom Tax Invoice) or 'style2' (Compact Thermal POS Slip)
  const [billFormat, setBillFormat] = useState<"style1" | "style2">("style1")
  const [receiptStatus, setReceiptStatus] = useState<string | null>(null)

  // Custom ad-hoc item modal state
  const [customModalOpen, setCustomModalOpen] = useState(false)
  const [customName, setCustomName] = useState("")
  const [customPrice, setCustomPrice] = useState("")
  const [customQty, setCustomQty] = useState(1)
  const [customGst, setCustomGst] = useState(0)

  // Editing item name in cart
  const [editingLineId, setEditingLineId] = useState<string | null>(null)
  const [editingLineName, setEditingLineName] = useState("")

  const results = useMemo(
    () =>
      s.products.filter((p) =>
        (p.name + p.sku).toLowerCase().includes(q.toLowerCase()),
      ),
    [q, s.products],
  )
  const bill = calcBill(lines, toPaise(Number(discount) || 0))

  const add = (id: string) => {
    const p = s.products.find((x) => x.id === id)!
    setLines((ls) =>
      ls.some((l) => l.productId === id)
        ? ls.map((l) => (l.productId === id ? { ...l, qty: l.qty + 1 } : l))
        : [
            ...ls,
            {
              productId: p.id,
              name: p.name,
              price: p.price,
              qty: 1,
              gst: p.gst,
              discountPct: 0,
            },
          ],
    )
  }

  const addCustomItem = (nameInput?: string) => {
    const name = (nameInput || customName).trim()
    if (!name) return
    const priceNum = Number(customPrice) || 0
    const newLine: InvoiceLine = {
      productId: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name,
      price: toPaise(priceNum),
      qty: Math.max(1, customQty),
      gst: customGst,
      discountPct: 0,
    }
    setLines((ls) => [...ls, newLine])
    setCustomModalOpen(false)
    setCustomName("")
    setCustomPrice("")
    setCustomQty(1)
    setCustomGst(0)
    setQ("")
  }

  const set = (id: string, patch: Partial<InvoiceLine>) =>
    setLines((ls) =>
      ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)).filter(
        (l) => l.qty > 0,
      ),
    )

  const removeLine = (id: string) =>
    setLines((ls) => ls.filter((l) => l.productId !== id))

  const handleSelectCustomer = (cid: string) => {
    setCustomerId(cid)
    if (!cid) {
      setCustName("")
      setCustPhone("")
      setCustAddress("")
    } else {
      const c = s.customers.find((x) => x.id === cid)
      if (c) {
        setCustName(c.name)
        setCustPhone(c.phone)
        setCustAddress(c.address || "")
      }
    }
  }

  const checkout = () => {
    const inv = {
      lines,
      billDiscount: bill.billDiscount,
      total: bill.total,
      tax: bill.cgst + bill.sgst,
      payment,
      customerId: customerId || undefined,
      customerName: custName.trim() || undefined,
      customerPhone: custPhone.trim() || undefined,
      customerAddress: custAddress.trim() || undefined,
    }
    dispatch({ type: "invoice", invoice: inv })
    setReceipt({
      ...inv,
      id: "",
      number: `INV-${String(s.invoices.length + 1).padStart(5, "0")}`,
      at: Date.now(),
    })
    setReceiptStatus(null)
    setLines([])
    setDiscount("")
    setCustomerId("")
    setCustName("")
    setCustPhone("")
    setCustAddress("")
    setShowCustDetails(false)
  }

  // Active customer details for receipt rendering
  const activeCustomer: CustomerInfo = {
    name:
      receipt?.customerName ||
      (receipt?.customerId
        ? s.customers.find((c) => c.id === receipt.customerId)?.name
        : custName),
    phone:
      receipt?.customerPhone ||
      (receipt?.customerId
        ? s.customers.find((c) => c.id === receipt.customerId)?.phone
        : custPhone),
    address: receipt?.customerAddress || custAddress,
  }

  const receiptBill = receipt
    ? calcBill(receipt.lines, receipt.billDiscount)
    : bill

  return (
    <>
      <div className="grid h-[calc(100vh-48px)] grid-cols-[1fr_420px] gap-3">
        {/* Left Column: Product Selection & Custom Item Entry */}
        <div className="flex min-h-0 flex-col">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Icon
                name="search"
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
              />
              <Input
                autoFocus
                placeholder="Search product or scan barcode, Enter to add..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (results[0]) {
                      add(results[0].id)
                      setQ("")
                    } else if (q.trim()) {
                      setCustomName(q.trim())
                      setCustomModalOpen(true)
                    }
                  }
                }}
                className="h-10 pl-9 text-sm"
              />
            </div>

            <Btn
              variant="ghost"
              onClick={() => {
                setCustomName(q.trim())
                setCustomModalOpen(true)
              }}
              className="h-10 border-dashed border-stone-300 text-stone-700 hover:border-stone-400"
            >
              <Icon name="plus" />
              <span>Custom Item</span>
            </Btn>
          </div>

          {/* Quick action button when searching */}
          {q.trim() && (
            <div className="mb-2.5 flex items-center justify-between rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-2 text-xs">
              <span className="text-stone-600">
                Not finding &ldquo;
                <strong className="text-stone-900">{q}</strong>&rdquo; in
                inventory?
              </span>
              <button
                type="button"
                onClick={() => {
                  setCustomName(q.trim())
                  setCustomModalOpen(true)
                }}
                className="font-medium text-stone-900 underline hover:text-stone-700"
              >
                + Add as Custom Item
              </button>
            </div>
          )}

          {s.products.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center">
              <Icon name="box" className="size-8 text-stone-300 mb-2" />
              <div className="text-sm font-semibold text-stone-800">
                Your inventory is empty
              </div>
              <p className="mt-1 max-w-xs text-xs text-stone-500">
                Add products in the Inventory tab or click &ldquo;+ Custom
                Item&rdquo; above to bill items on the fly.
              </p>
              <Btn
                variant="ghost"
                onClick={() => setCustomModalOpen(true)}
                className="mt-3 text-xs"
              >
                <Icon name="plus" /> Add Custom Item
              </Btn>
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-stone-200 bg-white p-6 text-center text-xs text-stone-400">
              <div>No inventory items match &ldquo;{q}&rdquo;</div>
              <button
                type="button"
                onClick={() => {
                  setCustomName(q.trim())
                  setCustomModalOpen(true)
                }}
                className="mt-2 text-xs font-semibold text-stone-800 underline"
              >
                Add &ldquo;{q}&rdquo; as ad-hoc custom item &rarr;
              </button>
            </div>
          ) : (
            <div className="grid min-h-0 grid-cols-3 content-start gap-2 overflow-auto pb-2">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => add(p.id)}
                  disabled={p.stock <= 0}
                  className="rounded-lg border border-stone-200 bg-white p-3 text-left transition hover:border-stone-400 disabled:opacity-40"
                >
                  <div className="text-[13px] font-medium leading-snug line-clamp-2">
                    {p.name}
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-[13px] font-semibold tabular-nums">
                      {fmt(p.price)}
                    </span>
                    <span
                      className={`text-[11px] ${
                        p.stock <= p.reorder
                          ? "text-amber-600 font-medium"
                          : "text-stone-400"
                      }`}
                    >
                      {p.stock} in stock
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Interactive Cart & Checkout Panel */}
        <Card className="flex min-h-0 flex-col">
          {/* Customer Selector & Optional Details (Name, Phone, Address) */}
          <div className="border-b border-stone-100 p-3 space-y-2 bg-stone-50/40">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                Customer (Optional)
              </span>
              <button
                type="button"
                onClick={() => setShowCustDetails((v) => !v)}
                className="text-xs text-stone-600 font-medium hover:text-stone-900 underline"
              >
                {showCustDetails ? "− Hide Details" : "+ Name, Phone & Address"}
              </button>
            </div>

            <select
              value={customerId}
              onChange={(e) => handleSelectCustomer(e.target.value)}
              className={selectCls}
            >
              <option value="">Walk-in Customer</option>
              {s.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </select>

            {/* Optional Customer Inputs */}
            {(showCustDetails || customerId) && (
              <div className="space-y-2 pt-1 border-t border-stone-200/60">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Customer Name (optional)"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="h-7 text-xs"
                  />
                  <Input
                    placeholder="Phone (optional)"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <Input
                  placeholder="Billing / Delivery Address (optional, for warranty & delivery)"
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  className="h-7 text-xs"
                />
              </div>
            )}
          </div>

          {/* Cart Line Items */}
          <div className="min-h-0 flex-1 overflow-auto divide-y divide-stone-100">
            {!lines.length ? (
              <div className="flex h-full flex-col items-center justify-center p-6 text-center text-[13px] text-stone-400">
                <Icon name="bill" className="mb-2 size-6 text-stone-300" />
                <span>Add products or custom items to start bill</span>
                <button
                  type="button"
                  onClick={() => setCustomModalOpen(true)}
                  className="mt-2 text-xs font-medium text-stone-700 underline"
                >
                  + Add Custom Item
                </button>
              </div>
            ) : (
              lines.map((l) => (
                <div
                  key={l.productId}
                  className="px-3 py-2.5 hover:bg-stone-50/50 transition"
                >
                  {/* Item Name Row */}
                  <div className="flex items-start justify-between gap-2 text-[13px]">
                    {editingLineId === l.productId ? (
                      <div className="flex-1 flex gap-1">
                        <input
                          autoFocus
                          value={editingLineName}
                          onChange={(e) => setEditingLineName(e.target.value)}
                          onBlur={() => {
                            if (editingLineName.trim())
                              set(l.productId, { name: editingLineName.trim() })
                            setEditingLineId(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editingLineName.trim())
                                set(l.productId, {
                                  name: editingLineName.trim(),
                                })
                              setEditingLineId(null)
                            }
                          }}
                          className="h-6 w-full rounded border border-stone-300 px-1 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="font-medium text-stone-800 truncate">
                          {l.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingLineId(l.productId)
                            setEditingLineName(l.name)
                          }}
                          title="Rename item"
                          className="text-stone-300 hover:text-stone-600 transition"
                        >
                          <Icon name="edit" className="size-3" />
                        </button>
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums text-stone-900">
                        {fmt(calcLine(l).total)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeLine(l.productId)}
                        title="Remove item"
                        className="text-stone-300 hover:text-red-600 transition"
                      >
                        <Icon name="trash" className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Item Attributes: Qty, Unit Price, GST %, Disc % */}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-stone-600">
                    {/* Quantity Stepper */}
                    <div className="flex items-center rounded border border-stone-200 bg-white">
                      <button
                        className="px-1.5 py-0.5 text-stone-500 hover:bg-stone-100 font-bold"
                        onClick={() => set(l.productId, { qty: l.qty - 1 })}
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={1}
                        value={l.qty}
                        onChange={(e) =>
                          set(l.productId, {
                            qty: Math.max(1, parseInt(e.target.value) || 1),
                          })
                        }
                        className="w-7 text-center tabular-nums text-stone-900 text-xs font-medium outline-none"
                      />
                      <button
                        className="px-1.5 py-0.5 text-stone-500 hover:bg-stone-100 font-bold"
                        onClick={() => set(l.productId, { qty: l.qty + 1 })}
                      >
                        +
                      </button>
                    </div>

                    {/* Configurable Unit Price */}
                    <div
                      className="flex items-center gap-1"
                      title="Unit Price (Editable)"
                    >
                      <span className="text-stone-400">× ₹</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={((l.price || 0) / 100)
                          .toFixed(2)
                          .replace(/\.00$/, "")}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0
                          set(l.productId, { price: toPaise(val) })
                        }}
                        className="h-6 w-16 rounded border border-stone-200 bg-white px-1 text-right tabular-nums text-xs font-semibold text-stone-800 outline-none focus:border-stone-400"
                      />
                    </div>

                    {/* Configurable GST Rate Dropdown */}
                    <select
                      value={l.gst}
                      onChange={(e) =>
                        set(l.productId, { gst: Number(e.target.value) })
                      }
                      className="h-6 rounded border border-stone-200 bg-white px-1 text-[10px] font-medium text-stone-600 outline-none"
                      title="GST Rate"
                    >
                      <option value={0}>0% GST</option>
                      <option value={5}>5% GST</option>
                      <option value={12}>12% GST</option>
                      <option value={18}>18% GST</option>
                      <option value={28}>28% GST</option>
                    </select>

                    {/* Configurable Discount % */}
                    <label className="ml-auto flex items-center gap-1 text-[10px]">
                      <span className="text-stone-400">Disc</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={l.discountPct || ""}
                        placeholder="0"
                        onChange={(e) =>
                          set(l.productId, {
                            discountPct: Math.min(
                              100,
                              Math.max(0, Number(e.target.value)),
                            ),
                          })
                        }
                        className="h-6 w-9 rounded border border-stone-200 bg-white px-1 text-right tabular-nums text-xs outline-none focus:border-stone-400"
                      />
                      <span>%</span>
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Bill Summary and Checkout Action */}
          <div className="space-y-1 border-t border-stone-100 p-3 text-[13px] tabular-nums">
            {[
              ["Subtotal", bill.gross],
              ["Item discounts", -bill.lineDiscount],
              ["CGST", bill.cgst],
              ["SGST", bill.sgst],
            ].map(([k, v]) => (
              <div
                key={k as string}
                className="flex justify-between text-stone-500"
              >
                <span>{k}</span>
                <span>{fmt(v as number)}</span>
              </div>
            ))}

            <div className="flex items-center justify-between text-stone-500">
              <span>Bill discount (₹)</span>
              <input
                type="number"
                min={0}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="h-6 w-20 rounded border border-stone-200 px-1.5 text-right font-medium text-stone-800"
              />
            </div>

            <div className="flex justify-between text-stone-500">
              <span>Round off</span>
              <span>{fmt(bill.roundOff)}</span>
            </div>

            <div className="flex justify-between pt-2 text-[20px] font-semibold text-stone-900 border-t border-stone-100">
              <span>Total</span>
              <span>{fmt(bill.total)}</span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pt-2">
              {(["Cash", "UPI", "Card", "Credit"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPayment(m)}
                  className={`h-8 rounded-md border text-[12px] font-medium transition ${
                    payment === m
                      ? m === "Credit"
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-stone-900 bg-stone-900 text-white"
                      : "border-stone-200 bg-white hover:bg-stone-50 text-stone-700"
                  }`}
                >
                  {m === "Credit" ? "Credit / Udhaar" : m}
                </button>
              ))}
            </div>

            <Btn
              className="mt-2 h-10 w-full justify-center text-sm"
              disabled={!lines.length || bill.total < 0}
              onClick={checkout}
            >
              Charge {fmt(bill.total)}
            </Btn>
          </div>
        </Card>

        {/* Quick Modal: Add Custom Item (Not in Inventory) */}
        {customModalOpen && (
          <Modal
            title="Add Custom / Unlisted Item"
            onClose={() => setCustomModalOpen(false)}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault()
                addCustomItem()
              }}
              className="space-y-3.5"
            >
              <p className="text-xs text-stone-500">
                Add products or services not in your inventory catalog directly
                to the current bill.
              </p>

              <Field label="Item Name / Description *">
                <Input
                  autoFocus
                  required
                  placeholder="e.g. Loose Sugar 1kg, Repair Service, Custom Item"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                />
              </Field>

              <div className="grid grid-cols-3 gap-3">
                <Field label="Unit Price (₹) *">
                  <Input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={customPrice}
                    onChange={(e) => setCustomPrice(e.target.value)}
                  />
                </Field>

                <Field label="Quantity">
                  <Input
                    type="number"
                    min={1}
                    value={customQty}
                    onChange={(e) =>
                      setCustomQty(Math.max(1, parseInt(e.target.value) || 1))
                    }
                  />
                </Field>

                <Field label="GST Rate">
                  <select
                    value={customGst}
                    onChange={(e) => setCustomGst(Number(e.target.value))}
                    className={selectCls}
                  >
                    <option value={0}>0% GST</option>
                    <option value={5}>5% GST</option>
                    <option value={12}>12% GST</option>
                    <option value={18}>18% GST</option>
                    <option value={28}>28% GST</option>
                  </select>
                </Field>
              </div>

              <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                <div className="text-xs text-stone-500">
                  Item Total:{" "}
                  <strong className="text-stone-800">
                    {fmt(toPaise((Number(customPrice) || 0) * customQty))}
                  </strong>
                </div>
                <div className="flex gap-2">
                  <Btn
                    variant="ghost"
                    onClick={() => setCustomModalOpen(false)}
                  >
                    Cancel
                  </Btn>
                  <Btn type="submit">Add to Bill</Btn>
                </div>
              </div>
            </form>
          </Modal>
        )}

        {/* Bill Saved / Completed Dialog */}
        {receipt && (
          <Modal
            title={`Bill Saved · ${receipt.number}`}
            onClose={() => setReceipt(null)}
            className="max-w-xl"
          >
            <div className="space-y-3.5">
              {/* Bill Type Selector: Full Retail & Warranty Bill vs Quick Thermal POS Slip */}
              <div className="flex items-center justify-between rounded-lg bg-stone-100 p-1">
                <span className="text-[11px] font-semibold text-stone-600 pl-2">
                  Bill Style:
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setBillFormat("style1")}
                    className={`rounded px-3 py-1 text-xs font-medium transition ${
                      billFormat === "style1"
                        ? "bg-white text-stone-900 shadow-xs font-semibold"
                        : "text-stone-500 hover:text-stone-900"
                    }`}
                  >
                    Style 1
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillFormat("style2")}
                    className={`rounded px-3 py-1 text-xs font-medium transition ${
                      billFormat === "style2"
                        ? "bg-white text-stone-900 shadow-xs font-semibold"
                        : "text-stone-500 hover:text-stone-900"
                    }`}
                  >
                    Style 2
                  </button>
                </div>
              </div>

              {/* On-screen Preview of the bill */}
              <div className="rounded-xl border border-dashed border-stone-300 bg-white p-4 max-h-72 overflow-y-auto">
                {billFormat === "style1" ? (
                  // STYLE 1 PREVIEW
                  <div className="text-xs space-y-2.5">
                    <div className="flex justify-between items-start border-b border-stone-200 pb-2">
                      <div>
                        <div className="font-bold text-sm text-stone-900">
                          {s.shop.name || "Retail Store"}
                        </div>
                        {s.shop.address && (
                          <div className="text-[11px] text-stone-500">
                            {s.shop.address}
                          </div>
                        )}
                        {s.shop.phone && (
                          <div className="text-[11px] text-stone-500">
                            Ph: {s.shop.phone}
                          </div>
                        )}
                        {s.shop.gstin && (
                          <div className="text-[11px] text-stone-500 font-mono">
                            GSTIN: {s.shop.gstin}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <Badge tone="stone">TAX INVOICE</Badge>
                        <div className="font-mono font-bold text-xs mt-1">
                          {receipt.number}
                        </div>
                        <div className="text-[10px] text-stone-400">
                          {new Date(receipt.at).toLocaleString("en-IN")}
                        </div>
                      </div>
                    </div>

                    {/* Customer Box */}
                    <div className="rounded border border-stone-200 bg-stone-50 p-2 text-[11px] flex justify-between">
                      <div>
                        <span className="font-semibold text-stone-700">
                          Billed To:{" "}
                        </span>
                        <span>{activeCustomer.name || "Walk-in Customer"}</span>
                        {activeCustomer.phone && (
                          <span> ({activeCustomer.phone})</span>
                        )}
                      </div>
                      {activeCustomer.address && (
                        <div
                          className="text-stone-500 truncate max-w-[200px]"
                          title={activeCustomer.address}
                        >
                          {activeCustomer.address}
                        </div>
                      )}
                    </div>

                    {/* Table */}
                    <table className="w-full text-left font-mono text-[11px]">
                      <thead>
                        <tr className="border-b border-stone-300 text-stone-600">
                          <th className="py-1">Item</th>
                          <th className="text-center py-1">Qty</th>
                          <th className="text-right py-1">Rate</th>
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {receipt.lines.map((l, i) => (
                          <tr key={i}>
                            <td className="py-1">{l.name}</td>
                            <td className="text-center py-1">{l.qty}</td>
                            <td className="text-right py-1">
                              ₹{(l.price / 100).toFixed(2)}
                            </td>
                            <td className="text-right py-1 font-semibold">
                              ₹{(calcLine(l).total / 100).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="border-t border-stone-200 pt-1.5 flex justify-between font-mono text-[11px]">
                      <span>
                        Tax (CGST+SGST): ₹
                        {((receiptBill.cgst + receiptBill.sgst) / 100).toFixed(
                          2,
                        )}
                      </span>
                      <span className="font-bold text-xs text-stone-900">
                        TOTAL ({receipt.payment}): ₹
                        {(receiptBill.total / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ) : (
                  // STYLE 2 (SLIP) PREVIEW
                  <div className="text-center font-mono text-[11px] space-y-1">
                    <div className="font-bold text-xs text-stone-900">
                      {s.shop.name || "Store"}
                    </div>
                    {s.shop.phone && (
                      <div className="text-[10px] text-stone-500">
                        Ph: {s.shop.phone}
                      </div>
                    )}
                    <div className="text-[10px] text-stone-400">
                      {receipt.number} ·{" "}
                      {new Date(receipt.at).toLocaleDateString("en-IN")}
                    </div>
                    {activeCustomer.name &&
                      activeCustomer.name !== "Walk-in Customer" && (
                        <div className="text-[10px] text-stone-600">
                          Customer: {activeCustomer.name} (
                          {activeCustomer.phone})
                        </div>
                      )}
                    <div className="my-1 border-t border-dashed border-stone-300" />
                    {receipt.lines.map((l, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span>
                          {l.qty}x {l.name}
                        </span>
                        <span>₹{(calcLine(l).total / 100).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="my-1 border-t border-dashed border-stone-300" />
                    <div className="flex justify-between font-bold text-xs">
                      <span>TOTAL ({receipt.payment})</span>
                      <span>₹{(receiptBill.total / 100).toFixed(2)}</span>
                    </div>
                    <div className="text-[10px] text-stone-400 pt-1 italic">
                      Thank you for visiting!
                    </div>
                  </div>
                )}
              </div>

              {receiptStatus && (
                <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs text-emerald-800 flex items-center justify-between">
                  <span>{receiptStatus}</span>
                  <span className="text-[10px] text-emerald-600">
                    Downloads Folder
                  </span>
                </div>
              )}

              {/* Action Buttons: PDF Download, Print Bill, ESC/POS, Digital Dispatch */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3">
                <div className="flex items-center gap-2">
                  {/* 1. Download Bill as PDF */}
                  <Btn
                    variant="ghost"
                    onClick={() => {
                      const fname = downloadInvoicePDF(
                        receipt,
                        s.shop,
                        activeCustomer,
                        billFormat,
                      )
                      setReceiptStatus(
                        `✓ Saved ${fname} to your Downloads folder`,
                      )
                    }}
                    className="text-stone-800"
                  >
                    <Icon name="download" />
                    <span>Download PDF</span>
                  </Btn>

                  {/* 2. Download Bill as Image */}
                  <Btn
                    variant="ghost"
                    onClick={async () => {
                      const fname = await downloadInvoiceImage(
                        receipt,
                        s.shop,
                        activeCustomer,
                        billFormat,
                      )
                      setReceiptStatus(
                        `✓ Saved ${fname} to your Downloads folder`,
                      )
                    }}
                    className="text-stone-800"
                  >
                    <Icon name="download" />
                    <span>Save Image</span>
                  </Btn>

                  {/* 3. Direct Print - Prints strictly the bill without any UI */}
                  <Btn
                    variant="ghost"
                    onClick={() => window.print()}
                    className="text-stone-800 font-semibold"
                  >
                    <Icon name="print" />
                    <span>
                      Print {billFormat === "style1" ? "Style 1" : "Style 2"}
                    </span>
                  </Btn>
                </div>

                <div className="flex items-center gap-2">
                  {/* Copy Image Button */}
                  <Btn
                    variant="ghost"
                    onClick={async () => {
                      const ok = await copyInvoiceImageToClipboard(
                        receipt,
                        s.shop,
                        activeCustomer,
                        billFormat,
                      )
                      if (ok) {
                        setReceiptStatus(
                          "📋 Bill image copied to clipboard! Paste anywhere (Ctrl+V)",
                        )
                      }
                    }}
                    className="text-stone-700 text-xs"
                    title="Copy bill picture to clipboard"
                  >
                    Copy Image
                  </Btn>

                  {receipt.customerId || activeCustomer.phone ? (
                    <>
                      <Btn
                        variant="ghost"
                        onClick={async () => {
                          const phone =
                            activeCustomer.phone ||
                            (receipt.customerId
                              ? s.customers.find(
                                  (c) => c.id === receipt.customerId,
                                )?.phone
                              : "")
                          const name = activeCustomer.name || "Customer"
                          if (phone) {
                            setReceiptStatus(
                              "Rendering bill image & opening WhatsApp...",
                            )
                            const copied = await copyInvoiceImageToClipboard(
                              receipt,
                              s.shop,
                              activeCustomer,
                              billFormat,
                            )
                            const msg = `Namaste ${name}! Your bill from ${s.shop.name || "our store"} is ready.\nBill: ${receipt.number}\nTotal: ${fmt(receipt.total)} (${receipt.payment})\nThank you for shopping with us!`
                            openWhatsAppLink(phone, msg)
                            if (copied) {
                              setReceiptStatus(
                                "📋 Bill image copied to clipboard! Just press Ctrl+V in WhatsApp to send image.",
                              )
                            } else {
                              setReceiptStatus("Opened in WhatsApp!")
                            }
                          } else {
                            setReceiptStatus(
                              "⚠️ No customer phone number available.",
                            )
                          }
                        }}
                        className="text-emerald-700 hover:text-emerald-800 font-semibold"
                        title="Copies bill image to clipboard & opens WhatsApp"
                      >
                        <Icon name="send" /> WhatsApp (Image)
                      </Btn>

                      <Btn
                        variant="ghost"
                        onClick={async () => {
                          const phone =
                            activeCustomer.phone ||
                            (receipt.customerId
                              ? s.customers.find(
                                  (c) => c.id === receipt.customerId,
                                )?.phone
                              : "")
                          const name = activeCustomer.name || "Customer"
                          if (phone) {
                            setReceiptStatus("Sending SMS receipt...")
                            const res = await sendInvoiceReceipt(
                              receipt.id,
                              phone,
                              "sms",
                              name,
                            )
                            if (res.ok && res.results?.sms?.ok) {
                              setReceiptStatus("SMS receipt delivered!")
                            } else {
                              setReceiptStatus(
                                res.results?.sms?.error ||
                                  "SMS failed. Check gateway config.",
                              )
                            }
                          } else {
                            setReceiptStatus(
                              "⚠️ No customer phone number available.",
                            )
                          }
                        }}
                      >
                        SMS
                      </Btn>
                    </>
                  ) : onOpenMessaging ? (
                    <button
                      type="button"
                      onClick={onOpenMessaging}
                      className="text-xs text-stone-500 hover:text-stone-900 underline"
                    >
                      Configure Messaging
                    </button>
                  ) : null}

                  <Btn onClick={() => setReceipt(null)}>New Bill</Btn>
                </div>
              </div>
            </div>
          </Modal>
        )}
      </div>

      {/* 
        ======================================================================
        DEDICATED PRINT CONTAINER (#printable-bill)
        Rendered outside all modals so that window.print() prints ONLY this
        clean paper invoice with ZERO website UI, zero buttons, and zero chrome!
        ======================================================================
      */}
      {receipt && (
        <div id="printable-bill" className="hidden print:block p-6">
          {billFormat === "style1" ? (
            // ==========================================
            // STYLE 1: DETAILED TAX INVOICE (A4)
            // ==========================================
            <div className="max-w-[760px] mx-auto border border-black p-6 font-sans text-black">
              {/* Header */}
              <div className="flex justify-between items-start border-b-2 border-black pb-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {s.shop.name || "Retail Showroom"}
                  </h1>
                  {s.shop.address && (
                    <p className="text-xs text-gray-700 mt-1">
                      {s.shop.address}
                    </p>
                  )}
                  <div className="text-xs text-gray-700 mt-0.5 space-x-3">
                    {s.shop.phone && <span>Phone: {s.shop.phone}</span>}
                    {s.shop.gstin && (
                      <span className="font-mono font-semibold">
                        GSTIN: {s.shop.gstin}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block border border-black px-2 py-0.5 text-xs font-bold uppercase tracking-wider">
                    TAX INVOICE
                  </span>
                  <div className="text-sm font-bold font-mono mt-1">
                    {receipt.number}
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(receipt.at).toLocaleString("en-IN")}
                  </div>
                  <div className="text-xs font-semibold mt-0.5">
                    Mode: {receipt.payment}
                  </div>
                </div>
              </div>

              {/* Billed To / Customer Box */}
              <div className="border border-black my-4 p-3 text-xs grid grid-cols-2 gap-4 bg-gray-50/50">
                <div>
                  <div className="font-bold uppercase text-[10px] text-gray-500 mb-0.5">
                    Customer Details:
                  </div>
                  <div className="font-semibold text-sm">
                    {activeCustomer.name || "Walk-in Customer"}
                  </div>
                  {activeCustomer.phone && (
                    <div className="text-xs text-gray-700">
                      Phone: {activeCustomer.phone}
                    </div>
                  )}
                </div>
                <div>
                  <div className="font-bold uppercase text-[10px] text-gray-500 mb-0.5">
                    Delivery / Billing Address:
                  </div>
                  <div className="text-xs text-gray-700">
                    {activeCustomer.address || "Over the counter delivery"}
                  </div>
                </div>
              </div>

              {/* Line Items Table */}
              <table className="w-full border-collapse border border-black my-3 text-xs">
                <thead>
                  <tr className="bg-gray-100 border-b border-black text-left font-bold">
                    <th className="border border-black p-1.5 w-10 text-center">
                      S.No
                    </th>
                    <th className="border border-black p-1.5">
                      Product / Item Description
                    </th>
                    <th className="border border-black p-1.5 text-center w-16">
                      Qty
                    </th>
                    <th className="border border-black p-1.5 text-right w-24">
                      Rate (₹)
                    </th>
                    <th className="border border-black p-1.5 text-right w-20">
                      GST %
                    </th>
                    <th className="border border-black p-1.5 text-right w-28">
                      Amount (₹)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {receipt.lines.map((l, idx) => {
                    const cl = calcLine(l)
                    return (
                      <tr key={idx} className="border-b border-gray-300">
                        <td className="border border-black p-1.5 text-center">
                          {idx + 1}
                        </td>
                        <td className="border border-black p-1.5 font-medium">
                          {l.name}
                        </td>
                        <td className="border border-black p-1.5 text-center">
                          {l.qty}
                        </td>
                        <td className="border border-black p-1.5 text-right tabular-nums">
                          ₹{(l.price / 100).toFixed(2)}
                        </td>
                        <td className="border border-black p-1.5 text-right tabular-nums">
                          {l.gst}%
                        </td>
                        <td className="border border-black p-1.5 text-right font-semibold tabular-nums">
                          ₹{(cl.total / 100).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>

              {/* Totals & Calculations */}
              <div className="flex justify-between items-start my-4 text-xs">
                <div className="max-w-xs space-y-1">
                  <div className="text-[11px]">
                    <strong>Amount in Words: </strong>
                    <span className="italic">
                      {paiseToWords(receiptBill.total)}
                    </span>
                  </div>
                </div>

                <div className="w-64 border border-black p-2.5 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Taxable Amount:</span>
                    <span className="tabular-nums">
                      ₹{(receiptBill.taxable / 100).toFixed(2)}
                    </span>
                  </div>
                  {receiptBill.billDiscount > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Discount:</span>
                      <span className="tabular-nums">
                        -₹{(receiptBill.billDiscount / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>CGST:</span>
                    <span className="tabular-nums">
                      ₹{(receiptBill.cgst / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST:</span>
                    <span className="tabular-nums">
                      ₹{(receiptBill.sgst / 100).toFixed(2)}
                    </span>
                  </div>
                  {receiptBill.roundOff !== 0 && (
                    <div className="flex justify-between">
                      <span>Round Off:</span>
                      <span className="tabular-nums">
                        ₹{(receiptBill.roundOff / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm border-t-2 border-black pt-1">
                    <span>Grand Total:</span>
                    <span className="tabular-nums">
                      ₹{(receiptBill.total / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures (Authorised Signatory only - customer signature removed) */}
              <div className="flex justify-end items-end pt-10 text-xs">
                <div className="text-center w-52">
                  {s.shop.signature ? (
                    <img
                      src={s.shop.signature}
                      alt="Sign"
                      className="h-8 max-w-[140px] mx-auto mb-1 object-contain"
                    />
                  ) : (
                    <div className="h-8" />
                  )}
                  <div className="border-t border-black pt-1 font-bold">
                    Authorised Signatory
                  </div>
                  <div className="text-[10px] text-gray-500">
                    {s.shop.name || "Store Management"}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // ==========================================
            // STYLE 2: COMPACT THERMAL POS SLIP (80mm / 58mm)
            // ==========================================
            <div className="max-w-[300px] mx-auto text-black font-mono text-[11px] leading-tight text-center">
              <div className="font-bold text-sm">{s.shop.name || "Store"}</div>
              {s.shop.address && (
                <div className="text-[10px]">{s.shop.address}</div>
              )}
              {s.shop.phone && (
                <div className="text-[10px]">Ph: {s.shop.phone}</div>
              )}
              {s.shop.gstin && (
                <div className="text-[10px]">GSTIN: {s.shop.gstin}</div>
              )}
              <div className="text-[10px] mt-1">
                {receipt.number} ·{" "}
                {new Date(receipt.at).toLocaleString("en-IN")}
              </div>

              {activeCustomer.name &&
                activeCustomer.name !== "Walk-in Customer" && (
                  <div className="text-[10px] mt-1 text-left border-t border-dashed border-black pt-1">
                    Customer: <b>{activeCustomer.name}</b>{" "}
                    {activeCustomer.phone ? `(${activeCustomer.phone})` : ""}
                    {activeCustomer.address && (
                      <div>Addr: {activeCustomer.address}</div>
                    )}
                  </div>
                )}

              <div className="border-t border-dashed border-black my-1.5" />

              <div className="space-y-1 text-left">
                {receipt.lines.map((l, i) => {
                  const cl = calcLine(l)
                  return (
                    <div key={i} className="flex justify-between">
                      <span>
                        {l.qty}x {l.name}
                      </span>
                      <span className="tabular-nums">
                        ₹{(cl.total / 100).toFixed(2)}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="border-t border-dashed border-black my-1.5" />

              <div className="space-y-0.5 text-left text-[10px]">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>
                    ₹
                    {(
                      (receiptBill.total -
                        receiptBill.cgst -
                        receiptBill.sgst) /
                      100
                    ).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>GST (CGST+SGST):</span>
                  <span>
                    ₹{((receiptBill.cgst + receiptBill.sgst) / 100).toFixed(2)}
                  </span>
                </div>
                {receiptBill.billDiscount > 0 && (
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>-₹{(receiptBill.billDiscount / 100).toFixed(2)}</span>
                  </div>
                )}
              </div>

              <div className="border-t-2 border-black my-1.5" />

              <div className="flex justify-between font-bold text-xs text-left">
                <span>TOTAL ({receipt.payment}):</span>
                <span>₹{(receiptBill.total / 100).toFixed(2)}</span>
              </div>

              {s.shop.signature && (
                <div className="my-2 flex flex-col items-end">
                  <img
                    src={s.shop.signature}
                    alt="Sign"
                    className="h-6 max-w-[90px] object-contain"
                  />
                  <span className="text-[8px] text-gray-500">Signatory</span>
                </div>
              )}

              <div className="text-[10px] mt-3 text-center">
                <div>Thank you for shopping with us!</div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
