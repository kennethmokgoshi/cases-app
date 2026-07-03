"""
Zenowethu Consumer Refund Request Form
Fillable PDF with AcroForm fields and Zenowethu letterhead.
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
import io

OUTPUT = r"C:\Visual Studio Code\06 March 2026\docs\files\Zenowethu_Refund_Request_Form.pdf"

# Brand colours
NAVY   = HexColor("#0B1D35")
AMBER  = HexColor("#C4953A")
LIGHT  = HexColor("#F5F7FA")
GREY   = HexColor("#6B7280")
BORDER = HexColor("#D1D5DB")

W, H = A4  # 595 x 842 pt


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def field_bg(c, x, y, w, h):
    """Draw a light-grey fillable field background with border."""
    c.setFillColor(LIGHT)
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.roundRect(x, y, w, h, 2, fill=1, stroke=1)


def text_field(c, name, x, y, w, h, tooltip="", multiline=False, value=""):
    """Add an AcroForm text field."""
    field_bg(c, x, y, w, h)
    form = c.acroForm
    form.textfield(
        name=name,
        tooltip=tooltip,
        x=x + 2, y=y + 2,
        width=w - 4, height=h - 4,
        borderColor=None,
        fillColor=None,
        textColor=black,
        fontSize=8,
        fieldFlags="multiline" if multiline else "",
        value=value,
        forceBorder=False,
    )


def checkbox_field(c, name, x, y, size=10, tooltip="", checked=False):
    """Add an AcroForm checkbox."""
    form = c.acroForm
    form.checkbox(
        name=name,
        tooltip=tooltip,
        x=x, y=y,
        buttonStyle="check",
        borderColor=NAVY,
        fillColor=white,
        textColor=NAVY,
        size=size,
        checked=checked,
        forceBorder=True,
    )


def section_header(c, text, x, y, w, h=14):
    """Coloured section header bar."""
    c.setFillColor(NAVY)
    c.roundRect(x, y, w, h, 2, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(x + 6, y + 3.5, text.upper())


def label(c, text, x, y, bold=False, size=7.5, color=None):
    c.setFillColor(color or NAVY)
    c.setFont("Helvetica-Bold" if bold else "Helvetica", size)
    c.drawString(x, y, text)


def small(c, text, x, y, color=None):
    c.setFillColor(color or GREY)
    c.setFont("Helvetica-Oblique", 6.5)
    c.drawString(x, y, text)


# ---------------------------------------------------------------------------
# Header
# ---------------------------------------------------------------------------

def draw_header(c):
    # Navy top bar
    c.setFillColor(NAVY)
    c.rect(0, H - 28*mm, W, 28*mm, fill=1, stroke=0)

    # Amber accent stripe
    c.setFillColor(AMBER)
    c.rect(0, H - 28*mm, W, 2, fill=1, stroke=0)

    # Company name
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(14*mm, H - 14*mm, "ZENOWETHU")
    c.setFont("Helvetica", 8)
    c.drawString(14*mm, H - 19*mm, "DEBT COUNSELLING & CREDIT SOLUTIONS")

    # Contact info block (right-aligned)
    contact_lines = [
        "Aaron Nzotho  |  NCRDC3693",
        "Suite 2, 2nd Floor, Central House, 17 Central Road, Mabopane, 0190",
        "Tel: +27 81 747 7616   Cell: 082 363 8207",
        "info@zenowethu.co.za   |   www.zenowethu.co.za",
    ]
    c.setFont("Helvetica", 6.5)
    for i, line in enumerate(contact_lines):
        c.drawRightString(W - 14*mm, H - 10*mm - i * 5*mm, line)

    # Document title bar
    c.setFillColor(AMBER)
    c.rect(0, H - 35*mm, W, 7*mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(W / 2, H - 32.5*mm, "CONSUMER OVERCHARGE REFUND REQUEST FORM")


# ---------------------------------------------------------------------------
# Footer
# ---------------------------------------------------------------------------

def draw_footer(c, page_num=1, total=1):
    y_base = 10*mm

    # Thin amber rule
    c.setStrokeColor(AMBER)
    c.setLineWidth(1)
    c.line(14*mm, y_base + 8*mm, W - 14*mm, y_base + 8*mm)

    c.setFillColor(NAVY)
    c.setFont("Helvetica", 6)
    c.drawString(14*mm, y_base + 4*mm,
                 "Member of DCASA  |  Regulated by the National Credit Regulator  |  POPIA Compliant")
    c.drawRightString(W - 14*mm, y_base + 4*mm,
                      f"Page {page_num} of {total}")
    c.drawCentredString(W / 2, y_base,
                        "This form is confidential. Submit to info@zenowethu.co.za or hand-deliver to our office.")


# ---------------------------------------------------------------------------
# Page 1
# ---------------------------------------------------------------------------

def draw_page1(c):
    draw_header(c)
    draw_footer(c, 1, 2)

    margin_l = 14*mm
    margin_r = W - 14*mm
    col_w    = margin_r - margin_l
    y        = H - 40*mm  # start below title bar

    # ── Intro note ──────────────────────────────────────────────────────────
    c.setFillColor(HexColor("#FFF8ED"))
    c.setStrokeColor(AMBER)
    c.setLineWidth(1)
    c.roundRect(margin_l, y - 14*mm, col_w, 13*mm, 3, fill=1, stroke=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(margin_l + 4*mm, y - 4*mm, "IMPORTANT — Please complete all sections in full.")
    c.setFont("Helvetica", 7)
    c.setFillColor(GREY)
    c.drawString(margin_l + 4*mm, y - 8.5*mm,
                 "A refund request will only be processed once all required information is received and verified.")
    c.drawString(margin_l + 4*mm, y - 12*mm,
                 "Processing time: 5–10 business days. You will be contacted via your preferred contact method.")
    y -= 18*mm

    # ── SECTION 1: Consumer Details ─────────────────────────────────────────
    section_header(c, "Section 1 — Consumer Details", margin_l, y, col_w)
    y -= 6*mm

    # Row: Full name / ID number
    label(c, "Full Name *", margin_l, y)
    label(c, "ID / Passport Number *", margin_l + col_w/2 + 2*mm, y)
    y -= 4.5*mm
    fw = col_w/2 - 2*mm
    text_field(c, "full_name",   margin_l,                y - 6, fw,   14, "Full legal name as per ID")
    text_field(c, "id_number",   margin_l + col_w/2 + 2*mm, y - 6, fw, 14, "13-digit SA ID or passport number")
    y -= 18*mm

    # Row: Email / Phone
    label(c, "Email Address *", margin_l, y)
    label(c, "Cell / Phone Number *", margin_l + col_w/2 + 2*mm, y)
    y -= 4.5*mm
    text_field(c, "email",   margin_l,                  y - 6, fw, 14, "e.g. name@email.com")
    text_field(c, "phone",   margin_l + col_w/2 + 2*mm, y - 6, fw, 14, "e.g. 083 000 0000")
    y -= 18*mm

    # Row: Residential address
    label(c, "Residential Address *", margin_l, y)
    y -= 4.5*mm
    text_field(c, "address", margin_l, y - 6, col_w, 14, "Street, City, Province, Postal Code")
    y -= 18*mm

    # Row: Case/reference number / Bank name
    label(c, "Zenowethu Case / File Reference No.", margin_l, y)
    label(c, "Preferred Contact Method", margin_l + col_w/2 + 2*mm, y)
    y -= 4.5*mm
    text_field(c, "case_ref",  margin_l,                  y - 6, fw, 14, "Leave blank if unknown")
    text_field(c, "contact_pref", margin_l + col_w/2 + 2*mm, y - 6, fw, 14, "Email / WhatsApp / Call")
    y -= 22*mm

    # ── SECTION 2: Bank Account for Refund ──────────────────────────────────
    section_header(c, "Section 2 — Bank Account for Refund", margin_l, y, col_w)
    y -= 6*mm

    label(c, "Bank Name *", margin_l, y)
    label(c, "Account Holder Name *", margin_l + col_w/2 + 2*mm, y)
    y -= 4.5*mm
    text_field(c, "bank_name",   margin_l,                  y - 6, fw, 14, "e.g. ABSA, Standard Bank, FNB…")
    text_field(c, "acc_holder",  margin_l + col_w/2 + 2*mm, y - 6, fw, 14, "Full name as per bank account")
    y -= 18*mm

    label(c, "Account Number *", margin_l, y)
    label(c, "Account Type *", margin_l + col_w/2 + 2*mm, y)
    label(c, "Branch Code", margin_l + col_w * 0.75 + 2*mm, y)
    y -= 4.5*mm
    fw3 = col_w * 0.48
    text_field(c, "acc_number", margin_l,                    y - 6, fw3,          14, "Account number")
    text_field(c, "acc_type",   margin_l + col_w/2 + 2*mm,  y - 6, col_w*0.23,   14, "Cheque / Savings / Current")
    text_field(c, "branch",     margin_l + col_w*0.75 + 2*mm, y - 6, col_w*0.25, 14, "6-digit branch code")
    y -= 22*mm

    # ── SECTION 3: Overcharge Type ───────────────────────────────────────────
    section_header(c, "Section 3 — Nature of Overcharge (tick all that apply)", margin_l, y, col_w)
    y -= 7*mm

    types = [
        ("overcharge_debit",         "Debit Order Overcharge — debited more than the agreed instalment amount"),
        ("overcharge_double",        "Double Debit — debited twice in the same month / collection run"),
        ("overcharge_unauthorised",  "Unauthorised Debit — debit taken without agreement or after cancellation"),
        ("overcharge_other",         "Other Overcharge / Billing Error (describe in Section 4)"),
    ]
    for name, desc in types:
        checkbox_field(c, name, margin_l, y - 2, tooltip=desc)
        c.setFont("Helvetica", 7.5)
        c.setFillColor(NAVY)
        c.drawString(margin_l + 6*mm, y, desc)
        y -= 6.5*mm

    y -= 3*mm

    # ── SECTION 4: Overcharge Details ───────────────────────────────────────
    section_header(c, "Section 4 — Overcharge Details", margin_l, y, col_w)
    y -= 6*mm

    label(c, "Date of Overcharge (or first occurrence) *", margin_l, y)
    label(c, "Agreed Monthly Instalment (R) *", margin_l + col_w*0.55, y)
    y -= 4.5*mm
    text_field(c, "overcharge_date",      margin_l,              y - 6, col_w*0.52, 14, "DD/MM/YYYY")
    text_field(c, "agreed_instalment",    margin_l + col_w*0.55, y - 6, col_w*0.45, 14, "e.g. R 1 500.00")
    y -= 18*mm

    label(c, "Amount Actually Debited (R) *", margin_l, y)
    label(c, "Refund Amount Requested (R) *", margin_l + col_w*0.55, y)
    y -= 4.5*mm
    text_field(c, "amount_debited",   margin_l,              y - 6, col_w*0.52, 14, "e.g. R 2 000.00")
    text_field(c, "amount_requested", margin_l + col_w*0.55, y - 6, col_w*0.45, 14, "e.g. R 500.00")
    y -= 18*mm

    label(c, "Name of Debiting Company / Creditor", margin_l, y)
    label(c, "Reference on Bank Statement", margin_l + col_w*0.55, y)
    y -= 4.5*mm
    text_field(c, "debiting_company", margin_l,              y - 6, col_w*0.52, 14, "Company that took the debit")
    text_field(c, "bank_reference",   margin_l + col_w*0.55, y - 6, col_w*0.45, 14, "Exact wording on statement")


# ---------------------------------------------------------------------------
# Page 2
# ---------------------------------------------------------------------------

def draw_page2(c):
    draw_header(c)
    draw_footer(c, 2, 2)

    margin_l = 14*mm
    margin_r = W - 14*mm
    col_w    = margin_r - margin_l
    y        = H - 40*mm

    # ── SECTION 5: Description ───────────────────────────────────────────────
    section_header(c, "Section 5 — Full Description of the Overcharge", margin_l, y, col_w)
    y -= 6*mm

    label(c, "Please describe what happened in your own words (include dates, amounts, and any conversations with creditors):", margin_l, y, size=7)
    y -= 5*mm
    text_field(c, "description", margin_l, y - 40*mm, col_w, 40*mm,
               tooltip="Describe the overcharge in detail", multiline=True)
    y -= 44*mm

    # ── SECTION 6: Prior Steps ───────────────────────────────────────────────
    section_header(c, "Section 6 — Steps Already Taken", margin_l, y, col_w)
    y -= 6*mm

    label(c, "Have you already contacted the creditor or bank about this overcharge?", margin_l, y, size=7.5)
    y -= 5.5*mm
    checkbox_field(c, "contacted_yes", margin_l, y - 2)
    c.setFont("Helvetica", 7.5); c.setFillColor(NAVY)
    c.drawString(margin_l + 6*mm, y, "Yes")
    checkbox_field(c, "contacted_no", margin_l + 15*mm, y - 2)
    c.drawString(margin_l + 21*mm, y, "No")
    y -= 8*mm

    label(c, "If yes, provide reference number or outcome:", margin_l, y, size=7)
    y -= 4.5*mm
    text_field(c, "prior_reference", margin_l, y - 6, col_w, 14, "Reference / case number or outcome of that contact")
    y -= 18*mm

    label(c, "Provide any supporting information (dispute reference, bank query number, complaint ticket, etc.):", margin_l, y, size=7)
    y -= 4.5*mm
    text_field(c, "supporting_info", margin_l, y - 18*mm, col_w, 18*mm,
               tooltip="Dispute references, bank complaint numbers, etc.", multiline=True)
    y -= 22*mm

    # ── SECTION 7: Supporting Documents ─────────────────────────────────────
    section_header(c, "Section 7 — Supporting Documents (attach copies)", margin_l, y, col_w)
    y -= 7*mm

    docs = [
        ("doc_statement",  "Bank statement showing the overcharge (minimum 3 months)"),
        ("doc_agreement",  "Copy of signed debit order / payment agreement"),
        ("doc_id",         "Copy of ID document / passport"),
        ("doc_proof_addr", "Proof of address (not older than 3 months)"),
        ("doc_other",      "Any other relevant documents (correspondence, letters, emails)"),
    ]
    for name, desc in docs:
        checkbox_field(c, name, margin_l, y - 2, tooltip=desc)
        c.setFont("Helvetica", 7.5); c.setFillColor(NAVY)
        c.drawString(margin_l + 6*mm, y, desc)
        y -= 6*mm

    y -= 4*mm

    # ── SECTION 8: Additional Notes ──────────────────────────────────────────
    section_header(c, "Section 8 — Additional Notes / Special Instructions", margin_l, y, col_w)
    y -= 6*mm
    text_field(c, "additional_notes", margin_l, y - 22*mm, col_w, 22*mm,
               tooltip="Anything else you would like us to know", multiline=True)
    y -= 26*mm

    # ── SECTION 9: Declaration & Signature ──────────────────────────────────
    section_header(c, "Section 9 — Declaration & Signature", margin_l, y, col_w)
    y -= 6*mm

    # Declaration text
    c.setFillColor(HexColor("#F9FAFB"))
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.roundRect(margin_l, y - 22*mm, col_w, 21*mm, 3, fill=1, stroke=1)

    c.setFont("Helvetica", 7)
    c.setFillColor(NAVY)
    decl_lines = [
        "I, the undersigned, hereby declare that:",
        "1.  The information provided in this form is true, accurate, and complete to the best of my knowledge.",
        "2.  I authorise Zenowethu Debt Counselling to investigate and act on the overcharge on my behalf.",
        "3.  I understand that Zenowethu may need to contact the creditor, bank, or relevant third party during this process.",
        "4.  I acknowledge that providing false or misleading information may result in this request being declined.",
        "5.  I consent to my personal information being processed in accordance with POPIA for the purpose of resolving this dispute.",
    ]
    for i, line in enumerate(decl_lines):
        c.drawString(margin_l + 3*mm, y - 5*mm - i * 3.5*mm, line)

    y -= 26*mm

    # Signature blocks
    fw = col_w * 0.45
    label(c, "Consumer Signature *", margin_l, y)
    label(c, "Date *", margin_l + col_w/2 + 2*mm, y)
    y -= 4.5*mm
    text_field(c, "signature",  margin_l,                  y - 6, fw, 14, "Sign here or type full name as signature")
    text_field(c, "sign_date",  margin_l + col_w/2 + 2*mm, y - 6, fw, 14, "DD/MM/YYYY")
    y -= 20*mm

    # FOR OFFICE USE ONLY
    c.setFillColor(HexColor("#F0F4F8"))
    c.setStrokeColor(BORDER)
    c.setLineWidth(0.5)
    c.roundRect(margin_l, y - 28*mm, col_w, 27*mm, 3, fill=1, stroke=1)

    c.setFont("Helvetica-Bold", 7.5)
    c.setFillColor(NAVY)
    c.drawString(margin_l + 3*mm, y - 4*mm, "FOR OFFICE USE ONLY")
    c.setLineWidth(0.3)
    c.setStrokeColor(BORDER)
    c.line(margin_l + 3*mm, y - 5.5*mm, margin_r - 3*mm, y - 5.5*mm)

    fw2 = col_w * 0.3 - 2*mm
    office_labels = [
        ("Date Received",       "office_recv_date",   margin_l + 3*mm,       y - 10*mm),
        ("Received By",         "office_recv_by",     margin_l + col_w*0.35, y - 10*mm),
        ("Reference No.",       "office_ref",         margin_l + col_w*0.68, y - 10*mm),
    ]
    for lbl, fname, fx, fy in office_labels:
        c.setFont("Helvetica", 6.5); c.setFillColor(GREY)
        c.drawString(fx, fy, lbl)
        text_field(c, fname, fx, fy - 10, fw2, 10, lbl)

    status_labels = [
        ("Status",              "office_status",      margin_l + 3*mm,       y - 22*mm),
        ("Approved Refund (R)", "office_amount",      margin_l + col_w*0.35, y - 22*mm),
        ("Processing Date",     "office_proc_date",   margin_l + col_w*0.68, y - 22*mm),
    ]
    for lbl, fname, fx, fy in status_labels:
        c.setFont("Helvetica", 6.5); c.setFillColor(GREY)
        c.drawString(fx, fy, lbl)
        text_field(c, fname, fx, fy - 10, fw2, 10, lbl)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    c = canvas.Canvas(OUTPUT, pagesize=A4)
    c.setTitle("Zenowethu Consumer Overcharge Refund Request Form")
    c.setAuthor("Zenowethu Debt Counselling")
    c.setSubject("Consumer Refund Request Form")
    c.setCreator("Zenowethu Platform v1.0")

    # Page 1
    draw_page1(c)
    c.showPage()

    # Page 2
    draw_page2(c)
    c.save()

    print(f"PDF saved to: {OUTPUT}")


if __name__ == "__main__":
    main()
