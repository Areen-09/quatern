import { useState, useMemo } from "react"
import { Action, State, uid, Customer } from "../lib/store"
import { fmt0 } from "../lib/money"
import { Badge, Btn, Card, Field, Icon, Input, Modal, PageHead } from "../ui"
import { upsertCustomer } from "../lib/api"
import ImportModal from "./ImportModal"

export default function Customers({
  s,
  dispatch,
}: {
  s: State
  dispatch: (a: Action) => void
}) {
  const [add, setAdd] = useState(false)
  const [importModal, setImportModal] = useState(false)
  const [q, setQ] = useState("")
  const [f, setF] = useState({
    name: "",
    phone: "",
    address: "",
    consent: false,
  })

  const rows = useMemo(() => {
    return s.customers
      .filter((c) => {
        if (!q.trim()) return true
        const search = q.toLowerCase()
        return (
          c.name.toLowerCase().includes(search) ||
          c.phone.toLowerCase().includes(search) ||
          (c.address && c.address.toLowerCase().includes(search))
        )
      })
      .map((c) => {
        const inv = s.invoices.filter(
          (i) =>
            i.customerId === c.id ||
            (i.customerPhone && i.customerPhone === c.phone),
        )
        return {
          c,
          visits: inv.length,
          spend: inv.reduce((a, i) => a + i.total, 0),
          last: Math.max(0, ...inv.map((i) => i.at)),
        }
      })
      .sort((a, b) => b.spend - a.spend)
  }, [s.customers, s.invoices, q])

  const handleSave = async () => {
    if (!f.name || !f.phone) return
    const newCustomer: Customer = {
      id: uid(),
      name: f.name.trim(),
      phone: f.phone.trim(),
      address: f.address.trim(),
      consent: f.consent,
      tags: ["New"],
      createdAt: Date.now(),
    }
    dispatch({ type: "customer", customer: newCustomer })
    try {
      await upsertCustomer(newCustomer)
    } catch {
      // offline fallback
    }
    setAdd(false)
    setF({ name: "", phone: "", address: "", consent: false })
  }

  return (
    <>
      <PageHead
        title="Customers"
        sub={`${s.customers.length} customers registered · ${s.customers.filter((c) => c.consent).length} opted in to messages`}
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
            <Btn onClick={() => setAdd(true)}>
              <Icon name="plus" />
              Add customer
            </Btn>
          </div>
        }
      />

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Icon
            name="search"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400"
          />
          <Input
            placeholder="Search customers by name, phone or address..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9 text-xs"
          />
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-stone-100 text-left text-[12px] text-stone-500">
                {[
                  "Name",
                  "Phone",
                  "Address",
                  "Tags",
                  "Visits",
                  "Lifetime spend",
                  "Last visit",
                  "Messaging",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-2.5 font-normal ${
                      i === 4 || i === 5 ? "text-right" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map(({ c, visits, spend, last }) => (
                <tr key={c.id} className="hover:bg-stone-50/50 transition">
                  <td className="px-4 py-2.5 font-medium text-stone-900">
                    {c.name}
                  </td>
                  <td className="px-4 tabular-nums text-stone-600">
                    {c.phone}
                  </td>
                  <td
                    className="px-4 text-stone-500 text-xs max-w-[200px] truncate"
                    title={c.address || ""}
                  >
                    {c.address ? (
                      c.address
                    ) : (
                      <span className="text-stone-300">—</span>
                    )}
                  </td>
                  <td className="space-x-1 px-4">
                    {c.tags.map((t) => (
                      <Badge key={t} tone="blue">
                        {t}
                      </Badge>
                    ))}
                  </td>
                  <td className="px-4 text-right tabular-nums">{visits}</td>
                  <td className="px-4 text-right tabular-nums font-medium text-stone-800">
                    {fmt0(spend)}
                  </td>
                  <td className="px-4 text-stone-500">
                    {last
                      ? new Date(last).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td className="px-4">
                    {c.consent ? (
                      <Badge tone="green">Opted in</Badge>
                    ) : (
                      <Badge>No consent</Badge>
                    )}
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
                      {q.trim()
                        ? `No customers matching "${q}"`
                        : "No customers in database yet"}
                    </div>
                    <div className="max-w-sm mx-auto text-stone-500 mb-3">
                      {q.trim()
                        ? "Try searching with a different name or phone number."
                        : "Customers entered during checkout or imported from your spreadsheet will appear here."}
                    </div>
                    {!q.trim() && (
                      <div className="flex items-center justify-center gap-2">
                        <Btn
                          variant="ghost"
                          onClick={() => setImportModal(true)}
                        >
                          <Icon
                            name="upload"
                            className="size-3.5 text-stone-500"
                          />
                          Import Directory (Excel / CSV)
                        </Btn>
                        <Btn onClick={() => setAdd(true)}>
                          <Icon name="plus" />
                          Add Customer
                        </Btn>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {add && (
        <Modal title="New Customer" onClose={() => setAdd(false)}>
          <div className="space-y-3">
            <Field label="Customer Name *">
              <Input
                autoFocus
                placeholder="e.g. Ramesh Kumar"
                value={f.name}
                onChange={(e) => setF({ ...f, name: e.target.value })}
              />
            </Field>

            <Field label="Mobile Number *">
              <Input
                placeholder="e.g. +91 98765 43210"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
              />
            </Field>

            <Field label="Billing / Delivery Address (Optional)">
              <Input
                placeholder="Street name, shop/flat number, city"
                value={f.address}
                onChange={(e) => setF({ ...f, address: e.target.value })}
              />
            </Field>

            <label className="flex items-start gap-2 rounded-lg bg-stone-50 p-3 text-[12px] text-stone-600">
              <input
                type="checkbox"
                checked={f.consent}
                onChange={(e) => setF({ ...f, consent: e.target.checked })}
                className="mt-0.5"
              />
              Customer agreed to receive tax invoices and offers on
              WhatsApp/SMS.
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
              <Btn variant="ghost" onClick={() => setAdd(false)}>
                Cancel
              </Btn>
              <Btn
                disabled={!f.name.trim() || !f.phone.trim()}
                onClick={handleSave}
              >
                Save Customer
              </Btn>
            </div>
          </div>
        </Modal>
      )}

      {importModal && (
        <ImportModal
          initialTarget="customers"
          s={s}
          dispatch={dispatch}
          onClose={() => setImportModal(false)}
        />
      )}
    </>
  )
}
