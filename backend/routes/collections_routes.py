"""
Collections-specific endpoints: repayment tracking, promise-to-pay
reconciliation, and recovery analytics.

Deliberately CSV/Excel-based for now, matching how leads already get
uploaded (backend/routes/lead_routes.py) - no LMS/bank API integration yet.
Reconciliation runs synchronously at upload time (no scheduler/cron
infrastructure exists in this codebase yet), matching each new repayment
row against leads by phone number.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from datetime import datetime
import uuid
import csv
import io
import mongodb
from auth import require_company_access, tenant_filter, stamp_company

collections_router = APIRouter()


def _parse_amount(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = str(value).replace(",", "").replace("₹", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _parse_date(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _normalize_phone(phone) -> str:
    digits = "".join(filter(str.isdigit, str(phone or "")))
    return digits[-10:] if len(digits) >= 10 else digits


async def _reconcile_lead(db, company_id: str, lead: dict) -> None:
    """Check one lead's promise-to-pay against recorded repayments and set
    lead.collections_status accordingly. Safe to re-run any time - it only
    ever reads repayments and writes this one lead's status field."""
    # promise_to_pay lives directly on the lead doc (copied over by
    # crm_service.sync_lead_status_from_call at analysis time) - the full
    # analysis dict itself is only ever written to db.calls, never db.leads.
    ptp = lead.get("promise_to_pay") or {}
    if not ptp.get("promised"):
        return  # nothing to reconcile - no commitment was ever made

    phone_key = _normalize_phone(lead.get("phone"))
    if not phone_key:
        return

    promised_amount = _parse_amount(ptp.get("amount"))
    promised_date = _parse_date(ptp.get("date"))

    matches = [
        r async for r in db.repayments.find({"company_id": company_id, "phone_key": phone_key})
    ]
    total_paid = sum(_parse_amount(r.get("amount_paid")) for r in matches)
    latest_payment_date = max((r.get("date_paid") for r in matches if r.get("date_paid")), default=None)

    if not matches:
        status = "broken" if (promised_date and promised_date < datetime.utcnow()) else "pending"
    elif promised_amount > 0 and total_paid >= promised_amount:
        if promised_date and latest_payment_date and latest_payment_date > promised_date:
            status = "kept_late"
        else:
            status = "kept"
    elif total_paid > 0:
        status = "partial"
    else:
        status = "pending"

    await db.leads.update_one(
        {"lead_id": lead["lead_id"], "company_id": company_id},
        {"$set": {
            "collections_status": status,
            "collections_total_paid": total_paid,
            "collections_reconciled_at": datetime.utcnow(),
        }}
    )


@collections_router.post("/repayments/upload")
async def upload_repayments(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_company_access),
):
    """Upload a CSV/Excel file of repayments actually received (phone,
    amount_paid, date_paid), then reconcile every collections lead with an
    open promise-to-pay against the updated repayment records."""
    import openpyxl

    if not (file.filename.endswith(".csv") or file.filename.endswith(".xlsx")):
        raise HTTPException(status_code=400, detail="Only CSV and Excel (.xlsx) files are supported")

    content = await file.read()
    if file.filename.endswith(".csv"):
        text = content.decode("utf-8", errors="replace")
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)
    else:
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
        sheet = wb.active
        headers = [cell.value for cell in sheet[1]]
        rows = []
        for row in sheet.iter_rows(min_row=2, values_only=True):
            row_dict = {headers[i]: val for i, val in enumerate(row) if i < len(headers) and headers[i]}
            rows.append(row_dict)

    db = mongodb.get_db()
    company_id = current_user["company_id"]

    docs = []
    skipped = 0
    for row in rows:
        phone = row.get("phone") or row.get("Phone") or row.get("Phone Number")
        amount_paid = row.get("amount_paid") or row.get("Amount Paid") or row.get("amount")
        date_paid = row.get("date_paid") or row.get("Date Paid") or row.get("date")
        if not phone or amount_paid is None:
            skipped += 1
            continue

        doc = {
            "repayment_id": str(uuid.uuid4()),
            "company_id": company_id,
            "phone": str(phone),
            "phone_key": _normalize_phone(phone),
            "amount_paid": _parse_amount(amount_paid),
            "date_paid": _parse_date(date_paid),
            "loan_reference": row.get("loan_reference") or row.get("Loan Reference") or "",
            "created_at": datetime.utcnow(),
        }
        stamp_company(current_user, doc)
        docs.append(doc)

    if docs:
        await db.repayments.insert_many(docs)

    # Reconcile every collections lead with an open promise-to-pay against
    # the now-updated repayment records. Bounded to this company's leads.
    reconciled_count = 0
    async for lead in db.leads.find({"company_id": company_id, "industry": "collections"}):
        await _reconcile_lead(db, company_id, lead)
        reconciled_count += 1

    return {
        "status": "success",
        "repayments_inserted": len(docs),
        "rows_skipped": skipped,
        "leads_reconciled": reconciled_count,
    }


@collections_router.get("/recovery-analytics")
async def get_recovery_analytics(current_user: dict = Depends(require_company_access)):
    """Real recovery metrics computed from actual leads + repayments data -
    not the generic call-count cards every other industry's dashboard reuses."""
    db = mongodb.get_db()
    company_id = current_user["company_id"]

    overdue_accounts = 0
    ptp_secured = 0
    ptp_kept = 0
    ptp_kept_late = 0
    ptp_partial = 0
    ptp_broken = 0
    ptp_pending = 0
    total_amount_due = 0.0
    total_amount_recovered = 0.0

    async for lead in db.leads.find({"company_id": company_id, "industry": "collections"}):
        overdue_accounts += 1
        ptp = lead.get("promise_to_pay") or {}
        custom_fields = lead.get("custom_fields") or {}
        total_amount_due += _parse_amount(custom_fields.get("amount_due"))

        if ptp.get("promised"):
            ptp_secured += 1
            status = lead.get("collections_status", "pending")
            if status == "kept":
                ptp_kept += 1
            elif status == "kept_late":
                ptp_kept_late += 1
            elif status == "partial":
                ptp_partial += 1
            elif status == "broken":
                ptp_broken += 1
            else:
                ptp_pending += 1
            total_amount_recovered += float(lead.get("collections_total_paid") or 0.0)

    ptp_kept_rate = round(((ptp_kept + ptp_kept_late) / ptp_secured) * 100, 1) if ptp_secured else 0.0
    recovery_rate = round((total_amount_recovered / total_amount_due) * 100, 1) if total_amount_due else 0.0

    return {
        "status": "success",
        "overdue_accounts": overdue_accounts,
        "ptp_secured": ptp_secured,
        "ptp_kept": ptp_kept,
        "ptp_kept_late": ptp_kept_late,
        "ptp_partial": ptp_partial,
        "ptp_broken": ptp_broken,
        "ptp_pending": ptp_pending,
        "ptp_kept_rate_pct": ptp_kept_rate,
        "total_amount_due": round(total_amount_due, 2),
        "total_amount_recovered": round(total_amount_recovered, 2),
        "recovery_rate_pct": recovery_rate,
    }


@collections_router.get("/repayments")
async def list_repayments(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    repayments = []
    async for r in db.repayments.find(tenant_filter(current_user)).sort("created_at", -1).limit(200):
        r["_id"] = str(r["_id"])
        repayments.append(r)
    return {"status": "success", "repayments": repayments}
