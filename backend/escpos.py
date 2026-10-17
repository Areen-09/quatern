import datetime
from typing import List
from .models import Invoice

class EscPosBuilder:
    def __init__(self, is_80mm: bool = True):
        self.buffer = bytearray()
        self.width_chars = 48 if is_80mm else 32
        self.init()

    def init(self):
        self.buffer.extend(b"\x1b\x40")  # ESC @
        return self

    def align_center(self):
        self.buffer.extend(b"\x1b\x61\x01")  # ESC a 1
        return self

    def align_left(self):
        self.buffer.extend(b"\x1b\x61\x00")  # ESC a 0
        return self

    def bold(self, enable: bool):
        self.buffer.extend(b"\x1b\x45\x01" if enable else b"\x1b\x45\x00")
        return self

    def title_size(self):
        self.buffer.extend(b"\x1d\x21\x11")  # GS ! (2x width + 2x height)
        return self

    def normal_size(self):
        self.buffer.extend(b"\x1d\x21\x00")  # GS ! (1x)
        return self

    def text(self, s: str):
        self.buffer.extend(s.encode("utf-8", errors="replace"))
        return self

    def text_ln(self, s: str):
        self.text(s)
        self.buffer.append(0x0A)  # LF
        return self

    def divider(self):
        self.text_ln("-" * self.width_chars)
        return self

    def row_2_col(self, left: str, right: str):
        left_len = len(left)
        right_len = len(right)
        if left_len + right_len >= self.width_chars:
            max_left = max(0, self.width_chars - right_len - 1)
            truncated = left[:max_left]
            spaces = max(0, self.width_chars - len(truncated) - right_len)
            self.text_ln(f"{truncated}{' ' * spaces}{right}")
        else:
            spaces = self.width_chars - left_len - right_len
            self.text_ln(f"{left}{' ' * spaces}{right}")
        return self

    def feed(self, lines: int = 3):
        self.buffer.extend(bytes([0x1B, 0x64, lines]))
        return self

    def cut(self):
        self.feed(3)
        self.buffer.extend(b"\x1d\x56\x42\x00")  # GS V 66 0 (Feed and Cut)
        return self

    def build(self) -> bytes:
        return bytes(self.buffer)

def format_invoice_receipt(invoice: Invoice, shop_name: str, shop_gstin: str, is_80mm: bool) -> bytes:
    builder = EscPosBuilder(is_80mm)
    builder.align_center().bold(True).title_size().text_ln(shop_name).normal_size().bold(False)

    if shop_gstin:
        builder.text_ln(f"GSTIN: {shop_gstin}")

    builder.text_ln("TAX INVOICE").align_left().divider()
    builder.row_2_col(f"Bill: {invoice.number}", f"Mode: {invoice.payment}")

    dt_str = datetime.datetime.fromtimestamp(invoice.at / 1000).strftime("%d-%m-%Y %H:%M")
    builder.text_ln(f"Date: {dt_str}").divider()

    header_left = "Item (Qty x Price)" if is_80mm else "Item"
    builder.row_2_col(header_left, "Total (Rs)").divider()

    for line in invoice.lines:
        line_total = (line.price * line.qty) / 100.0
        line_total_str = f"{line_total:.2f}"
        qty_price = f"{line.qty} x {line.price / 100.0:.2f}"

        builder.text_ln(line.name)
        builder.row_2_col(f"  {qty_price}", line_total_str)

    builder.divider()
    tax_str = f"{invoice.tax / 100.0:.2f}"
    total_str = f"{invoice.total / 100.0:.2f}"

    builder.row_2_col("CGST / SGST Tax:", f"Rs {tax_str}")
    builder.bold(True).row_2_col("NET PAYABLE:", f"Rs {total_str}").bold(False)
    builder.divider().align_center().text_ln("Thank you for shopping with us!").text_ln("Please visit again").cut()

    return builder.build()
