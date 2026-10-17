import { Invoice, ShopProfile } from "./store"
import { calcBill, calcLine, fmt } from "./money"
import { CustomerInfo, paiseToWords } from "./pdf"

/**
 * Render Quatern Invoice directly onto an HTML5 Canvas at Retina (2x) resolution
 * Supports 'style1' (Detailed Tax Invoice) and 'style2' (Compact POS Slip)
 */
export function renderInvoiceToCanvas(
  invoice: Invoice,
  shop: ShopProfile,
  customer?: CustomerInfo,
  format: "style1" | "style2" = "style1",
): HTMLCanvasElement {
  const bill = calcBill(invoice.lines, invoice.billDiscount)
  const custName = customer?.name || invoice.customerName || "Walk-in Customer"
  const custPhone = customer?.phone || invoice.customerPhone || ""
  const custAddress = customer?.address || invoice.customerAddress || ""

  const dateStr = new Date(invoice.at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })

  const scale = 2 // 2x Retina scale for ultra-crisp mobile viewing
  const canvas = document.createElement("canvas")
  const ctx = canvas.getContext("2d")!

  if (format === "style1") {
    // ==========================================
    // STYLE 1: DETAILED TAX INVOICE (A4 proportion)
    // ==========================================
    const width = 800
    // Dynamic height calculation based on lines count
    const baseHeight = 620
    const linesHeight = Math.max(1, invoice.lines.length) * 28
    const height = baseHeight + linesHeight

    canvas.width = width * scale
    canvas.height = height * scale
    ctx.scale(scale, scale)

    // White background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    // Outer border
    ctx.strokeStyle = "#1c1917" // stone-900
    ctx.lineWidth = 1.5
    ctx.strokeRect(30, 30, width - 60, height - 60)

    let y = 60

    // Store Name & Header
    ctx.fillStyle = "#0c0a09"
    ctx.font = "bold 22px system-ui, -apple-system, sans-serif"
    ctx.fillText(shop.name || "Retail Store", 50, y)

    // TAX INVOICE Badge (Top Right)
    ctx.font = "bold 12px system-ui, -apple-system, sans-serif"
    ctx.fillStyle = "#000000"
    const badgeText = "TAX INVOICE"
    const badgeWidth = ctx.measureText(badgeText).width + 16
    ctx.strokeRect(width - 50 - badgeWidth, y - 18, badgeWidth, 22)
    ctx.fillText(badgeText, width - 50 - badgeWidth + 8, y - 2)

    y += 18
    ctx.font = "12px system-ui, -apple-system, sans-serif"
    ctx.fillStyle = "#57534e"
    if (shop.address) {
      ctx.fillText(shop.address, 50, y)
      y += 16
    }
    const storeContact = [
      shop.phone ? `Ph: ${shop.phone}` : "",
      shop.gstin ? `GSTIN: ${shop.gstin}` : "",
    ]
      .filter(Boolean)
      .join("  |  ")
    if (storeContact) {
      ctx.fillText(storeContact, 50, y)
      y += 16
    }

    // Top right invoice metadata
    ctx.font = "bold 13px monospace"
    ctx.fillStyle = "#0c0a09"
    ctx.fillText(
      invoice.number,
      width - 50 - ctx.measureText(invoice.number).width,
      86,
    )
    ctx.font = "11px system-ui, -apple-system, sans-serif"
    ctx.fillStyle = "#78716c"
    ctx.fillText(dateStr, width - 50 - ctx.measureText(dateStr).width, 102)
    const modeText = `Mode: ${invoice.payment}`
    ctx.fillText(modeText, width - 50 - ctx.measureText(modeText).width, 118)

    y = Math.max(y, 118) + 12

    // Header divider line
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(50, y)
    ctx.lineTo(width - 50, y)
    ctx.stroke()
    y += 16

    // Billed To / Customer Box
    const boxHeight = custAddress ? 56 : 46
    ctx.fillStyle = "#f5f5f4" // stone-100
    ctx.fillRect(50, y, width - 100, boxHeight)
    ctx.strokeStyle = "#e7e5e4"
    ctx.lineWidth = 1
    ctx.strokeRect(50, y, width - 100, boxHeight)

    ctx.fillStyle = "#78716c"
    ctx.font = "bold 10px system-ui, -apple-system, sans-serif"
    ctx.fillText("CUSTOMER DETAILS:", 62, y + 16)
    ctx.fillText("DELIVERY / BILLING ADDRESS:", width / 2 + 10, y + 16)

    ctx.fillStyle = "#1c1917"
    ctx.font = "bold 13px system-ui, -apple-system, sans-serif"
    const nameLine = custPhone ? `${custName} (${custPhone})` : custName
    ctx.fillText(nameLine, 62, y + 34)

    ctx.font = "12px system-ui, -apple-system, sans-serif"
    ctx.fillStyle = "#44403c"
    ctx.fillText(
      custAddress || "Over the counter delivery",
      width / 2 + 10,
      y + 34,
    )

    y += boxHeight + 20

    // Table Header
    const colX = {
      sno: 50,
      item: 90,
      qty: 450,
      rate: 530,
      gst: 620,
      total: 750,
    }
    ctx.fillStyle = "#f5f5f4"
    ctx.fillRect(50, y, width - 100, 26)
    ctx.strokeStyle = "#1c1917"
    ctx.lineWidth = 1
    ctx.strokeRect(50, y, width - 100, 26)

    ctx.fillStyle = "#1c1917"
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif"
    ctx.fillText("S.No", colX.sno + 8, y + 17)
    ctx.fillText("Product / Item Description", colX.item, y + 17)
    ctx.fillText("Qty", colX.qty, y + 17)
    ctx.fillText("Rate (₹)", colX.rate, y + 17)
    ctx.fillText("GST %", colX.gst, y + 17)
    ctx.fillText(
      "Total (₹)",
      colX.total - ctx.measureText("Total (₹)").width,
      y + 17,
    )

    y += 26

    // Table Rows
    invoice.lines.forEach((l, idx) => {
      const cl = calcLine(l)
      ctx.fillStyle = idx % 2 === 1 ? "#fafaf9" : "#ffffff"
      ctx.fillRect(50, y, width - 100, 28)

      ctx.strokeStyle = "#e7e5e4"
      ctx.strokeRect(50, y, width - 100, 28)

      ctx.fillStyle = "#57534e"
      ctx.font = "11px system-ui, -apple-system, sans-serif"
      ctx.fillText(String(idx + 1), colX.sno + 12, y + 18)

      ctx.fillStyle = "#1c1917"
      ctx.font = "500 12px system-ui, -apple-system, sans-serif"
      ctx.fillText(l.name.slice(0, 42), colX.item, y + 18)

      ctx.font = "12px system-ui, -apple-system, sans-serif"
      ctx.fillText(String(l.qty), colX.qty + 4, y + 18)
      ctx.fillText(`₹${(l.price / 100).toFixed(2)}`, colX.rate, y + 18)
      ctx.fillText(`${l.gst}%`, colX.gst + 4, y + 18)

      ctx.font = "bold 12px system-ui, -apple-system, sans-serif"
      const totStr = `₹${(cl.total / 100).toFixed(2)}`
      ctx.fillText(totStr, colX.total - ctx.measureText(totStr).width, y + 18)

      y += 28
    })

    y += 16

    // Amount in words (Left side) & Calculations Box (Right side)
    const summaryBoxY = y
    ctx.fillStyle = "#78716c"
    ctx.font = "bold 10px system-ui, -apple-system, sans-serif"
    ctx.fillText("AMOUNT IN WORDS:", 50, summaryBoxY + 12)
    ctx.fillStyle = "#1c1917"
    ctx.font = "italic 12px system-ui, -apple-system, sans-serif"
    ctx.fillText(paiseToWords(bill.total), 50, summaryBoxY + 30)

    // Summary Box
    const sumW = 250
    const sumX = width - 50 - sumW
    ctx.strokeStyle = "#1c1917"
    ctx.lineWidth = 1
    ctx.strokeRect(sumX, summaryBoxY, sumW, 116)

    let sumRowY = summaryBoxY + 18
    const drawSummaryRow = (lbl: string, val: string, bold = false) => {
      ctx.fillStyle = bold ? "#0c0a09" : "#44403c"
      ctx.font = bold
        ? "bold 13px system-ui, -apple-system, sans-serif"
        : "11px system-ui, -apple-system, sans-serif"
      ctx.fillText(lbl, sumX + 12, sumRowY)
      ctx.fillText(val, sumX + sumW - 12 - ctx.measureText(val).width, sumRowY)
      sumRowY += 18
    }

    drawSummaryRow("Taxable Amount:", `₹${(bill.taxable / 100).toFixed(2)}`)
    if (bill.billDiscount > 0) {
      drawSummaryRow("Discount:", `-₹${(bill.billDiscount / 100).toFixed(2)}`)
    }
    drawSummaryRow("CGST:", `₹${(bill.cgst / 100).toFixed(2)}`)
    drawSummaryRow("SGST:", `₹${(bill.sgst / 100).toFixed(2)}`)

    // Divider in summary
    ctx.strokeStyle = "#1c1917"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(sumX, sumRowY - 4)
    ctx.lineTo(sumX + sumW, sumRowY - 4)
    ctx.stroke()
    sumRowY += 6

    drawSummaryRow(
      `Grand Total (${invoice.payment}):`,
      `₹${(bill.total / 100).toFixed(2)}`,
      true,
    )

    y = Math.max(summaryBoxY + 130, y + 130)

    // Store Authorised Signatory (Aligned to right)
    const signX = width - 210
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(signX, y + 45)
    ctx.lineTo(width - 50, y + 45)
    ctx.stroke()

    ctx.fillStyle = "#0c0a09"
    ctx.font = "bold 11px system-ui, -apple-system, sans-serif"
    ctx.fillText("Authorised Signatory", signX + 25, y + 60)
    ctx.font = "10px system-ui, -apple-system, sans-serif"
    ctx.fillStyle = "#78716c"
    ctx.fillText(shop.name || "Store Management", signX + 25, y + 74)
  } else {
    // ==========================================
    // STYLE 2: COMPACT THERMAL POS SLIP (80mm)
    // ==========================================
    const width = 440
    const baseHeight = 380
    const linesHeight = Math.max(1, invoice.lines.length) * 24
    const height = baseHeight + linesHeight

    canvas.width = width * scale
    canvas.height = height * scale
    ctx.scale(scale, scale)

    // White background
    ctx.fillStyle = "#ffffff"
    ctx.fillRect(0, 0, width, height)

    // Outer subtle border
    ctx.strokeStyle = "#d6d3d1"
    ctx.lineWidth = 1
    ctx.strokeRect(10, 10, width - 20, height - 20)

    let y = 40

    // Store Name
    ctx.fillStyle = "#0c0a09"
    ctx.font = "bold 18px monospace"
    const nameWidth = ctx.measureText(shop.name || "Store").width
    ctx.fillText(shop.name || "Store", (width - nameWidth) / 2, y)
    y += 18

    ctx.font = "11px monospace"
    ctx.fillStyle = "#57534e"
    if (shop.address) {
      const addrW = ctx.measureText(shop.address).width
      ctx.fillText(shop.address, (width - addrW) / 2, y)
      y += 16
    }
    if (shop.phone) {
      const phStr = `Ph: ${shop.phone}`
      ctx.fillText(phStr, (width - ctx.measureText(phStr).width) / 2, y)
      y += 16
    }
    if (shop.gstin) {
      const gstStr = `GSTIN: ${shop.gstin}`
      ctx.fillText(gstStr, (width - ctx.measureText(gstStr).width) / 2, y)
      y += 16
    }

    const metaLine = `${invoice.number}  |  ${dateStr}`
    ctx.fillText(metaLine, (width - ctx.measureText(metaLine).width) / 2, y)
    y += 16

    if (custName && custName !== "Walk-in Customer") {
      const cStr = `Customer: ${custName} ${custPhone ? `(${custPhone})` : ""}`
      ctx.fillText(cStr, 30, y)
      y += 16
      if (custAddress) {
        ctx.fillText(`Addr: ${custAddress.slice(0, 36)}`, 30, y)
        y += 16
      }
    }

    // Dashed divider
    ctx.strokeStyle = "#0c0a09"
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(30, y)
    ctx.lineTo(width - 30, y)
    ctx.stroke()
    ctx.setLineDash([])
    y += 18

    // Slip Items
    invoice.lines.forEach((l) => {
      const cl = calcLine(l)
      ctx.fillStyle = "#0c0a09"
      ctx.font = "12px monospace"
      ctx.fillText(`${l.qty}x ${l.name.slice(0, 24)}`, 30, y)
      const prStr = `₹${(cl.total / 100).toFixed(2)}`
      ctx.fillText(prStr, width - 30 - ctx.measureText(prStr).width, y)
      y += 20
    })

    // Dashed divider
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(30, y)
    ctx.lineTo(width - 30, y)
    ctx.stroke()
    ctx.setLineDash([])
    y += 18

    // Calculations
    ctx.font = "11px monospace"
    ctx.fillStyle = "#44403c"

    const drawSlipRow = (lbl: string, val: string, bold = false) => {
      ctx.font = bold ? "bold 14px monospace" : "11px monospace"
      ctx.fillStyle = bold ? "#000000" : "#44403c"
      ctx.fillText(lbl, 30, y)
      ctx.fillText(val, width - 30 - ctx.measureText(val).width, y)
      y += bold ? 24 : 16
    }

    drawSlipRow(
      "Subtotal:",
      `₹${((bill.total - bill.cgst - bill.sgst) / 100).toFixed(2)}`,
    )
    drawSlipRow(
      "GST (CGST+SGST):",
      `₹${((bill.cgst + bill.sgst) / 100).toFixed(2)}`,
    )
    if (bill.billDiscount > 0) {
      drawSlipRow("Discount:", `-₹${(bill.billDiscount / 100).toFixed(2)}`)
    }

    // Solid line before total
    ctx.strokeStyle = "#000000"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(30, y)
    ctx.lineTo(width - 30, y)
    ctx.stroke()
    y += 18

    drawSlipRow(
      `TOTAL (${invoice.payment}):`,
      `₹${(bill.total / 100).toFixed(2)}`,
      true,
    )

    y += 8
    ctx.font = "italic 11px monospace"
    ctx.fillStyle = "#78716c"
    const thxStr = "Thank you for shopping with us! Visit again."
    ctx.fillText(thxStr, (width - ctx.measureText(thxStr).width) / 2, y)
  }

  return canvas
}

/**
 * Convert rendered canvas to PNG Blob
 */
export function renderInvoiceToBlob(
  invoice: Invoice,
  shop: ShopProfile,
  customer?: CustomerInfo,
  format: "style1" | "style2" = "style1",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const canvas = renderInvoiceToCanvas(invoice, shop, customer, format)
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error("Canvas toBlob failed"))
      }, "image/png")
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Copy invoice image directly to the system clipboard
 */
export async function copyInvoiceImageToClipboard(
  invoice: Invoice,
  shop: ShopProfile,
  customer?: CustomerInfo,
  format: "style1" | "style2" = "style1",
): Promise<boolean> {
  try {
    const blob = await renderInvoiceToBlob(invoice, shop, customer, format)
    await navigator.clipboard.write([
      new ClipboardItem({
        "image/png": blob,
      }),
    ])
    return true
  } catch (err) {
    console.warn("Failed to copy image to clipboard", err)
    return false
  }
}

/**
 * Download Invoice Image as PNG to user disk
 */
export async function downloadInvoiceImage(
  invoice: Invoice,
  shop: ShopProfile,
  customer?: CustomerInfo,
  format: "style1" | "style2" = "style1",
): Promise<string> {
  const blob = await renderInvoiceToBlob(invoice, shop, customer, format)
  const url = URL.createObjectURL(blob)
  const filename = `${invoice.number}_${
    format === "style1" ? "Style1" : "Style2"
  }.png`
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return filename
}
