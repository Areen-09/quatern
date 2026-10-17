import re
from typing import List, Dict, Any

def extract_invoice_lines_from_text(text: str) -> List[Dict[str, Any]]:
    """
    Heuristic parser for extracted supplier bill text to find line items (name, qty, cost).
    Works as fallback or baseline extractor.
    """
    lines = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # Pattern matching: Item Name ... Qty ... Price/Total
        match = re.search(r"([A-Za-z\s\d\-\(\)]+?)\s+(\d+)\s+([0-9\.]+)", line)
        if match:
            item_name = match.group(1).strip()
            qty = int(match.group(2))
            price_f = float(match.group(3))
            if item_name and qty > 0 and price_f > 0:
                lines.append({
                    "name": item_name,
                    "qty": qty,
                    "cost": int(price_f * 100)  # integer paise
                })
    return lines

def process_supplier_invoice(file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Pluggable OCR hook. If easyocr or pytesseract or a local LLM is available, it processes here.
    Otherwise returns template structure with helpful prompt.
    """
    try:
        import pytesseract
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(file_bytes))
        raw_text = pytesseract.image_to_string(img)
        lines = extract_invoice_lines_from_text(raw_text)
        return {
            "success": True,
            "rawText": raw_text,
            "lines": lines,
            "engine": "pytesseract"
        }
    except ImportError:
        pass
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "lines": []
        }

    return {
        "success": False,
        "message": "OCR engine not yet installed. Install pytesseract or easyocr with: uv pip install pytesseract pillow",
        "lines": []
    }
