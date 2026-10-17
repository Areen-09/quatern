import { useState, useRef, useMemo } from "react"
import { Action, State, Product, Customer } from "../lib/store"
import { Modal, Btn, Icon, Badge } from "../ui"
import { fmt } from "../lib/money"
import {
  ImportTarget,
  ParseResult,
  ProductFieldMapping,
  CustomerFieldMapping,
  autoDetectProductMapping,
  autoDetectCustomerMapping,
  parseSpreadsheetFile,
  buildProductsFromRows,
  buildCustomersFromRows,
  downloadSampleProductTemplate,
  downloadSampleCustomerTemplate,
} from "../lib/importer"

interface ImportModalProps {
  initialTarget?: ImportTarget
  s: State
  dispatch: (a: Action) => void
  onClose: () => void
  onSuccess?: (count: number, target: ImportTarget) => void
}

export default function ImportModal({
  initialTarget = "products",
  s,
  dispatch,
  onClose,
  onSuccess,
}: ImportModalProps) {
  const [target, setTarget] = useState<ImportTarget>(initialTarget)
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [parseError, setParseError] = useState<string>("")
  const [conflictMode, setConflictMode] = useState<"upsert" | "skip">("upsert")
  const [importing, setImporting] = useState(false)
  const [importSummary, setImportSummary] = useState<{
    imported: number
    updated: number
    skipped: number
  } | null>(null)

  // Mappings
  const [productMapping, setProductMapping] = useState<ProductFieldMapping>({
    name: "",
    sku: "",
    category: "",
    price: "",
    cost: "",
    stock: "",
    unit: "",
    gst: "",
    reorder: "",
  })

  const [customerMapping, setCustomerMapping] = useState<CustomerFieldMapping>({
    name: "",
    phone: "",
    address: "",
    tags: "",
    consent: "",
  })

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // Process file upload
  const handleFile = async (f: File) => {
    setFile(f)
    setParseError("")
    setParseResult(null)
    setImportSummary(null)
    setParsing(true)

    try {
      const res = await parseSpreadsheetFile(f)
      setParseResult(res)

      // Auto-detect mappings
      if (target === "products") {
        setProductMapping(autoDetectProductMapping(res.headers))
      } else {
        setCustomerMapping(autoDetectCustomerMapping(res.headers))
      }
    } catch (err: any) {
      setParseError(err?.message || "Failed to parse spreadsheet file.")
    } finally {
      setParsing(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const f = e.dataTransfer.files[0]
      if (f.name.match(/\.(xlsx|xls|csv)$/i)) {
        handleFile(f)
      } else {
        setParseError("Please upload a valid Excel (.xlsx, .xls) or CSV file.")
      }
    }
  }

  // Live preview & validation
  const previewProducts = useMemo(() => {
    if (!parseResult || target !== "products") return null
    return buildProductsFromRows(
      parseResult.rawRows,
      productMapping,
      s.suppliers[0]?.id || "s1",
    )
  }, [parseResult, target, productMapping, s.suppliers])

  const previewCustomers = useMemo(() => {
    if (!parseResult || target !== "customers") return null
    return buildCustomersFromRows(parseResult.rawRows, customerMapping)
  }, [parseResult, target, customerMapping])

  const totalValid =
    target === "products"
      ? previewProducts?.products.length || 0
      : previewCustomers?.customers.length || 0

  const totalSkipped =
    target === "products"
      ? previewProducts?.skippedCount || 0
      : previewCustomers?.skippedCount || 0

  const handleExecuteImport = async () => {
    if (totalValid === 0) return
    setImporting(true)
    setParseError("")

    try {
      if (target === "products" && previewProducts) {
        dispatch({
          type: "bulkProducts",
          products: previewProducts.products,
          conflictMode,
        })
        setImportSummary({
          imported: previewProducts.products.length,
          updated: 0,
          skipped: previewProducts.skippedCount,
        })
        if (onSuccess) onSuccess(previewProducts.products.length, "products")
      } else if (target === "customers" && previewCustomers) {
        dispatch({
          type: "bulkCustomers",
          customers: previewCustomers.customers,
          conflictMode,
        })
        setImportSummary({
          imported: previewCustomers.customers.length,
          updated: 0,
          skipped: previewCustomers.skippedCount,
        })
        if (onSuccess) onSuccess(previewCustomers.customers.length, "customers")
      }
    } catch (err: any) {
      setParseError(err?.message || "Failed to commit imported data.")
    } finally {
      setImporting(false)
    }
  }

  return (
    <Modal
      title="Import Store Data (Excel / CSV)"
      onClose={onClose}
      className="max-w-3xl"
    >
      <div className="space-y-5">
        {/* Step 1: Target Selector & Templates */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 pb-3">
          <div className="flex items-center gap-1 rounded-lg bg-stone-100 p-1">
            <button
              type="button"
              onClick={() => {
                setTarget("products")
                if (parseResult) {
                  setProductMapping(
                    autoDetectProductMapping(parseResult.headers),
                  )
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                target === "products"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              <Icon name="box" className="size-3.5" />
              Products & Inventory
            </button>
            <button
              type="button"
              onClick={() => {
                setTarget("customers")
                if (parseResult) {
                  setCustomerMapping(
                    autoDetectCustomerMapping(parseResult.headers),
                  )
                }
              }}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition ${
                target === "customers"
                  ? "bg-white text-stone-900 shadow-xs"
                  : "text-stone-500 hover:text-stone-900"
              }`}
            >
              <Icon name="users" className="size-3.5" />
              Customer Directory
            </button>
          </div>

          {/* Template Download Pills */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-stone-400">Sample Templates:</span>
            <button
              type="button"
              onClick={() =>
                target === "products"
                  ? downloadSampleProductTemplate("xlsx")
                  : downloadSampleCustomerTemplate("xlsx")
              }
              className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2 py-1 font-medium text-stone-700 hover:bg-stone-50"
            >
              <Icon name="download" className="size-3 text-emerald-600" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() =>
                target === "products"
                  ? downloadSampleProductTemplate("csv")
                  : downloadSampleCustomerTemplate("csv")
              }
              className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-2 py-1 font-medium text-stone-700 hover:bg-stone-50"
            >
              <Icon name="download" className="size-3 text-sky-600" />
              CSV (.csv)
            </button>
          </div>
        </div>

        {/* Success View */}
        {importSummary && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5 text-center space-y-3">
            <div className="inline-flex size-10 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
              <Icon name="check" className="size-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-emerald-950">
                Import Completed Successfully!
              </h4>
              <p className="mt-0.5 text-xs text-emerald-800">
                Processed {importSummary.imported} {target} into your store
                database
                {importSummary.skipped > 0 &&
                  ` (${importSummary.skipped} blank rows skipped)`}
                .
              </p>
            </div>
            <div className="pt-2">
              <Btn onClick={onClose} className="px-5">
                Close & View {target === "products" ? "Inventory" : "Customers"}
              </Btn>
            </div>
          </div>
        )}

        {!importSummary && (
          <>
            {/* Step 2: Drag & Drop Zone */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragOver(true)
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-6 text-center transition ${
                isDragOver
                  ? "border-amber-500 bg-amber-50/40"
                  : file
                    ? "border-stone-300 bg-stone-50/60"
                    : "border-stone-200 bg-stone-50/30 hover:border-stone-300 hover:bg-stone-50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
              />

              <div className="flex flex-col items-center justify-center space-y-2">
                <div className="flex size-10 items-center justify-center rounded-lg bg-stone-900 text-white shadow-xs">
                  <Icon name="upload" className="size-5 text-amber-400" />
                </div>
                {file ? (
                  <div>
                    <div className="text-sm font-medium text-stone-900">
                      {file.name}
                    </div>
                    <div className="text-xs text-stone-500">
                      {(file.size / 1024).toFixed(1)} KB ·{" "}
                      {parseResult
                        ? `${parseResult.totalRows} rows found`
                        : "Analyzing..."}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-semibold text-stone-900">
                      Click to choose or drag & drop spreadsheet
                    </div>
                    <div className="text-[11px] text-stone-400">
                      Supports Excel (.xlsx, .xls) and CSV (.csv) exported from
                      any POS or accounting software
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Error Banner */}
            {parseError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {parseError}
              </div>
            )}

            {/* Step 3: Column Mapping & Live Preview */}
            {parseResult && (
              <div className="space-y-4">
                {/* Header & Conflict Mode */}
                <div className="flex items-center justify-between border-b border-stone-100 pb-2">
                  <div>
                    <h4 className="text-xs font-semibold text-stone-900">
                      Column Mapping & Verification
                    </h4>
                    <p className="text-[11px] text-stone-500">
                      Columns were auto-detected. Adjust any dropdown if
                      necessary.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-stone-500">
                      Duplicates:
                    </span>
                    <select
                      value={conflictMode}
                      onChange={(e) =>
                        setConflictMode(e.target.value as "upsert" | "skip")
                      }
                      className="h-7 rounded border border-stone-200 bg-white px-2 text-[11px] outline-none"
                    >
                      <option value="upsert">
                        Update existing (
                        {target === "products" ? "SKU / Name" : "Phone"})
                      </option>
                      <option value="skip">Skip duplicates</option>
                    </select>
                  </div>
                </div>

                {/* Mapping Grid */}
                <div className="grid grid-cols-3 gap-3 rounded-xl border border-stone-100 bg-stone-50/50 p-3">
                  {target === "products" ? (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Product Name *
                        </label>
                        <select
                          value={productMapping.name}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              name: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Choose Column --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          SKU / Barcode
                        </label>
                        <select
                          value={productMapping.sku}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              sku: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Auto-generate --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Selling Price / MRP *
                        </label>
                        <select
                          value={productMapping.price}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              price: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Optional (₹0) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Cost Price
                        </label>
                        <select
                          value={productMapping.cost}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              cost: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Optional (₹0) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Stock Quantity
                        </label>
                        <select
                          value={productMapping.stock}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              stock: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Optional (0) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Category
                        </label>
                        <select
                          value={productMapping.category}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              category: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- General --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Unit of Measure
                        </label>
                        <select
                          value={productMapping.unit}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              unit: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Default (pc) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          GST Rate %
                        </label>
                        <select
                          value={productMapping.gst}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              gst: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Default (5%) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Reorder Level
                        </label>
                        <select
                          value={productMapping.reorder}
                          onChange={(e) =>
                            setProductMapping({
                              ...productMapping,
                              reorder: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Default (5) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Customer Name *
                        </label>
                        <select
                          value={customerMapping.name}
                          onChange={(e) =>
                            setCustomerMapping({
                              ...customerMapping,
                              name: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Choose Column --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Phone Number *
                        </label>
                        <select
                          value={customerMapping.phone}
                          onChange={(e) =>
                            setCustomerMapping({
                              ...customerMapping,
                              phone: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Choose Column --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Address
                        </label>
                        <select
                          value={customerMapping.address}
                          onChange={(e) =>
                            setCustomerMapping({
                              ...customerMapping,
                              address: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Optional --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Tags / Segment
                        </label>
                        <select
                          value={customerMapping.tags}
                          onChange={(e) =>
                            setCustomerMapping({
                              ...customerMapping,
                              tags: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Default (Regular) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-stone-700 mb-1">
                          Marketing Consent
                        </label>
                        <select
                          value={customerMapping.consent}
                          onChange={(e) =>
                            setCustomerMapping({
                              ...customerMapping,
                              consent: e.target.value,
                            })
                          }
                          className="h-7 w-full rounded border border-stone-200 bg-white px-2 text-xs"
                        >
                          <option value="">-- Default (Yes) --</option>
                          {parseResult.headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                {/* Live Preview Sample Rows */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-stone-500">
                    <span>
                      Data Preview (Showing first 5 rows of{" "}
                      {parseResult.totalRows})
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge tone="green">{totalValid} Valid rows</Badge>
                      {totalSkipped > 0 && (
                        <Badge tone="amber">
                          {totalSkipped} Incomplete / Skipped
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="max-h-48 overflow-x-auto overflow-y-auto rounded-lg border border-stone-200 bg-white">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-stone-50 border-b border-stone-200 text-stone-600">
                        {target === "products" ? (
                          <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">SKU</th>
                            <th className="px-3 py-2 font-medium">Category</th>
                            <th className="px-3 py-2 font-medium">Price</th>
                            <th className="px-3 py-2 font-medium">Cost</th>
                            <th className="px-3 py-2 font-medium">Stock</th>
                            <th className="px-3 py-2 font-medium">Unit</th>
                            <th className="px-3 py-2 font-medium">GST %</th>
                          </tr>
                        ) : (
                          <tr>
                            <th className="px-3 py-2 font-medium">Name</th>
                            <th className="px-3 py-2 font-medium">Phone</th>
                            <th className="px-3 py-2 font-medium">Address</th>
                            <th className="px-3 py-2 font-medium">Tags</th>
                            <th className="px-3 py-2 font-medium">Consent</th>
                          </tr>
                        )}
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {target === "products" &&
                          previewProducts?.products
                            .slice(0, 5)
                            .map((p, idx) => (
                              <tr key={idx} className="hover:bg-stone-50/50">
                                <td className="px-3 py-1.5 font-medium text-stone-900">
                                  {p.name}
                                </td>
                                <td className="px-3 py-1.5 font-mono text-stone-500">
                                  {p.sku}
                                </td>
                                <td className="px-3 py-1.5 text-stone-600">
                                  {p.category}
                                </td>
                                <td className="px-3 py-1.5 font-semibold text-stone-900">
                                  {fmt(p.price)}
                                </td>
                                <td className="px-3 py-1.5 text-stone-500">
                                  {fmt(p.cost)}
                                </td>
                                <td className="px-3 py-1.5 font-medium text-stone-700">
                                  {p.stock} {p.unit}
                                </td>
                                <td className="px-3 py-1.5 text-stone-500">
                                  {p.unit}
                                </td>
                                <td className="px-3 py-1.5 text-stone-500">
                                  {p.gst}%
                                </td>
                              </tr>
                            ))}

                        {target === "customers" &&
                          previewCustomers?.customers
                            .slice(0, 5)
                            .map((c, idx) => (
                              <tr key={idx} className="hover:bg-stone-50/50">
                                <td className="px-3 py-1.5 font-medium text-stone-900">
                                  {c.name}
                                </td>
                                <td className="px-3 py-1.5 font-mono text-stone-600">
                                  {c.phone || "—"}
                                </td>
                                <td className="px-3 py-1.5 text-stone-500 truncate max-w-xs">
                                  {c.address || "—"}
                                </td>
                                <td className="px-3 py-1.5 text-stone-600">
                                  {c.tags.join(", ")}
                                </td>
                                <td className="px-3 py-1.5">
                                  <Badge tone={c.consent ? "green" : "stone"}>
                                    {c.consent ? "Opted in" : "No"}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex items-center justify-between border-t border-stone-100 pt-3">
              <Btn variant="ghost" onClick={onClose}>
                Cancel
              </Btn>

              <Btn
                disabled={!parseResult || totalValid === 0 || importing}
                onClick={handleExecuteImport}
                className="px-5"
              >
                {importing ? (
                  "Importing..."
                ) : !parseResult ? (
                  <>
                    <Icon name="upload" className="size-4" />
                    Upload File to Import
                  </>
                ) : (
                  <>
                    <Icon name="check" className="size-4" />
                    Import {totalValid > 0 ? `${totalValid} ` : ""}{" "}
                    {target === "products" ? "Products" : "Customers"}
                  </>
                )}
              </Btn>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
