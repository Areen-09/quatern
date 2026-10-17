import { useState, useRef, useEffect } from "react"
import { State } from "../lib/store"
import { setupShop } from "../lib/api"
import { Btn, Card, Field, Icon, Input, selectCls, QuaternLogo } from "../ui"

interface OnboardingProps {
  s: State
  onComplete: (newState: State) => void
}

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Assam",
  "Bihar",
  "Delhi",
  "Gujarat",
  "Haryana",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Punjab",
  "Rajasthan",
  "Tamil Nadu",
  "Telangana",
  "Uttar Pradesh",
  "West Bengal",
]

const CATEGORIES = [
  "Kirana / Grocery",
  "Boutique & Apparel",
  "Salon & Spa",
  "Pharmacy / Chemist",
  "Electronics & Mobile",
  "Bakery & Cafe",
  "General Retail",
]

export default function Onboarding({ s, onComplete }: OnboardingProps) {
  const [ownerName, setOwnerName] = useState(s.shop.ownerName || "")
  const [shopName, setShopName] = useState(s.shop.name || "")
  const [category, setCategory] = useState("Kirana / Grocery")
  const [country, setCountry] = useState(s.shop.country || "India")
  const [hasGst, setHasGst] = useState(Boolean(s.shop.gstin))
  const [gstin, setGstin] = useState(s.shop.gstin || "")
  const [stateName, setStateName] = useState("Maharashtra")
  const [phone, setPhone] = useState(s.shop.phone || "")
  const [address, setAddress] = useState(s.shop.address || "")
  const [pin, setPin] = useState("")
  const [loading, setLoading] = useState(false)
  const [signatureData, setSignatureData] = useState<string>(
    s.shop.signature || "",
  )

  // Canvas drawing state
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.lineWidth = 2.5
    ctx.strokeStyle = "#1c1917"

    if (signatureData) {
      const img = new Image()
      img.onload = () => ctx.drawImage(img, 0, 0)
      img.src = signatureData
      setHasDrawn(true)
    }
  }, [])

  const startDrawing = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    ctx.beginPath()
    ctx.moveTo(clientX - rect.left, clientY - rect.top)
    setIsDrawing(true)
    setHasDrawn(true)
  }

  const draw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
  ) => {
    if (!isDrawing) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const rect = canvas.getBoundingClientRect()
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
    ctx.lineTo(clientX - rect.left, clientY - rect.top)
    ctx.stroke()
  }

  const stopDrawing = () => {
    if (!isDrawing) return
    setIsDrawing(false)
    const canvas = canvasRef.current
    if (canvas) {
      setSignatureData(canvas.toDataURL("image/png"))
    }
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setSignatureData("")
    setHasDrawn(false)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const res = event.target?.result as string
      setSignatureData(res)
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          const img = new Image()
          img.onload = () => {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
            setHasDrawn(true)
          }
          img.src = res
        }
      }
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!shopName.trim()) {
      alert("Please enter your shop or business name")
      return
    }

    setLoading(true)
    const payload = {
      name: shopName.trim(),
      ownerName: ownerName.trim(),
      gstin: country === "India" && hasGst ? gstin.trim().toUpperCase() : "",
      phone: phone.trim(),
      address: address.trim()
        ? `${address.trim()}${country === "India" ? `, ${stateName}` : ""}`
        : "",
      country,
      currency: country === "India" ? "INR" : "USD",
      signature: signatureData || undefined,
      pin: pin.trim() || undefined,
      loadSampleCatalog: false,
    }

    const res = await setupShop(payload)
    setLoading(false)

    if (res) {
      onComplete(res)
    } else {
      // Local fallback for offline/browser
      const localState: State = {
        ...s,
        shop: {
          name: payload.name,
          ownerName: payload.ownerName,
          gstin: payload.gstin,
          phone: payload.phone,
          address: payload.address,
          country: payload.country,
          currency: payload.currency,
          signature: payload.signature,
          isConfigured: true,
          hasPin: Boolean(payload.pin),
        },
        products: loadSampleCatalog ? s.products : [],
        invoices: loadSampleCatalog ? s.invoices : [],
        campaigns: loadSampleCatalog ? s.campaigns : [],
      }
      if (payload.pin) {
        localStorage.setItem("quatern.owner_pin", payload.pin)
        localStorage.setItem("quartern.owner_pin", payload.pin)
        localStorage.setItem("dukaanos.owner_pin", payload.pin)
      }
      onComplete(localState)
    }
  }

  return (
    <div className="min-h-screen bg-stone-100/70 p-6 flex flex-col items-center justify-center text-stone-900 antialiased">
      <div className="w-full max-w-2xl space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center">
            <QuaternLogo className="size-11 shadow-md" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome to Quatern
          </h1>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Set up your store details in under 2 minutes. Everything is stored
            locally on this computer.
          </p>
        </div>

        {/* Main Setup Card */}
        <Card className="p-6 shadow-sm border-stone-200 bg-white">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Section 1: Business Identity */}
            <div className="space-y-4">
              <div className="border-b border-stone-100 pb-2">
                <h2 className="text-sm font-semibold text-stone-900">
                  1. Business Profile
                </h2>
                <p className="text-xs text-stone-400">
                  Your store and proprietor information
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Shop / Business Name *">
                  <Input
                    required
                    autoFocus
                    placeholder="e.g. Sharma General Store"
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                  />
                </Field>

                <Field label="Owner / Proprietor Name">
                  <Input
                    placeholder="e.g. Rajesh Sharma"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Business Category">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={selectCls}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Phone / WhatsApp Number (for receipts)">
                  <Input
                    placeholder="+91 98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
              </div>

              <Field label="Shop Street Address">
                <Input
                  placeholder="e.g. Shop 4, Market Road, Near Gandhi Chowk"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </Field>
            </div>

            {/* Section 2: Country & Tax Details */}
            <div className="space-y-4 pt-2">
              <div className="border-b border-stone-100 pb-2">
                <h2 className="text-sm font-semibold text-stone-900">
                  2. Country & Tax Information
                </h2>
                <p className="text-xs text-stone-400">
                  Configure GST and currency format
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Country">
                  <select
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className={selectCls}
                  >
                    <option value="India">India (₹ INR)</option>
                    <option value="United Arab Emirates">
                      United Arab Emirates (AED)
                    </option>
                    <option value="United States">United States ($ USD)</option>
                    <option value="United Kingdom">
                      United Kingdom (£ GBP)
                    </option>
                    <option value="Other">Other Country</option>
                  </select>
                </Field>

                {country === "India" && (
                  <Field label="State (for GST jurisdiction)">
                    <select
                      value={stateName}
                      onChange={(e) => setStateName(e.target.value)}
                      className={selectCls}
                    >
                      {INDIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              {country === "India" && (
                <div className="rounded-lg border border-stone-200 bg-stone-50/60 p-3.5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium text-stone-800">
                        GST Registration Status
                      </div>
                      <div className="text-[11px] text-stone-400">
                        Enable if your shop has a GSTIN for tax invoices
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasGst}
                        onChange={(e) => setHasGst(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-stone-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {hasGst && (
                    <Field label="GSTIN (15-digit GST Number)">
                      <Input
                        placeholder="e.g. 27ABCDE1234F1Z5"
                        maxLength={15}
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value.toUpperCase())}
                        className="font-mono uppercase tracking-wider text-sm"
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>

            {/* Section 3: Digital Signature */}
            <div className="space-y-4 pt-2">
              <div className="border-b border-stone-100 pb-2 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-stone-900">
                    3. Digital Signature
                  </h2>
                  <p className="text-xs text-stone-400">
                    Appears on invoices and customer receipts
                  </p>
                </div>
                {hasDrawn && (
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="text-xs text-stone-500 hover:text-red-600 underline"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="space-y-2">
                <div className="relative rounded-lg border-2 border-dashed border-stone-200 bg-stone-50/50 p-2 text-center">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={110}
                    className="w-full h-28 touch-none bg-white rounded border border-stone-200 cursor-crosshair"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {!hasDrawn && (
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-stone-400">
                      Sign here using mouse or touch
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span>Draw with mouse / stylus</span>
                  <label className="cursor-pointer text-stone-600 hover:text-stone-900 font-medium">
                    Or upload image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Section 4: Store Setup & Security */}
            <div className="space-y-4 pt-2">
              <div className="border-b border-stone-100 pb-2">
                <h2 className="text-sm font-semibold text-stone-900">
                  4. Access Security & Clean Store
                </h2>
                <p className="text-xs text-stone-400">
                  Optional security PIN for cashier restrictions
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Owner PIN (Optional 4-6 digits)">
                  <Input
                    type="password"
                    maxLength={6}
                    placeholder="e.g. 1234 (Leave blank if not needed)"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    className="font-mono text-center tracking-widest"
                  />
                </Field>

                <div className="rounded-lg bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600">
                  <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                    <Icon name="check" className="size-4 text-emerald-600" />
                    Clean Store (No Boilerplate Data)
                  </div>
                  <div className="mt-1 text-[11px] text-stone-500">
                    Your store starts completely fresh with 0 sample products
                    and 0 dummy customers, ready for your real inventory.
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t border-stone-100 flex items-center justify-between">
              <div className="text-xs text-stone-400 flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                Data stored locally on this machine
              </div>
              <Btn
                disabled={loading || !shopName.trim()}
                className="h-10 px-6 text-sm justify-center shadow-sm"
              >
                {loading ? "Setting up..." : "Complete Setup & Open Quatern"}
                <Icon name="check" className="ml-1 size-4" />
              </Btn>
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}
