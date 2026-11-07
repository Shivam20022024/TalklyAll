from fastapi import APIRouter, HTTPException, Depends, Body, UploadFile, File, Form
from datetime import datetime
import uuid
import csv
import io
import mongodb
from auth import (
    require_company_access,
    tenant_filter,
    enforce_no_foreign_company,
    stamp_company,
)

lead_router = APIRouter()

@lead_router.post("/leads")
async def create_lead(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    enforce_no_foreign_company(current_user, payload)
    name = payload.get("name")
    phone = payload.get("phone")
    campaign_id = payload.get("campaign_id")

    if not phone:
        raise HTTPException(status_code=400, detail="Phone is required")

    db = mongodb.get_db()
    lead_id = str(uuid.uuid4())

    offering = payload.get("offering") or payload.get("property") or ""
    location = payload.get("location") or payload.get("city") or ""
    custom_fields = payload.get("custom_fields") or {}

    industry = payload.get("industry")
    if not industry and campaign_id:
        camp = await db.campaigns.find_one({"campaign_id": campaign_id, "company_id": current_user["company_id"]})
        if camp:
            industry = camp.get("industry")
    if not industry:
        prompt_doc = await db.prompts.find_one({"company_id": current_user["company_id"]})
        if prompt_doc and prompt_doc.get("industry"):
            industry = prompt_doc.get("industry")
        else:
            comp = await db.companies.find_one({"company_id": current_user["company_id"]})
            if comp:
                industry = comp.get("industry", "general_sales")

    doc = {
        "lead_id": lead_id,
        "campaign_id": campaign_id,
        "name": name or "Unknown",
        "phone": phone,
        "offering": offering,
        "property": offering,
        "location": location,
        "industry": industry,
        "custom_fields": custom_fields,
        "status": "New",
        "aiScore": 0,
        "lastContact": None,
        "created_at": datetime.utcnow()
    }
    stamp_company(current_user, doc)

    await db.leads.insert_one(doc)
    doc["_id"] = None
    return doc

import re
import pandas as pd


def clean_phone_number(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    # Guard against date strings being misidentified as phone numbers
    if re.search(r"\d{1,4}[-/]\d{1,2}[-/]\d{1,4}", s):
        return ""
    if s.endswith(".0"):
        s = s[:-2]
    try:
        if "e+" in s.lower():
            s = str(int(float(s)))
    except Exception:
        pass
    digits = re.sub(r"[^\d+]", "", s)
    raw = re.sub(r"\D", "", digits)
    if not raw or len(raw) < 7:
        return ""
    if len(raw) == 10:
        return f"+91{raw}"
    elif len(raw) == 11 and raw.startswith("0"):
        return f"+91{raw[1:]}"
    elif len(raw) == 12 and raw.startswith("91"):
        return f"+{raw}"
    elif digits.startswith("+"):
        return digits
    return f"+{raw}"


def clean_amount_value(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    cleaned = re.sub(r"[₹$€£,]", "", s).replace("Rs.", "").replace("INR", "").strip()
    try:
        f = float(cleaned)
        if f.is_integer():
            return str(int(f))
        return f"{f:.2f}"
    except Exception:
        return s


def clean_date_value(val) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    if isinstance(val, (datetime, pd.Timestamp)):
        return val.strftime("%d %B %Y")
    s = str(val).strip()
    if s.endswith(" 00:00:00"):
        s = s[:-9].strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        try:
            dt = datetime.strptime(s, "%Y-%m-%d")
            return dt.strftime("%d %B %Y")
        except Exception:
            pass
    # Guard against pure numeric numbers like 8500 or 7000 being misidentified as dates
    if s.isdigit() and len(s) != 8:
        return ""
    return s


def parse_any_file_to_rows(content: bytes, filename: str) -> list:
    """Universal parser that ingests any spreadsheet (.csv, .xlsx, .xls, .tsv, .txt)
    regardless of formatting, encoding, title headers, or unlabelled columns."""
    lower_fn = filename.lower()
    df = None

    if lower_fn.endswith((".xlsx", ".xls", ".xlsm", ".xlsb")):
        try:
            df = pd.read_excel(io.BytesIO(content))
        except Exception:
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
                sheet = wb.active
                data = list(sheet.iter_rows(values_only=True))
                if data and len(data) > 1:
                    df = pd.DataFrame(data[1:], columns=data[0])
            except Exception:
                pass
    else:
        # Delimiter & encoding smart detection for CSV, TSV, TXT
        text = None
        for enc in ("utf-8", "utf-8-sig", "latin-1", "cp1252", "iso-8859-1"):
            try:
                text = content.decode(enc)
                break
            except Exception:
                continue

        if text:
            lines = [l for l in text.splitlines() if l.strip()]
            if lines:
                max_commas = max((l.count(",") for l in lines), default=0)
                max_tabs = max((l.count("\t") for l in lines), default=0)
                max_semis = max((l.count(";") for l in lines), default=0)
                max_pipes = max((l.count("|") for l in lines), default=0)

                sep = ","
                best_max = max_commas
                if max_tabs > best_max:
                    sep = "\t"
                    best_max = max_tabs
                if max_semis > best_max:
                    sep = ";"
                    best_max = max_semis
                if max_pipes > best_max:
                    sep = "|"
                    best_max = max_pipes

                # Skip any leading title/banner metadata lines before the table starts
                first_table_idx = 0
                if best_max > 0:
                    for i, l in enumerate(lines[:15]):
                        if l.count(sep) >= max(1, best_max // 2):
                            first_table_idx = i
                            break
                table_text = "\n".join(lines[first_table_idx:])
                try:
                    df = pd.read_csv(io.StringIO(table_text), sep=sep, on_bad_lines="skip")
                except Exception:
                    try:
                        reader = csv.DictReader(io.StringIO(table_text), delimiter=sep)
                        return list(reader)
                    except Exception:
                        pass

    if df is None or df.empty:
        return []

    def is_real_header(cols) -> bool:
        non_null_cols = [str(c).lower().strip() for c in cols if pd.notna(c) and str(c).strip() and not str(c).startswith("Unnamed:")]
        if len(non_null_cols) < 2:
            return False
        all_text = " ".join(non_null_cols)
        has_phone = any(k in all_text for k in ("phone", "mobile", "contact", "cell", "tel", "phno", "mob", "number", "caller"))
        has_name = any(k in all_text for k in ("name", "client", "borrower", "customer", "user", "lead", "person", "buyer"))
        has_amount = any(k in all_text for k in ("amount", "due", "loan", "balance", "emi", "price", "fee", "cost"))
        return has_phone or (has_name and has_amount)

    if not is_real_header(df.columns) and len(df) > 0:
        for idx in range(min(12, len(df))):
            if is_real_header(df.iloc[idx].values):
                df.columns = [str(x).strip() if pd.notna(x) else f"Col_{i}" for i, x in enumerate(df.iloc[idx].values)]
                df = df.iloc[idx + 1:].reset_index(drop=True)
                break

    # Clean and de-duplicate column names
    clean_cols = []
    seen = {}
    for i, c in enumerate(df.columns):
        c_str = str(c).strip() if pd.notna(c) and str(c).strip() and not str(c).startswith("Unnamed:") else f"Col_{i+1}"
        if c_str in seen:
            seen[c_str] += 1
            clean_cols.append(f"{c_str}_{seen[c_str]}")
        else:
            seen[c_str] = 1
            clean_cols.append(c_str)
    df.columns = clean_cols

    # Drop all-NaN rows
    df = df.dropna(how="all")
    records = []
    for r in df.to_dict(orient="records"):
        clean_r = {k: ("" if (isinstance(v, float) and pd.isna(v)) else v) for k, v in r.items()}
        records.append(clean_r)
    return records


def smart_extract_lead(row: dict, campaign_industry: str, company_id: str, campaign_id: str):
    """Zero-formatting field extractor: auto-identifies phone, name, amount, date
    from any arbitrary header names or directly from cell contents."""
    norm_map = {}
    for k, v in row.items():
        if k is not None and not (isinstance(v, float) and pd.isna(v)):
            val_str = str(v).strip()
            norm_map[re.sub(r"[^a-z0-9]", "", str(k).lower())] = (k, val_str)

    # 1. Phone extraction by header
    phone = ""
    phone_col = ""
    for pk in ("phone", "mobile", "contact", "cell", "tel", "whatsapp", "phno", "mobno", "phonenumber", "mobilenumber", "callerid", "number"):
        for nk, (orig_k, v) in norm_map.items():
            if pk in nk and v:
                p = clean_phone_number(v)
                if p:
                    phone = p
                    phone_col = orig_k
                    break
        if phone:
            break

    # Phone extraction by content inspection fallback
    if not phone:
        for orig_k, v in row.items():
            p = clean_phone_number(v)
            if p:
                phone = p
                phone_col = orig_k
                break

    if not phone:
        return None  # Cannot dial without a valid phone number

    # 2. Name extraction by header
    name = ""
    name_col = ""
    for nk_target in ("name", "customer", "client", "borrower", "buyer", "person", "user", "holder", "lead", "student", "patient", "fullname", "first"):
        for nk, (orig_k, v) in norm_map.items():
            if nk_target in nk and "company" not in nk and "business" not in nk and "product" not in nk and "offering" not in nk and "file" not in nk and v:
                name = v
                name_col = orig_k
                break
        if name:
            break

    # Name extraction by content fallback
    if not name:
        for orig_k, v in row.items():
            if orig_k != phone_col and v:
                s = str(v).strip()
                if re.match(r"^[a-zA-Z\s\.\']{2,35}$", s) and not re.search(r"\d", s):
                    name = s
                    name_col = orig_k
                    break
    if not name:
        name = "Valued Customer"

    # 3. Amount extraction (loan amount, emi, price, due amount, balance, etc.)
    amount = ""
    amount_col = ""
    for ak in ("amount", "loan", "emi", "due", "balance", "overdue", "price", "cost", "fee", "total", "val"):
        for nk, (orig_k, v) in norm_map.items():
            if ak in nk and "date" not in nk and "time" not in nk and "day" not in nk and v:
                a = clean_amount_value(v)
                if a:
                    amount = a
                    amount_col = orig_k
                    break
        if amount:
            break

    if not amount:
        for orig_k, v in row.items():
            if orig_k not in (phone_col, name_col) and v:
                cleaned = clean_amount_value(v)
                if cleaned and re.match(r"^\d+(\.\d+)?$", cleaned) and float(cleaned) > 0 and len(cleaned) < 10:
                    amount = cleaned
                    amount_col = orig_k
                    break

    # 4. Date extraction (due date, schedule, expiry, etc.)
    date_val = ""
    for dk in ("date", "expiry", "schedule", "deadline", "day", "payment"):
        for nk, (orig_k, v) in norm_map.items():
            if dk in nk and not any(x in nk for x in ("amount", "emi", "loan", "balance", "fee", "cost", "price")) and v:
                d = clean_date_value(v)
                if d:
                    date_val = d
                    break
        if date_val:
            break

    if not date_val:
        for orig_k, v in row.items():
            if orig_k not in (phone_col, name_col, amount_col) and v:
                s = str(v).strip()
                if re.search(r"\d{1,2}[-\s/](?:[a-zA-Z]{3,9}|\d{1,2})[-\s/]\d{2,4}|\d{4}[-\s/](?:[a-zA-Z]{3,9}|\d{1,2})[-\s/]\d{1,2}", s):
                    date_val = clean_date_value(s)
                    break

    # 5. Offering / Product / Account Type
    offering = ""
    for ok in ("offering", "product", "service", "course", "program", "property", "loan", "plan", "type", "item", "specialty", "treatment", "account", "model"):
        for nk, (orig_k, v) in norm_map.items():
            if ok in nk and "name" not in nk and "amount" not in nk and "date" not in nk and v:
                offering = v
                break
        if offering:
            break

    # 6. Location / Address / Branch / Delivery
    location = ""
    for lk in ("location", "city", "address", "delivery", "shipping", "area", "branch", "region", "state", "town", "pincode", "zip"):
        for nk, (orig_k, v) in norm_map.items():
            if lk in nk and v:
                location = v
                break
        if location:
            break

    # 7. Order ID / Tracking Number
    order_id = ""
    for oik in ("order_id", "orderid", "order_no", "orderno", "order_number", "order", "tracking_id", "tracking", "invoice_no", "invoice"):
        for nk, (orig_k, v) in norm_map.items():
            if oik in nk and "amount" not in nk and "date" not in nk and v:
                order_id = str(v).strip()
                break
        if order_id:
            break

    # 8. Doctor / Specialist Name
    doctor_name = ""
    for dnk in ("doctor", "dr", "physician", "specialist"):
        for nk, (orig_k, v) in norm_map.items():
            if dnk in nk and v:
                doctor_name = str(v).strip()
                break
        if doctor_name:
            break

    # 9. Appointment Time / Slot
    appointment_time = ""
    for atk in ("appointment_time", "slot", "appointment", "visit_time", "timing", "time"):
        for nk, (orig_k, v) in norm_map.items():
            if atk in nk and not any(x in nk for x in ("amount", "date", "phone")) and v:
                appointment_time = str(v).strip()
                break
        if appointment_time:
            break

    # 10. Collect custom_fields with all variations for dynamic prompt {{...}} variables
    custom_fields = {}
    for k, v in row.items():
        if k is not None and not (isinstance(v, float) and pd.isna(v)) and str(v).strip():
            str_k = str(k).strip()
            val_clean = str(v).strip()
            custom_fields[str_k] = val_clean
            custom_fields[str_k.lower()] = val_clean
            custom_fields[re.sub(r"[^a-z0-9]", "_", str_k.lower())] = val_clean

    # Set universal aliases
    custom_fields["customer_name"] = name
    custom_fields["name"] = name
    custom_fields["phone"] = phone
    custom_fields["phone_number"] = phone
    if amount:
        custom_fields["amount_due"] = amount
        custom_fields["loan_amount"] = amount
        custom_fields["order_amount"] = amount
        custom_fields["amount"] = amount
    if date_val:
        custom_fields["due_date"] = date_val
        custom_fields["date"] = date_val
        custom_fields["payment_date"] = date_val
    if offering:
        custom_fields["offering"] = offering
        custom_fields["product"] = offering
        custom_fields["product_name"] = offering
    if location:
        custom_fields["location"] = location
        custom_fields["city"] = location
        custom_fields["delivery_address"] = location
        custom_fields["address"] = location
    if order_id:
        custom_fields["order_id"] = order_id
        custom_fields["order_number"] = order_id
    if doctor_name:
        custom_fields["doctor_name"] = doctor_name
    if appointment_time:
        custom_fields["appointment_time"] = appointment_time
        custom_fields["preferred_time"] = appointment_time

    doc = {
        "lead_id": str(uuid.uuid4()),
        "company_id": company_id,
        "campaign_id": campaign_id,
        "name": name,
        "phone": phone,
        "offering": offering or (campaign_industry if campaign_industry in ("collections", "ecommerce") else ""),
        "property": offering or "",
        "location": location,
        "delivery_address": location,
        "doctor_name": doctor_name,
        "appointment_time": appointment_time,
        "industry": campaign_industry or "ecommerce",
        "custom_fields": custom_fields,
        "status": "New",
        "aiScore": 0,
        "lastContact": None,
        "created_at": datetime.utcnow()
    }
    if amount:
        doc["amount_due"] = amount
        doc["order_amount"] = amount
    if date_val:
        doc["due_date"] = date_val
    if order_id:
        doc["order_id"] = order_id

    return doc


@lead_router.post("/leads/upload")
async def upload_leads_csv(
    file: UploadFile = File(...),
    campaign_id: str = Form(None),
    current_user: dict = Depends(require_company_access)
):
    content = await file.read()
    rows = parse_any_file_to_rows(content, file.filename or "upload.csv")

    if not rows:
        raise HTTPException(status_code=400, detail="Could not find any readable rows in the uploaded file.")

    db = mongodb.get_db()
    company_id = current_user["company_id"]

    # If a campaign_id is supplied, verify it belongs to this company.
    campaign_industry = None
    if campaign_id:
        owned = await db.campaigns.find_one({"campaign_id": campaign_id, "company_id": company_id})
        if not owned:
            raise HTTPException(status_code=404, detail="Campaign not found")
        campaign_industry = owned.get("industry")

    if not campaign_industry:
        prompt_doc = await db.prompts.find_one({"company_id": company_id})
        if prompt_doc and prompt_doc.get("industry"):
            campaign_industry = prompt_doc.get("industry")
        else:
            comp = await db.companies.find_one({"company_id": company_id})
            if comp:
                campaign_industry = comp.get("industry", "general_sales")

    docs = []
    for row in rows:
        lead_doc = smart_extract_lead(row, campaign_industry, company_id, campaign_id)
        if lead_doc and lead_doc.get("phone"):
            docs.append(lead_doc)

    if docs:
        await db.leads.insert_many(docs)
        if campaign_id:
            total_leads = await db.leads.count_documents({"campaign_id": campaign_id, "company_id": company_id})
            await db.campaigns.update_one(
                {"campaign_id": campaign_id, "company_id": company_id},
                {"$set": {"leads_count": total_leads, "leads": total_leads}}
            )

    return {"status": "success", "inserted_count": len(docs), "total_rows_parsed": len(rows)}

@lead_router.get("/leads")
async def list_leads(campaign_id: str = None, range: str = None, industry: str = None, current_user: dict = Depends(require_company_access)):
    from datetime import timedelta
    db = mongodb.get_db()
    query = tenant_filter(current_user)

    if campaign_id:
        query["campaign_id"] = campaign_id

    if industry and industry.lower() != "all":
        query["industry"] = industry.lower()

    if range and range != "All Time":
        today = datetime.utcnow()
        if range == "Today":
            start_date = today.replace(hour=0, minute=0, second=0, microsecond=0)
        elif range == "7 Days":
            start_date = (today - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif range == "30 Days":
            start_date = (today - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
        elif range == "90 Days":
            start_date = (today - timedelta(days=90)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            start_date = None

        if start_date:
            query["$or"] = [
                {"created_at": {"$gte": start_date}},
                {"lastContact": {"$gte": start_date.isoformat()}}
            ]

    # Sort by most recent activity (lastContact), not just when the lead
    # record was first created - confirmed live: a lead that's called again
    # weeks after it was first added (e.g. a reused Quick Call match) kept
    # sorting by its original creation date, burying it far below leads
    # created more recently but never actually contacted since. Leads with
    # no lastContact yet (nulls) sort last automatically, falling back to
    # created_at order among themselves.
    leads = await db.leads.find(query).sort([("lastContact", -1), ("created_at", -1)]).to_list(length=200)

    for l in leads:
        l["_id"] = None

    return leads

@lead_router.delete("/leads")
async def delete_all_leads(current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    result = await db.leads.delete_many(tenant_filter(current_user))
    return {"status": "success", "deleted_count": result.deleted_count}

@lead_router.post("/leads/delete-bulk")
async def delete_bulk_leads(payload: dict = Body(...), current_user: dict = Depends(require_company_access)):
    db = mongodb.get_db()
    lead_ids = payload.get("lead_ids", [])
    if not lead_ids:
        return {"status": "success", "deleted_count": 0}

    result = await db.leads.delete_many(tenant_filter(current_user, {"lead_id": {"$in": lead_ids}}))
    return {"status": "success", "deleted_count": result.deleted_count}
