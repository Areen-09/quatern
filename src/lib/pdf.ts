import { Invoice, InvoiceLine, ShopProfile } from "./store"
import { calcBill, calcLine, fmt } from "./money"

export interface CustomerInfo {
  name?: string
  phone?: string
  address?: string
}

// Utility to escape PDF text syntax
function pdfEsc(s: string): string {
  return (s || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?") // standard ASCII only for Type 1 fonts
}

/**
 * Convert integer paise to Indian Rupee Words
 */
export function paiseToWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100)
  if (rupees === 0) return "Zero Rupees Only"

  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ]
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ]

  const numToWords = (n: number): string => {
    let str = ""
    if (n >= 100) {
      str += ones[Math.floor(n / 100)] + " Hundred "
      n %= 100
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)] + " "
      n %= 10
    }
    if (n > 0) {
      str += ones[n] + " "
    }
    return str.trim()
  }

  let n = rupees
  let res = ""

  if (n >= 10000000) {
    res += numToWords(Math.floor(n / 10000000)) + " Crore "
    n %= 10000000
  }
  if (n >= 100000) {
    res += numToWords(Math.floor(n / 100000)) + " Lakh "
    n %= 100000
  }
  if (n >= 1000) {
    res += numToWords(Math.floor(n / 1000)) + " Thousand "
    n %= 1000
  }
  if (n > 0) {
    res += numToWords(n)
  }

  return res.trim() + " Rupees Only"
}

/**
 * Generate a clean, compliant PDF-1.4 Tax Invoice document in pure TypeScript.
 * Supports:
 * - 'retail': Full Retail & Warranty Tax Invoice (Electronics / Cloth / Appliance Showroom)
 * - 'slip': Quick Thermal POS Slip (Supermarket / Grocery)
 */
export function generateInvoicePDFBytes(
  invoice: Invoice,
  shop: ShopProfile,
  customer?: CustomerInfo,
  format: "style1" | "style2" | "retail" | "slip" = "style1",
): Uint8Array {
  const bill = calcBill(invoice.lines, invoice.billDiscount)
  const dateStr = new Date(invoice.at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const custName = customer?.name || invoice.customerName || "Walk-in Customer"
  const custPhone = customer?.phone || invoice.customerPhone || ""
  const custAddress = customer?.address || invoice.customerAddress || ""

  const s: string[] = []

  const text = (
    font: string,
    size: number,
    x: number,
    y: number,
    t: string,
  ) => {
    s.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEsc(t)}) Tj ET`,
    )
  }
  const textRight = (
    font: string,
    size: number,
    rightX: number,
    y: number,
    t: string,
    charWidth = 0.55,
  ) => {
    const width = t.length * size * charWidth
    const x = Math.max(10, rightX - width)
    s.push(
      `BT /${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${pdfEsc(t)}) Tj ET`,
    )
  }
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    width = 0.75,
    gray = 0.7,
  ) => {
    s.push(
      `${gray} G ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S 0 G`,
    )
  }
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fillGray = 0.95,
    strokeGray = 0.8,
  ) => {
    s.push(
      `${strokeGray} G ${fillGray} g ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re B 0 G 0 g`,
    )
  }

  if (format === "style1" || format === "retail") {
    // ==========================================
    // STYLE 1: FULL RETAIL TAX INVOICE (A4)
    // ==========================================
    let curY = 800

    // Header Title
    text("F2", 20, 40, curY, shop.name || "Retail Showroom")
    textRight("F2", 13, 555, curY, "RETAIL TAX INVOICE")

    curY -= 15
    if (shop.address) {
      text("F1", 9, 40, curY, shop.address)
      curY -= 12
    }
    const phoneGst = [
      shop.phone ? `Phone: ${shop.phone}` : "",
      shop.gstin ? `GSTIN: ${shop.gstin}` : "",
    ]
      .filter(Boolean)
      .join("  |  ")
    if (phoneGst) {
      text("F1", 9, 40, curY, phoneGst)
      curY -= 13
    }

    line(40, curY, 555, curY, 1.2, 0.2)
    curY -= 16

    // Two-Column Metadata Box (Billed To / Invoice Details)
    const boxHeight = custAddress ? 55 : 45
    rect(40, curY - boxHeight + 8, 515, boxHeight, 0.98, 0.8)

    // Left Column: Invoice Details
    text("F2", 8.5, 50, curY - 6, "Invoice No:")
    text("F1", 8.5, 115, curY - 6, invoice.number)

    text("F2", 8.5, 50, curY - 18, "Date & Time:")
    text("F1", 8.5, 115, curY - 18, dateStr)

    text("F2", 8.5, 50, curY - 30, "Payment Mode:")
    text("F1", 8.5, 115, curY - 30, invoice.payment)

    // Right Column: Customer Details
    text("F2", 8.5, 310, curY - 6, "Customer Name:")
    text("F1", 8.5, 385, curY - 6, custName)

    if (custPhone) {
      text("F2", 8.5, 310, curY - 18, "Mobile Number:")
      text("F1", 8.5, 385, curY - 18, custPhone)
    }

    if (custAddress) {
      text("F2", 8.5, 310, curY - 30, "Delivery Address:")
      text(
        "F1",
        8.5,
        385,
        curY - 30,
        custAddress.length > 35 ? custAddress.slice(0, 33) + ".." : custAddress,
      )
    }

    curY -= boxHeight + 14

    // Table Header
    rect(40, curY - 14, 515, 18, 0.88, 0.5)
    text("F2", 8.5, 46, curY - 10, "S.No")
    text("F2", 8.5, 75, curY - 10, "PRODUCT / ITEM DESCRIPTION")
    textRight("F2", 8.5, 310, curY - 10, "QTY")
    textRight("F2", 8.5, 380, curY - 10, "RATE (Rs)")
    textRight("F2", 8.5, 440, curY - 10, "GST %")
    textRight("F2", 8.5, 545, curY - 10, "AMOUNT (Rs)")

    curY -= 16

    // Line Items
    invoice.lines.forEach((l, idx) => {
      const cl = calcLine(l)
      const priceStr = (l.price / 100).toFixed(2)
      const totStr = (cl.total / 100).toFixed(2)

      if (idx % 2 === 1) {
        rect(40, curY - 14, 515, 17, 0.98, 0.95)
      }

      text("F1", 8.5, 48, curY - 10, String(idx + 1))
      text(
        "F1",
        8.5,
        75,
        curY - 10,
        l.name.length > 40 ? l.name.slice(0, 38) + ".." : l.name,
      )
      textRight("F1", 8.5, 310, curY - 10, String(l.qty))
      textRight("F1", 8.5, 380, curY - 10, priceStr)
      textRight("F1", 8.5, 440, curY - 10, `${l.gst}%`)
      textRight("F2", 8.5, 545, curY - 10, totStr)

      curY -= 17
    })

    line(40, curY + 2, 555, curY + 2, 1, 0.6)
    curY -= 12

    // Summary Calculations Block (Right-aligned)
    const summaryX = 350
    const valX = 545

    text("F1", 9, summaryX, curY, "Taxable Amount:")
    textRight("F1", 9, valX, curY, `Rs ${(bill.taxable / 100).toFixed(2)}`)
    curY -= 13

    if (bill.lineDiscount > 0) {
      text("F1", 9, summaryX, curY, "Item Discount:")
      textRight(
        "F1",
        9,
        valX,
        curY,
        `- Rs ${(bill.lineDiscount / 100).toFixed(2)}`,
      )
      curY -= 13
    }

    if (bill.billDiscount > 0) {
      text("F1", 9, summaryX, curY, "Special Bill Discount:")
      textRight(
        "F1",
        9,
        valX,
        curY,
        `- Rs ${(bill.billDiscount / 100).toFixed(2)}`,
      )
      curY -= 13
    }

    text("F1", 9, summaryX, curY, "CGST Tax:")
    textRight("F1", 9, valX, curY, `Rs ${(bill.cgst / 100).toFixed(2)}`)
    curY -= 13

    text("F1", 9, summaryX, curY, "SGST Tax:")
    textRight("F1", 9, valX, curY, `Rs ${(bill.sgst / 100).toFixed(2)}`)
    curY -= 13

    if (bill.roundOff !== 0) {
      text("F1", 9, summaryX, curY, "Round Off:")
      textRight("F1", 9, valX, curY, `Rs ${(bill.roundOff / 100).toFixed(2)}`)
      curY -= 13
    }

    // Grand Total Highlight Box
    rect(summaryX - 10, curY - 16, 215, 22, 0.15, 0.1)
    s.push("1 1 1 rg")
    text("F2", 11, summaryX, curY - 10, "GRAND TOTAL:")
    textRight(
      "F2",
      11,
      valX - 5,
      curY - 10,
      `Rs ${(bill.total / 100).toFixed(2)}`,
    )
    s.push("0 0 0 rg")

    // Amount in Words
    curY -= 28
    text("F2", 8.5, 40, curY, "Amount in Words:")
    text("F1", 8.5, 125, curY, paiseToWords(bill.total))
    curY -= 20

    // Signatory (Only store authorized signatory, customer signature removed)
    const signY = Math.max(55, curY - 50)
    line(410, signY + 16, 550, signY + 16, 0.75, 0.5)
    text("F2", 8.5, 420, signY + 6, "Authorised Signatory")
    text("F1", 7.5, 420, signY - 4, shop.name || "Store Management")
  } else {
    // ==========================================
    // STYLE 2: COMPACT THERMAL POS SLIP (80mm / 58mm)
    // ==========================================
    let curY = 800

    text("F2", 16, 40, curY, shop.name || "Quatern Store")
    curY -= 14
    if (shop.address) {
      text("F1", 9, 40, curY, shop.address)
      curY -= 12
    }
    if (shop.phone) {
      text("F1", 9, 40, curY, `Ph: ${shop.phone}`)
      curY -= 12
    }
    if (shop.gstin) {
      text("F1", 9, 40, curY, `GSTIN: ${shop.gstin}`)
      curY -= 12
    }
    text("F1", 9, 40, curY, `${invoice.number}  |  ${dateStr}`)
    curY -= 12

    if (custName && custName !== "Walk-in Customer") {
      text("F1", 9, 40, curY, `Customer: ${custName} (${custPhone})`)
      curY -= 12
    }

    line(40, curY, 350, curY, 0.75, 0.4)
    curY -= 14

    // Slip Lines
    invoice.lines.forEach((l) => {
      const cl = calcLine(l)
      text("F1", 9, 40, curY, `${l.qty}x ${l.name}`)
      textRight("F2", 9, 350, curY, `Rs ${(cl.total / 100).toFixed(2)}`)
      curY -= 14
    })

    line(40, curY, 350, curY, 0.75, 0.4)
    curY -= 14

    text("F1", 9, 40, curY, "Subtotal:")
    textRight(
      "F1",
      9,
      350,
      curY,
      `Rs ${((bill.total - bill.cgst - bill.sgst) / 100).toFixed(2)}`,
    )
    curY -= 12

    text("F1", 9, 40, curY, "GST (CGST+SGST):")
    textRight(
      "F1",
      9,
      350,
      curY,
      `Rs ${((bill.cgst + bill.sgst) / 100).toFixed(2)}`,
    )
    curY -= 12

    line(40, curY, 350, curY, 1, 0.2)
    curY -= 14

    text("F2", 12, 40, curY, `TOTAL (${invoice.payment}):`)
    textRight("F2", 12, 350, curY, `Rs ${(bill.total / 100).toFixed(2)}`)
    curY -= 20

    text("F1", 8, 40, curY, "Thank you for shopping with us! Visit again.")
  }

  // Assemble PDF Objects
  const streamContent = s.join("\n")
  const streamLength = streamContent.length

  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj`,
    `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${streamContent}\nendstream\nendobj`,
    `5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
    `6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj`,
  ]

  let out = "%PDF-1.4\n%âãÏÓ\n"
  const offsets: number[] = []

  objects.forEach((obj) => {
    offsets.push(out.length)
    out += obj + "\n"
  })

  const startXref = out.length
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.forEach((off) => {
    out += `${String(off).padStart(10, "0")} 00000 n \n`
  })

  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF`

  return new TextEncoder().encode(out)
}

/**
 * Download Invoice PDF to user disk
 */
export function downloadInvoicePDF(
  invoice: Invoice,
  shop: ShopProfile,
  customer?: CustomerInfo,
  format: "style1" | "style2" = "style1",
): string {
  const bytes = generateInvoicePDFBytes(invoice, shop, customer, format)
  const blob = new Blob([bytes], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const filename = `${invoice.number}_${
    format === "style1" ? "Style1" : "Style2"
  }.pdf`
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}
