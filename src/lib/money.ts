// All money is stored as integer paise to keep calculations deterministic.
export const toPaise = (rupees: number) => Math.round(rupees * 100)

export function parseToPaise(val: any): number {
  if (val === null || val === undefined) return 0
  if (typeof val === "number") {
    if (isNaN(val)) return 0
    return Math.round(val * 100)
  }
  const cleanStr = String(val)
    .replace(/[^\d.-]/g, "")
    .trim()
  const num = parseFloat(cleanStr)
  return isNaN(num) ? 0 : Math.round(num * 100)
}
export const fmt = (paise: number) =>
  "₹" +
  (paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
export const fmt0 = (paise: number) =>
  "₹" + Math.round(paise / 100).toLocaleString("en-IN")

export interface LineInput {
  price: number
  qty: number
  gst: number
  discountPct: number
}
export interface LineCalc {
  gross: number
  discount: number
  taxable: number
  tax: number
  total: number
}

// Prices are GST-exclusive. Rounding happens once per line, half-up, in paise.
export function calcLine(l: LineInput): LineCalc {
  const gross = l.price * l.qty
  const discount = Math.round((gross * l.discountPct) / 100)
  const taxable = gross - discount
  const tax = Math.round((taxable * l.gst) / 100)
  return { gross, discount, taxable, tax, total: taxable + tax }
}

export function calcBill(lines: LineInput[], billDiscount: number) {
  const c = lines.map(calcLine)
  const sum = (k: keyof LineCalc) => c.reduce((a, x) => a + x[k], 0)
  const tax = sum("tax")
  const preRound = sum("total") - billDiscount
  const total = Math.round(preRound / 100) * 100
  return {
    gross: sum("gross"),
    lineDiscount: sum("discount"),
    taxable: sum("taxable"),
    cgst: Math.floor(tax / 2),
    sgst: tax - Math.floor(tax / 2),
    billDiscount,
    roundOff: total - preRound,
    total,
  }
}
