import { useState, useMemo } from "react"
import { Action, Invoice, State } from "../lib/store"
import { calcBill, calcLine, fmt, toPaise } from "../lib/money"
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
import { deleteInvoice, updateInvoice, openWhatsAppLink } from "../lib/api"
import { downloadInvoicePDF, paiseToWords, CustomerInfo } from "../lib/pdf"
import {
  copyInvoiceImageToClipboard,
  downloadInvoiceImage,
} from "../lib/billImage"

export default function Invoices({
  s,
  dispatch,
}: {
  s: State
  dispatch: (a: Action) => void
}) {
  const [q, setQ] = useState("")
  const [paymentFilter, setPaymentFilter] =
    useState<"ALL" | Invoice["payment"]>("ALL")
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null)
  const [billFormat, setBillFormat] = useState<"style1" | "style2">("style1")
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  // Edit form state
  const [editForm, setEditForm] = useState<{
    customerName: string
    customerPhone: string
    customerAddress: string
    payment: Invoice["payment"]
  }>({
    customerName: "",
    customerPhone: "",
    customerAddress: "",
    payment: "Cash",
  })

  // Filtered invoices
  const filtered = useMemo(() => {
    return s.invoices
      .filter((inv) => {
        if (paymentFilter !== "ALL" && inv.payment !== paymentFilter)
          return false
        if (!q.trim()) return true
        const query = q.toLowerCase()
        const matchesNum = inv.number.toLowerCase().includes(query)
        const matchesCust = (inv.customerName || "")
          .toLowerCase()
          .includes(query)
        const matchesPhone = (inv.customerPhone || "")
          .toLowerCase()
          .includes(query)
        const matchesAddr = (inv.customerAddress || "")
          .toLowerCase()
          .includes(query)
        const matchesItem = inv.lines.some((l) =>
          l.name.toLowerCase().includes(query),
        )
        return (
          matchesNum ||
          matchesCust ||
          matchesPhone ||
          matchesAddr ||
          matchesItem
        )
      })
      .sort((a, b) => b.at - a.at)
  }, [s.invoices, q, paymentFilter])

  // Summary Metrics
  const totalBilled = s.invoices.reduce((sum, i) => sum + i.total, 0)
  const totalPaid = s.invoices
    .filter((i) => i.payment !== "Credit")
    .reduce((sum, i) => sum + i.total, 0)
  const totalCredit = s.invoices
    .filter((i) => i.payment === "Credit")
    .reduce((sum, i) => sum + i.total, 0)

  const handleOpenEdit = (inv: Invoice) => {
    setEditingInvoice(inv)
    setEditForm({
      customerName:
        inv.customerName ||
        (inv.customerId
          ? s.customers.find((c) => c.id === inv.customerId)?.name || ""
          : ""),
      customerPhone:
        inv.customerPhone ||
        (inv.customerId
          ? s.customers.find((c) => c.id === inv.customerId)?.phone || ""
          : ""),
      customerAddress:
        inv.customerAddress ||
        (inv.customerId
          ? s.customers.find((c) => c.id === inv.customerId)?.address || ""
          : ""),
      payment: inv.payment,
    })
  }

  const handleSaveEdit = async () => {
    if (!editingInvoice) return
    const patch = {
      customerName: editForm.customerName.trim(),
      customerPhone: editForm.customerPhone.trim(),
      customerAddress: editForm.customerAddress.trim(),
      payment: editForm.payment,
    }
    dispatch({ type: "updateInvoice", id: editingInvoice.id, patch })
    try {
      await updateInvoice(editingInvoice.id, patch)
    } catch {
      // offline fallback
    }
    // Update active modal if open
    if (selectedInvoice && selectedInvoice.id === editingInvoice.id) {
      setSelectedInvoice({ ...selectedInvoice, ...patch })
    }
    setEditingInvoice(null)
    setStatusMsg(`✓ Invoice ${editingInvoice.number} updated successfully`)
    setTimeout(() => setStatusMsg(null), 3500)
  }

  const handleDelete = async (inv: Invoice) => {
    const confirm = window.confirm(
      `Delete invoice ${inv.number}? This will permanently remove the bill and automatically return all ${inv.lines.reduce(
        (sum, l) => sum + l.qty,
        0,
      )} items back into inventory stock.`,
    )
    if (!confirm) return

    dispatch({ type: "deleteInvoice", id: inv.id })
    try {
      await deleteInvoice(inv.id)
    } catch {
      // offline fallback
    }
    if (selectedInvoice?.id === inv.id) setSelectedInvoice(null)
    if (editingInvoice?.id === inv.id) setEditingInvoice(null)
    setStatusMsg(`✓ Invoice ${inv.number} deleted and stock restored`)
    setTimeout(() => setStatusMsg(null), 3500)
  }

  const activeCustomer: CustomerInfo = selectedInvoice
    ? {
        name:
          selectedInvoice.customerName ||
          (selectedInvoice.customerId
            ? s.customers.find((c) => c.id === selectedInvoice.customerId)?.name
            : ""),
        phone:
          selectedInvoice.customerPhone ||
          (selectedInvoice.customerId
            ? s.customers.find((c) => c.id === selectedInvoice.customerId)
                ?.phone
            : ""),
        address:
          selectedInvoice.customerAddress ||
          (selectedInvoice.customerId
            ? s.customers.find((c) => c.id === selectedInvoice.customerId)
                ?.address
            : ""),
      }
    : {}

  const activeBill = selectedInvoice
    ? calcBill(selectedInvoice.lines, selectedInvoice.billDiscount)
    : null

  return (
    <>
      <PageHead
        title="Bills & History"
        sub={`${s.invoices.length} total bills · Manage receipts, edit records, re-print or download PDFs`}
      />

      {/* Top Metric Cards */}
      <div className="mb-4 grid grid-cols-4 gap-3">
        <Card className="p-3.5">
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
            Total Bills Issued
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
            {s.invoices.length}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Lifetime transactions
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="text-[11px] font-medium text-stone-500 uppercase tracking-wider">
            Total Billed
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-stone-900">
            {fmt(totalBilled)}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Gross bill revenue
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="text-[11px] font-medium text-emerald-600 uppercase tracking-wider">
            Settled (Paid)
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">
            {fmt(totalPaid)}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            Cash, UPI & Card
          </div>
        </Card>
        <Card className="p-3.5">
          <div className="text-[11px] font-medium text-amber-600 uppercase tracking-wider">
            Pending Udhaar
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-amber-700">
            {fmt(totalCredit)}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5">
            {s.invoices.filter((i) => i.payment === "Credit").length} credit
            bills
          </div>
        </Card>
      </div>

      {statusMsg && (
        <div className="mb-3 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center justify-between">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-emerald-600 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Search and Filter Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          />
          <Input
            placeholder="Search by bill #, customer name, phone, address, or item..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-lg">
          {(["ALL", "Cash", "UPI", "Card", "Credit"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPaymentFilter(m)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                paymentFilter === m
                  ? "bg-white text-stone-900 shadow-xs font-semibold"
                  : "text-stone-500 hover:text-stone-800"
              }`}
            >
              {m === "ALL"
                ? "All Modes"
                : m === "Credit"
                  ? "Udhaar (Credit)"
                  : m}
            </button>
          ))}
        </div>
      </div>

      {/* Invoices Data Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-stone-100 text-left text-[12px] text-stone-500">
                <th className="px-4 py-2.5 font-normal">Bill Number</th>
                <th className="px-4 py-2.5 font-normal">Date & Time</th>
                <th className="px-4 py-2.5 font-normal">Customer</th>
                <th className="px-4 py-2.5 font-normal">Items</th>
                <th className="px-4 py-2.5 font-normal text-right">
                  Grand Total
                </th>
                <th className="px-4 py-2.5 font-normal">Payment</th>
                <th className="px-4 py-2.5 font-normal text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((inv) => {
                const custName =
                  inv.customerName ||
                  (inv.customerId
                    ? s.customers.find((c) => c.id === inv.customerId)?.name
                    : "") ||
                  "Walk-in Customer"
                const custPhone =
                  inv.customerPhone ||
                  (inv.customerId
                    ? s.customers.find((c) => c.id === inv.customerId)?.phone
                    : "")
                const itemsCount = inv.lines.reduce((acc, l) => acc + l.qty, 0)

                return (
                  <tr key={inv.id} className="hover:bg-stone-50/60 transition">
                    <td className="px-4 py-2.5 font-mono font-medium text-stone-900">
                      <button
                        type="button"
                        onClick={() => setSelectedInvoice(inv)}
                        className="hover:underline text-stone-900 font-semibold"
                      >
                        {inv.number}
                      </button>
                    </td>
                    <td className="px-4 text-stone-500 text-xs">
                      {new Date(inv.at).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4">
                      <div className="font-medium text-stone-800">
                        {custName}
                      </div>
                      {custPhone && (
                        <div className="text-[11px] text-stone-400 tabular-nums">
                          {custPhone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 text-stone-600 text-xs">
                      {itemsCount} {itemsCount === 1 ? "item" : "items"}
                    </td>
                    <td className="px-4 text-right tabular-nums font-semibold text-stone-900">
                      {fmt(inv.total)}
                    </td>
                    <td className="px-4">
                      {inv.payment === "Credit" ? (
                        <Badge tone="amber">Credit (Udhaar)</Badge>
                      ) : inv.payment === "Cash" ? (
                        <Badge tone="green">Cash</Badge>
                      ) : inv.payment === "UPI" ? (
                        <Badge tone="blue">UPI</Badge>
                      ) : (
                        <Badge tone="stone">Card</Badge>
                      )}
                    </td>
                    <td className="px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Btn
                          variant="ghost"
                          onClick={() => setSelectedInvoice(inv)}
                          className="h-7 px-2 text-xs text-stone-700"
                          title="View & Print Bill"
                        >
                          <Icon name="receipt" className="size-3.5" />
                          <span>View</span>
                        </Btn>
                        <Btn
                          variant="ghost"
                          onClick={() => handleOpenEdit(inv)}
                          className="h-7 px-2 text-xs text-stone-700"
                          title="Edit Customer & Payment Details"
                        >
                          <Icon name="edit" className="size-3.5" />
                          <span>Edit</span>
                        </Btn>
                        <Btn
                          variant="ghost"
                          onClick={() => handleDelete(inv)}
                          className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 hover:border-red-200"
                          title="Delete Bill & Restore Stock"
                        >
                          <Icon name="trash" className="size-3.5" />
                        </Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}

              {!filtered.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-12 text-center text-xs text-stone-400"
                  >
                    <div className="font-medium text-stone-700 mb-1">
                      {q.trim()
                        ? `No bills found matching "${q}"`
                        : "No bills in system yet"}
                    </div>
                    <div>
                      Create your first bill under &ldquo;New bill&rdquo; to
                      start tracking records here.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Bill Details Modal */}
      {selectedInvoice && activeBill && (
        <Modal
          title={`Bill Details · ${selectedInvoice.number}`}
          onClose={() => setSelectedInvoice(null)}
          className="max-w-2xl"
        >
          <div className="space-y-3.5">
            {/* Style Selector */}
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

            {/* Bill Preview Container */}
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-4 max-h-80 overflow-y-auto">
              {billFormat === "style1" ? (
                // Style 1 Preview
                <div className="text-xs space-y-2.5">
                  <div className="flex justify-between items-start border-b border-stone-200 pb-2">
                    <div>
                      <div className="font-bold text-sm text-stone-900">
                        {s.shop.name || "Store"}
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
                        {selectedInvoice.number}
                      </div>
                      <div className="text-[10px] text-stone-400">
                        {new Date(selectedInvoice.at).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>

                  {/* Customer Details Box */}
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
                        className="text-stone-500 truncate max-w-[220px]"
                        title={activeCustomer.address}
                      >
                        {activeCustomer.address}
                      </div>
                    )}
                  </div>

                  {/* Line items table */}
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead>
                      <tr className="border-b border-stone-300 text-stone-600">
                        <th className="py-1">Item</th>
                        <th className="text-center py-1">Qty</th>
                        <th className="text-right py-1">Rate</th>
                        <th className="text-right py-1">GST</th>
                        <th className="text-right py-1">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {selectedInvoice.lines.map((l, i) => (
                        <tr key={i}>
                          <td className="py-1">{l.name}</td>
                          <td className="text-center py-1">{l.qty}</td>
                          <td className="text-right py-1">
                            ₹{(l.price / 100).toFixed(2)}
                          </td>
                          <td className="text-right py-1">{l.gst}%</td>
                          <td className="text-right py-1 font-semibold">
                            ₹{(calcLine(l).total / 100).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="border-t border-stone-200 pt-2 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-stone-600">
                      <span>
                        Taxable: ₹{(activeBill.taxable / 100).toFixed(2)}
                      </span>
                      <span>CGST: ₹{(activeBill.cgst / 100).toFixed(2)}</span>
                      <span>SGST: ₹{(activeBill.sgst / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-xs text-stone-900 border-t border-stone-200 pt-1">
                      <span>TOTAL ({selectedInvoice.payment}):</span>
                      <span>₹{(activeBill.total / 100).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                // Style 2 Preview
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
                    {selectedInvoice.number} ·{" "}
                    {new Date(selectedInvoice.at).toLocaleDateString("en-IN")}
                  </div>
                  {activeCustomer.name &&
                    activeCustomer.name !== "Walk-in Customer" && (
                      <div className="text-[10px] text-stone-600">
                        Customer: {activeCustomer.name} ({activeCustomer.phone})
                      </div>
                    )}
                  <div className="my-1 border-t border-dashed border-stone-300" />
                  {selectedInvoice.lines.map((l, i) => (
                    <div key={i} className="flex justify-between text-[11px]">
                      <span>
                        {l.qty}x {l.name}
                      </span>
                      <span>₹{(calcLine(l).total / 100).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="my-1 border-t border-dashed border-stone-300" />
                  <div className="flex justify-between font-bold text-xs">
                    <span>TOTAL ({selectedInvoice.payment})</span>
                    <span>₹{(activeBill.total / 100).toFixed(2)}</span>
                  </div>
                  <div className="text-[10px] text-stone-400 pt-1 italic">
                    Thank you for visiting!
                  </div>
                </div>
              )}
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 pt-3">
              <div className="flex items-center gap-2">
                <Btn
                  variant="ghost"
                  onClick={() => {
                    const fname = downloadInvoicePDF(
                      selectedInvoice,
                      s.shop,
                      activeCustomer,
                      billFormat,
                    )
                    setStatusMsg(`✓ Saved ${fname} to your Downloads folder`)
                  }}
                  className="text-stone-800"
                >
                  <Icon name="download" />
                  <span>Download PDF</span>
                </Btn>

                <Btn
                  variant="ghost"
                  onClick={async () => {
                    const fname = await downloadInvoiceImage(
                      selectedInvoice,
                      s.shop,
                      activeCustomer,
                      billFormat,
                    )
                    setStatusMsg(`✓ Saved ${fname} to your Downloads folder`)
                  }}
                  className="text-stone-800"
                >
                  <Icon name="download" />
                  <span>Save Image</span>
                </Btn>

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
                <Btn
                  variant="ghost"
                  onClick={async () => {
                    const ok = await copyInvoiceImageToClipboard(
                      selectedInvoice,
                      s.shop,
                      activeCustomer,
                      billFormat,
                    )
                    if (ok) {
                      setStatusMsg(
                        "📋 Bill image copied to clipboard! Paste anywhere (Ctrl+V)",
                      )
                    }
                  }}
                  className="text-stone-700 text-xs"
                  title="Copy bill image to clipboard"
                >
                  Copy Image
                </Btn>

                {activeCustomer.phone && (
                  <Btn
                    variant="ghost"
                    onClick={async () => {
                      const phone = activeCustomer.phone!
                      const name = activeCustomer.name || "Customer"
                      setStatusMsg("Rendering bill image & opening WhatsApp...")
                      const copied = await copyInvoiceImageToClipboard(
                        selectedInvoice,
                        s.shop,
                        activeCustomer,
                        billFormat,
                      )
                      const msg = `Namaste ${name}! Your bill from ${s.shop.name || "our store"} is ready.\nBill: ${selectedInvoice.number}\nTotal: ${fmt(selectedInvoice.total)} (${selectedInvoice.payment})\nThank you for shopping with us!`
                      openWhatsAppLink(phone, msg)
                      if (copied) {
                        setStatusMsg(
                          "📋 Bill image copied to clipboard! Just press Ctrl+V in WhatsApp to send image.",
                        )
                      }
                    }}
                    className="text-emerald-700 hover:text-emerald-800 font-semibold text-xs"
                    title="Copy bill picture to clipboard & open WhatsApp"
                  >
                    <Icon name="send" />
                    <span>WhatsApp (Image)</span>
                  </Btn>
                )}

                <Btn
                  variant="ghost"
                  onClick={() => handleOpenEdit(selectedInvoice)}
                  className="text-stone-700"
                >
                  <Icon name="edit" />
                  <span>Edit Details</span>
                </Btn>
                <Btn
                  variant="danger"
                  onClick={() => handleDelete(selectedInvoice)}
                >
                  <Icon name="trash" />
                  <span>Delete Bill</span>
                </Btn>
                <Btn onClick={() => setSelectedInvoice(null)}>Close</Btn>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Invoice Modal */}
      {editingInvoice && (
        <Modal
          title={`Edit Bill · ${editingInvoice.number}`}
          onClose={() => setEditingInvoice(null)}
        >
          <div className="space-y-3">
            <Field label="Customer Name">
              <Input
                placeholder="Walk-in Customer"
                value={editForm.customerName}
                onChange={(e) =>
                  setEditForm({ ...editForm, customerName: e.target.value })
                }
              />
            </Field>

            <Field label="Customer Phone">
              <Input
                placeholder="Mobile number"
                value={editForm.customerPhone}
                onChange={(e) =>
                  setEditForm({ ...editForm, customerPhone: e.target.value })
                }
              />
            </Field>

            <Field label="Customer Address">
              <Input
                placeholder="Billing / Delivery address"
                value={editForm.customerAddress}
                onChange={(e) =>
                  setEditForm({ ...editForm, customerAddress: e.target.value })
                }
              />
            </Field>

            <Field label="Payment Method">
              <select
                value={editForm.payment}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    payment: e.target.value as Invoice["payment"],
                  })
                }
                className={selectCls}
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
                <option value="Credit">Credit (Udhaar / Unpaid)</option>
              </select>
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Btn variant="ghost" onClick={() => setEditingInvoice(null)}>
                Cancel
              </Btn>
              <Btn onClick={handleSaveEdit}>Save Changes</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* Dedicated Clean Print Container for Invoices Page */}
      {selectedInvoice && activeBill && (
        <div id="printable-bill" className="hidden print:block p-6">
          {billFormat === "style1" ? (
            <div className="max-w-[760px] mx-auto border border-black p-6 font-sans text-black">
              {/* Header */}
              <div className="flex justify-between items-start border-b-2 border-black pb-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {s.shop.name || "Store"}
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
                    {selectedInvoice.number}
                  </div>
                  <div className="text-xs text-gray-600">
                    {new Date(selectedInvoice.at).toLocaleString("en-IN")}
                  </div>
                  <div className="text-xs font-semibold mt-0.5">
                    Mode: {selectedInvoice.payment}
                  </div>
                </div>
              </div>

              {/* Customer Box */}
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

              {/* Items Table */}
              <table className="w-full border-collapse border border-black my-3 text-xs">
                <thead>
                  <tr className="bg-gray-100 border-b border-black text-left font-bold">
                    <th className="border border-black p-1.5 w-10 text-center">
                      S.No
                    </th>
                    <th className="border border-black p-1.5">
                      Product Description
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
                  {selectedInvoice.lines.map((l, idx) => {
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

              {/* Totals */}
              <div className="flex justify-between items-start my-4 text-xs">
                <div className="max-w-xs space-y-1">
                  <div className="text-[11px]">
                    <strong>Amount in Words: </strong>
                    <span className="italic">
                      {paiseToWords(activeBill.total)}
                    </span>
                  </div>
                </div>

                <div className="w-64 border border-black p-2.5 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>Taxable Amount:</span>
                    <span className="tabular-nums">
                      ₹{(activeBill.taxable / 100).toFixed(2)}
                    </span>
                  </div>
                  {activeBill.billDiscount > 0 && (
                    <div className="flex justify-between text-gray-700">
                      <span>Discount:</span>
                      <span className="tabular-nums">
                        -₹{(activeBill.billDiscount / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>CGST:</span>
                    <span className="tabular-nums">
                      ₹{(activeBill.cgst / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>SGST:</span>
                    <span className="tabular-nums">
                      ₹{(activeBill.sgst / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-sm border-t-2 border-black pt-1">
                    <span>Grand Total:</span>
                    <span className="tabular-nums">
                      ₹{(activeBill.total / 100).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Signatures */}
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
                {selectedInvoice.number} ·{" "}
                {new Date(selectedInvoice.at).toLocaleString("en-IN")}
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
                {selectedInvoice.lines.map((l, i) => {
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

              <div className="border-t-2 border-black my-1.5" />

              <div className="flex justify-between font-bold text-xs text-left">
                <span>TOTAL ({selectedInvoice.payment}):</span>
                <span>₹{(activeBill.total / 100).toFixed(2)}</span>
              </div>

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
