import * as XLSX from "xlsx"
import { Product, Customer, uid } from "./store"
import { parseToPaise } from "./money"

export type ImportTarget = "products" | "customers"

export interface ParseResult {
  sheetNames: string[]
  activeSheet: string
  headers: string[]
  rawRows: Record<string, any>[]
  totalRows: number
}

// Field definitions for Product mapping
export interface ProductFieldMapping {
  name: string
  sku: string
  category: string
  price: string
  cost: string
  stock: string
  unit: string
  gst: string
  reorder: string
}

// Field definitions for Customer mapping
export interface CustomerFieldMapping {
  name: string
  phone: string
  address: string
  tags: string
  consent: string
}

/**
 * Normalizes string for fuzzy header comparison
 */
function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .replace(/[_\-\/\s\(\)\%\#\.]+/g, "")
    .trim()
}

/**
 * Auto-detect column mapping for products based on spreadsheet headers
 */
export function autoDetectProductMapping(
  headers: string[],
): ProductFieldMapping {
  const mapping: ProductFieldMapping = {
    name: "",
    sku: "",
    category: "",
    price: "",
    cost: "",
    stock: "",
    unit: "",
    gst: "",
    reorder: "",
  }

  for (const h of headers) {
    const norm = normalizeHeader(h)

    // Name
    if (
      !mapping.name &&
      (norm === "name" ||
        norm === "itemname" ||
        norm === "productname" ||
        norm === "item" ||
        norm === "product" ||
        norm === "description" ||
        norm === "itemdescription")
    ) {
      mapping.name = h
    }
    // SKU / Barcode
    else if (
      !mapping.sku &&
      (norm === "sku" ||
        norm === "barcode" ||
        norm === "code" ||
        norm === "itemcode" ||
        norm === "productcode" ||
        norm === "upc" ||
        norm === "ean")
    ) {
      mapping.sku = h
    }
    // Category
    else if (
      !mapping.category &&
      (norm === "category" ||
        norm === "group" ||
        norm === "department" ||
        norm === "type" ||
        norm === "itemgroup" ||
        norm === "cat")
    ) {
      mapping.category = h
    }
    // Selling Price / MRP
    else if (
      !mapping.price &&
      (norm === "price" ||
        norm === "sellingprice" ||
        norm === "saleprice" ||
        norm === "mrp" ||
        norm === "rate" ||
        norm === "unitprice" ||
        norm === "retailprice")
    ) {
      mapping.price = h
    }
    // Cost Price
    else if (
      !mapping.cost &&
      (norm === "cost" ||
        norm === "costprice" ||
        norm === "purchaseprice" ||
        norm === "buyingprice" ||
        norm === "purchaserate" ||
        norm === "buyprice")
    ) {
      mapping.cost = h
    }
    // Stock / Quantity
    else if (
      !mapping.stock &&
      (norm === "stock" ||
        norm === "quantity" ||
        norm === "qty" ||
        norm === "openingstock" ||
        norm === "currentstock" ||
        norm === "balance" ||
        norm === "inventory")
    ) {
      mapping.stock = h
    }
    // Unit
    else if (
      !mapping.unit &&
      (norm === "unit" ||
        norm === "uom" ||
        norm === "unitofmeasure" ||
        norm === "measurement" ||
        norm === "pack")
    ) {
      mapping.unit = h
    }
    // GST %
    else if (
      !mapping.gst &&
      (norm === "gst" ||
        norm === "gstrate" ||
        norm === "tax" ||
        norm === "taxrate" ||
        norm === "taxpct" ||
        norm === "gstpct" ||
        norm === "gstpercentage")
    ) {
      mapping.gst = h
    }
    // Reorder
    else if (
      !mapping.reorder &&
      (norm === "reorder" ||
        norm === "reorderlevel" ||
        norm === "minstock" ||
        norm === "minimumstock" ||
        norm === "alertlevel" ||
        norm === "minqty")
    ) {
      mapping.reorder = h
    }
  }

  return mapping
}

/**
 * Auto-detect column mapping for customers based on spreadsheet headers
 */
export function autoDetectCustomerMapping(
  headers: string[],
): CustomerFieldMapping {
  const mapping: CustomerFieldMapping = {
    name: "",
    phone: "",
    address: "",
    tags: "",
    consent: "",
  }

  for (const h of headers) {
    const norm = normalizeHeader(h)

    // Name
    if (
      !mapping.name &&
      (norm === "name" ||
        norm === "customername" ||
        norm === "clientname" ||
        norm === "partyname" ||
        norm === "customer" ||
        norm === "party" ||
        norm === "client")
    ) {
      mapping.name = h
    }
    // Phone
    else if (
      !mapping.phone &&
      (norm === "phone" ||
        norm === "mobile" ||
        norm === "contact" ||
        norm === "phonenumber" ||
        norm === "mobilenumber" ||
        norm === "whatsapp" ||
        norm === "cell")
    ) {
      mapping.phone = h
    }
    // Address
    else if (
      !mapping.address &&
      (norm === "address" ||
        norm === "location" ||
        norm === "city" ||
        norm === "billingaddress" ||
        norm === "customeraddress" ||
        norm === "street")
    ) {
      mapping.address = h
    }
    // Tags
    else if (
      !mapping.tags &&
      (norm === "tags" ||
        norm === "tag" ||
        norm === "segment" ||
        norm === "group" ||
        norm === "customertype" ||
        norm === "category")
    ) {
      mapping.tags = h
    }
    // Consent
    else if (
      !mapping.consent &&
      (norm === "consent" ||
        norm === "marketing" ||
        norm === "optin" ||
        norm === "whatsappconsent" ||
        norm === "smsconsent")
    ) {
      mapping.consent = h
    }
  }

  return mapping
}

/**
 * Reads an uploaded File (XLSX, XLS, CSV) into parsed rows and column headers
 */
export async function parseSpreadsheetFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: "array" })

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Spreadsheet contains no readable worksheets.")
  }

  const activeSheet = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[activeSheet]

  // Read as array of rows with raw header array
  const rawData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
  })

  if (rawData.length === 0) {
    throw new Error("Spreadsheet is completely empty.")
  }

  // Find header row (first non-empty row)
  let headerRowIdx = -1
  for (let i = 0; i < Math.min(rawData.length, 10); i++) {
    const row = rawData[i]
    if (row && row.some((cell: any) => String(cell).trim().length > 0)) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx === -1) {
    throw new Error("No header columns found in spreadsheet.")
  }

  const headers = rawData[headerRowIdx].map((h: any, idx: number) => {
    const str = String(h).trim()
    return str ? str : `Column_${idx + 1}`
  })

  // Convert remaining rows into record objects
  const rawRows: Record<string, any>[] = []
  for (let r = headerRowIdx + 1; r < rawData.length; r++) {
    const row = rawData[r]
    if (!row || !row.some((c: any) => String(c).trim().length > 0)) continue

    const record: Record<string, any> = {}
    headers.forEach((h, colIdx) => {
      record[h] = row[colIdx] !== undefined ? row[colIdx] : ""
    })
    rawRows.push(record)
  }

  return {
    sheetNames: workbook.SheetNames,
    activeSheet,
    headers,
    rawRows,
    totalRows: rawRows.length,
  }
}

/**
 * Converts parsed spreadsheet rows into validated Product domain objects
 */
export function buildProductsFromRows(
  rows: Record<string, any>[],
  mapping: ProductFieldMapping,
  defaultSupplierId: string = "s1",
): { products: Product[] skippedCount: number errors: string[] } {
  const products: Product[] = []
  let skippedCount = 0
  const errors: string[] = []

  rows.forEach((row, idx) => {
    const rawName = mapping.name ? String(row[mapping.name] || "").trim() : ""
    if (!rawName) {
      skippedCount++
      return
    }

    const sku = mapping.sku ? String(row[mapping.sku] || "").trim() : ""
    const category = mapping.category
      ? String(row[mapping.category] || "").trim()
      : "General"
    const pricePaise = mapping.price ? parseToPaise(row[mapping.price]) : 0
    const costPaise = mapping.cost ? parseToPaise(row[mapping.cost]) : 0

    let stockNum = 0
    if (
      mapping.stock &&
      row[mapping.stock] !== undefined &&
      row[mapping.stock] !== ""
    ) {
      const parsedStock = parseFloat(
        String(row[mapping.stock]).replace(/[^\d.-]/g, ""),
      )
      if (!isNaN(parsedStock)) stockNum = Math.round(parsedStock)
    }

    const unit = mapping.unit
      ? String(row[mapping.unit] || "")
          .trim()
          .toLowerCase()
      : "pc"

    let gstNum = 5
    if (
      mapping.gst &&
      row[mapping.gst] !== undefined &&
      row[mapping.gst] !== ""
    ) {
      const parsedGst = parseFloat(
        String(row[mapping.gst]).replace(/[^\d.]/g, ""),
      )
      if (!isNaN(parsedGst)) gstNum = Math.round(parsedGst)
    }

    let reorderNum = 5
    if (
      mapping.reorder &&
      row[mapping.reorder] !== undefined &&
      row[mapping.reorder] !== ""
    ) {
      const parsedReorder = parseFloat(
        String(row[mapping.reorder]).replace(/[^\d.]/g, ""),
      )
      if (!isNaN(parsedReorder)) reorderNum = Math.round(parsedReorder)
    }

    products.push({
      id: uid(),
      sku: sku || `SKU-${idx + 1001}`,
      name: rawName,
      category: category || "General",
      price: pricePaise,
      cost: costPaise,
      gst: gstNum,
      stock: stockNum,
      reorder: reorderNum,
      supplierId: defaultSupplierId,
      unit: unit || "pc",
    })
  })

  return { products, skippedCount, errors }
}

/**
 * Converts parsed spreadsheet rows into validated Customer domain objects
 */
export function buildCustomersFromRows(
  rows: Record<string, any>[],
  mapping: CustomerFieldMapping,
): { customers: Customer[] skippedCount: number errors: string[] } {
  const customers: Customer[] = []
  let skippedCount = 0
  const errors: string[] = []

  rows.forEach((row) => {
    const rawName = mapping.name ? String(row[mapping.name] || "").trim() : ""
    const rawPhone = mapping.phone
      ? String(row[mapping.phone] || "")
          .replace(/[^\d]/g, "")
          .trim()
      : ""

    if (!rawName && !rawPhone) {
      skippedCount++
      return
    }

    const address = mapping.address
      ? String(row[mapping.address] || "").trim()
      : ""
    const rawTags = mapping.tags ? String(row[mapping.tags] || "").trim() : ""
    const tags = rawTags
      ? rawTags
          .split(/[,;\/]+/)
          .map((t) => t.trim())
          .filter(Boolean)
      : ["Regular"]

    let consent = true
    if (mapping.consent && row[mapping.consent] !== undefined) {
      const cStr = String(row[mapping.consent]).toLowerCase().trim()
      if (cStr === "no" || cStr === "false" || cStr === "0" || cStr === "n") {
        consent = false
      }
    }

    customers.push({
      id: uid(),
      name: rawName || "Customer",
      phone: rawPhone,
      address,
      tags: tags.length > 0 ? tags : ["Regular"],
      consent,
      createdAt: Date.now(),
    })
  })

  return { customers, skippedCount, errors }
}

/**
 * Downloads a standardized Product spreadsheet template in XLSX or CSV format
 */
export function downloadSampleProductTemplate(format: "xlsx" | "csv" = "xlsx") {
  const sampleProducts = [
    {
      "Item Name": "Basmati Rice 5kg",
      "SKU / Barcode": "RIC-001",
      Category: "Grocery",
      "Selling Price": 450,
      "Cost Price": 380,
      "Stock Quantity": 25,
      Unit: "bag",
      "GST %": 5,
      "Reorder Level": 5,
    },
    {
      "Item Name": "Toor Dal 1kg",
      "SKU / Barcode": "DAL-002",
      Category: "Pulses",
      "Selling Price": 160,
      "Cost Price": 135,
      "Stock Quantity": 40,
      Unit: "kg",
      "GST %": 0,
      "Reorder Level": 10,
    },
    {
      "Item Name": "Sunflower Oil 1L",
      "SKU / Barcode": "OIL-003",
      Category: "Edible Oils",
      "Selling Price": 145,
      "Cost Price": 125,
      "Stock Quantity": 50,
      Unit: "ltr",
      "GST %": 5,
      "Reorder Level": 12,
    },
    {
      "Item Name": "Cadbury Silk Chocolate 60g",
      "SKU / Barcode": "CHO-004",
      Category: "Confectionery",
      "Selling Price": 80,
      "Cost Price": 68,
      "Stock Quantity": 30,
      Unit: "pc",
      "GST %": 18,
      "Reorder Level": 8,
    },
  ]

  const ws = XLSX.utils.json_to_sheet(sampleProducts)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Inventory")

  if (format === "csv") {
    XLSX.writeFile(wb, "quatern_products_template.csv", { bookType: "csv" })
  } else {
    XLSX.writeFile(wb, "quatern_products_template.xlsx", { bookType: "xlsx" })
  }
}

/**
 * Downloads a standardized Customer spreadsheet template in XLSX or CSV format
 */
export function downloadSampleCustomerTemplate(
  format: "xlsx" | "csv" = "xlsx",
) {
  const sampleCustomers = [
    {
      "Customer Name": "Rajesh Kumar",
      Phone: "9876543210",
      Address: "Flat 302, Gokul Dham, MG Road, Mumbai",
      Tags: "VIP, Regular",
      Consent: "Yes",
    },
    {
      "Customer Name": "Pooja Sharma",
      Phone: "9812345678",
      Address: "Shop 4, Market Yard, Pune",
      Tags: "Wholesale",
      Consent: "Yes",
    },
    {
      "Customer Name": "Amit Patel",
      Phone: "9823456789",
      Address: "12 Sardar Patel Society, Ahmedabad",
      Tags: "New",
      Consent: "Yes",
    },
  ]

  const ws = XLSX.utils.json_to_sheet(sampleCustomers)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Customers")

  if (format === "csv") {
    XLSX.writeFile(wb, "quatern_customers_template.csv", { bookType: "csv" })
  } else {
    XLSX.writeFile(wb, "quatern_customers_template.xlsx", { bookType: "xlsx" })
  }
}
