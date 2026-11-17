import os
import re
import tempfile
from datetime import datetime
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

def _auto_adjust_columns(ws, max_cap=50):
    for col in ws.columns:
        max_length = 0
        column = get_column_letter(col[0].column)
        for cell in col:
            try:
                if cell.value is not None:
                    max_length = max(max_length, len(str(cell.value)))
            except Exception:
                pass
        adjusted_width = max(max_length + 3, 12)
        ws.column_dimensions[column].width = min(adjusted_width, max_cap)

def _apply_header_style(ws, header_row=1, bg_color="1F4E78"):
    header_fill = PatternFill(start_color=bg_color, end_color=bg_color, fill_type="solid")
    header_font = Font(bold=True, color="FFFFFF", size=10)
    align_center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),
        bottom=Side(style='thin', color='D9D9D9')
    )
    
    ws.row_dimensions[header_row].height = 26
    for cell in ws[header_row]:
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center
        cell.border = thin_border

def _safe_row(row):
    return [str(item) if isinstance(item, (dict, list)) else item for item in row]

def _extract_customer_lead_details(c, leads_by_id, leads_by_phone, leads_by_name, default_company="Talkly AI"):
    lead_id = str(c.get("lead_id") or "").strip()
    raw_phone = str(c.get("customer_id") or c.get("customer_phone") or c.get("to") or c.get("from") or c.get("phone") or "").strip()
    clean_phone_digits = re.sub(r"\D", "", raw_phone)
    phone_10 = clean_phone_digits[-10:] if len(clean_phone_digits) >= 10 else clean_phone_digits
    raw_name = str(c.get("customer_name") or c.get("name") or "").strip()

    # Match corresponding lead record from leads collection
    lead = leads_by_id.get(lead_id) or leads_by_phone.get(phone_10) or leads_by_name.get(raw_name.lower()) or {}

    # Direction
    direction_raw = str(c.get("direction") or lead.get("direction") or "outbound").strip().lower()
    direction = "Inbound" if direction_raw == "inbound" else "Outbound"

    # Customer / Caller Name
    name = raw_name or str(lead.get("name") or "").strip()
    if not name or name.lower() in ("unknown", "none", "nan", "val", "phone lead"):
        name = "Inbound Caller" if direction == "Inbound" else "Valued Prospect"

    # Phone formatting (ensures +91 or original format is clean)
    phone = raw_phone or str(lead.get("phone") or "").strip()
    if len(phone_10) == 10 and not phone.startswith("+"):
        phone = f"+91 {phone_10}"

    # Email Address
    analysis = c.get("analysis") or {}
    reqs = analysis.get("requirements") or analysis.get("property_requirements") or {}
    email = c.get("email") or lead.get("email") or reqs.get("email") or "—"

    # Location / City
    location = c.get("location") or c.get("city") or lead.get("location") or lead.get("city") or reqs.get("location") or reqs.get("city") or "—"

    # Company / Organization
    company = c.get("company_name") or lead.get("company") or default_company or "—"

    # Budget / Estimated Deal Size
    budget = c.get("budget") or lead.get("budget") or reqs.get("budget") or "—"

    # Campaign / Offering / Department
    offering = (
        c.get("offering")
        or c.get("campaign_name")
        or lead.get("offering")
        or lead.get("property")
        or reqs.get("offering")
        or reqs.get("propertyType")
        or str(c.get("industry") or "").replace("_", " ").title()
        or ("Customer Helpline" if direction == "Inbound" else "General Sales")
    )

    # Duration
    dur = c.get("duration_seconds") or c.get("duration") or 0
    try:
        dur_sec = float(dur)
    except (ValueError, TypeError):
        dur_sec = 0.0
    mins, secs = divmod(int(dur_sec), 60)
    duration_fmt = f"{mins:02d}:{secs:02d}" if dur_sec > 0 else "00:00"

    # AI Score & Lead Temperature
    score = analysis.get("lead_score")
    if score is None:
        score = c.get("aiScore") if c.get("aiScore") is not None else lead.get("aiScore")

    lead_temp = analysis.get("lead_temperature") or lead.get("lead_temperature") or ""
    if not lead_temp and isinstance(score, (int, float)):
        lead_temp = "Hot" if score >= 75 else ("Warm" if score >= 40 else "Cold")
    if not lead_temp:
        lead_temp = "Warm" if dur_sec >= 45 else ("Cold" if dur_sec == 0 else "Warm")

    # Call Outcome & Disposition
    status_clean = str(c.get("status") or lead.get("status") or "").lower()
    outcome = analysis.get("outcome") or c.get("outcome_summary") or lead.get("outcome_summary") or c.get("outcome")
    if not outcome:
        outcome = "No Answer" if status_clean in ("no answer", "no-answer") else ("Call Answered" if dur_sec > 0 else "Unrecorded")

    # Customer Intent & Specific Requirements
    raw_intents = analysis.get("intents") or ([analysis.get("intent_label")] if analysis.get("intent_label") else [])
    intents_str = ", ".join(str(x) for x in raw_intents if x) or ("Product Inquiry" if direction == "Inbound" else "Sales Qualification")

    req_parts = [f"{k}: {v}" for k, v in reqs.items() if v and k not in ("email", "location", "city", "budget", "offering")]
    req_str = " | ".join(req_parts) or "—"

    # PTP & Commitments
    ptp = analysis.get("promise_to_pay") or c.get("promise_to_pay") or lead.get("promise_to_pay") or {}
    commit = ""
    if isinstance(ptp, dict) and ptp.get("promised"):
        amt = ptp.get("amount") or c.get("ptp_amount") or ""
        date = ptp.get("date") or c.get("ptp_date") or ""
        commit = f"Rs. {amt} by {date}".strip()
    if not commit and "appointment" in outcome.lower():
        commit = "Appointment / Demo Confirmed"
    if not commit and "site visit" in outcome.lower():
        commit = "Site Visit Agreed"

    # Objections Handled
    raw_objs = analysis.get("key_objections") or []
    obj_parts = []
    for obj in raw_objs:
        if isinstance(obj, dict):
            content = obj.get("content") or obj.get("type") or ""
            if content:
                obj_parts.append(str(content))
        elif isinstance(obj, str):
            obj_parts.append(obj)
    objections_str = ", ".join(obj_parts) or "None raised"

    # Action Items
    raw_actions = analysis.get("action_items") or []
    actions_str = ", ".join(str(x) for x in raw_actions if x) or "No pending action"

    # Conversion probability
    conv_prob = f"{analysis.get('conversion_probability')}%" if analysis.get("conversion_probability") is not None else ("85%" if lead_temp == "Hot" else ("50%" if lead_temp == "Warm" else "15%"))

    # Sentiment, Language, Summary, Transcript
    sentiment = str(c.get("sentiment") or analysis.get("sentiment") or "Neutral").title()
    language = c.get("language") or lead.get("language") or "English"
    summary = c.get("summary") or analysis.get("summary") or "Conversation completed and transcribed by Talkly AI."
    transcript = c.get("transcript") or "—"

    dt = c.get("created_at")
    dt_str = dt.strftime("%Y-%m-%d %H:%M:%S") if isinstance(dt, datetime) else str(dt or "")

    return {
        "call_id": c.get("call_id", ""),
        "lead_id": lead_id,
        "date_time": dt_str,
        "direction": direction,
        "name": name,
        "phone": phone,
        "email": email,
        "location": location,
        "company": company,
        "offering": offering,
        "budget": budget,
        "status": (c.get("status") or lead.get("status") or "Completed").title(),
        "duration_fmt": duration_fmt,
        "duration_sec": int(dur_sec),
        "score": score if (score is not None and score != "") else "—",
        "lead_temp": lead_temp,
        "outcome": outcome,
        "intents": intents_str,
        "requirements": req_str,
        "commitments": commit or "—",
        "objections": objections_str,
        "action_items": actions_str,
        "conv_prob": conv_prob,
        "sentiment": sentiment,
        "language": language,
        "summary": summary,
        "transcript": transcript
    }


def _compute_kpis(records):
    total = len(records)
    connected = 0
    total_sec = 0
    hot = 0
    warm = 0
    cold = 0
    total_score = 0
    scored = 0
    commitments = 0
    outcomes = {}

    for r in records:
        dur_sec = r["duration_sec"]
        status_clean = r["status"].lower()
        if dur_sec > 0 or status_clean in ("completed", "analyzed"):
            connected += 1
            total_sec += dur_sec

        temp = r["lead_temp"]
        if temp == "Hot":
            hot += 1
        elif temp == "Warm":
            warm += 1
        elif temp == "Cold":
            cold += 1

        sc = r["score"]
        if isinstance(sc, (int, float)) and sc > 0:
            total_score += sc
            scored += 1

        outc = r["outcome"]
        outcomes[outc] = outcomes.get(outc, 0) + 1

        if r["commitments"] != "—":
            commitments += 1

    connect_rate = f"{(connected / total * 100):.1f}%" if total > 0 else "0.0%"
    avg_score = round(total_score / scored) if scored > 0 else 0
    avg_dur = round(total_sec / connected) if connected > 0 else 0
    avg_mins, avg_secs = divmod(avg_dur, 60)
    avg_dur_fmt = f"{avg_mins}m {avg_secs}s" if avg_mins > 0 else f"{avg_secs}s"

    return {
        "total": total,
        "connected": connected,
        "connect_rate": connect_rate,
        "avg_dur_fmt": avg_dur_fmt,
        "hot": hot,
        "warm": warm,
        "cold": cold,
        "avg_score": avg_score,
        "commitments": commitments,
        "outcomes": outcomes
    }


def _populate_data_sheet(ws, title, subtitle, brand_color, headers, rows_data):
    ws.views.sheetView[0].showGridLines = True

    # Title Banner
    col_end = get_column_letter(len(headers))
    ws.merge_cells(f"A1:{col_end}1")
    title_cell = ws["A1"]
    title_cell.value = title
    title_cell.font = Font(bold=True, color="FFFFFF", size=13)
    title_cell.fill = PatternFill(start_color=brand_color, end_color=brand_color, fill_type="solid")
    title_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[1].height = 34

    # Subtitle Info Bar
    ws.merge_cells(f"A2:{col_end}2")
    sub_cell = ws["A2"]
    sub_cell.value = subtitle
    sub_cell.font = Font(italic=True, color="64748B", size=9)
    sub_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws.row_dimensions[2].height = 20

    # Spacing row
    ws.row_dimensions[3].height = 8

    # Header Row
    header_row_idx = 4
    ws.row_dimensions[header_row_idx].height = 28
    for col_idx, h_text in enumerate(headers, start=1):
        cell = ws.cell(row=header_row_idx, column=col_idx, value=h_text)
        cell.fill = PatternFill(start_color=brand_color, end_color=brand_color, fill_type="solid")
        cell.font = Font(bold=True, color="FFFFFF", size=9.5)
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    temp_fills = {
        "Hot": PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid"),
        "Warm": PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid"),
        "Cold": PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
    }
    temp_fonts = {
        "Hot": Font(bold=True, color="991B1B", size=9.5),
        "Warm": Font(bold=True, color="92400E", size=9.5),
        "Cold": Font(bold=True, color="075985", size=9.5)
    }
    dir_fills = {
        "Inbound": PatternFill(start_color="CCFBF1", end_color="CCFBF1", fill_type="solid"),
        "Outbound": PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
    }
    dir_fonts = {
        "Inbound": Font(bold=True, color="115E59", size=9.5),
        "Outbound": Font(bold=True, color="1E40AF", size=9.5)
    }

    start_data_row = 5
    for r_offset, row in enumerate(rows_data):
        curr_row = start_data_row + r_offset
        ws.row_dimensions[curr_row].height = 23
        is_even = r_offset % 2 == 0
        zebra_fill = PatternFill(start_color="F8FAFC" if is_even else "FFFFFF", fill_type="solid")

        for c_idx, val in enumerate(row, start=1):
            h_name = headers[c_idx - 1]
            cell = ws.cell(row=curr_row, column=c_idx, value=val)
            cell.font = Font(size=9.5)
            cell.border = thin_border
            cell.fill = zebra_fill
            cell.alignment = Alignment(horizontal="left", vertical="top")

            # Center align numbers, scores, dates, status, phone
            if any(k in h_name for k in ("ID", "Date", "Phone", "Duration", "Score", "Prob", "Status", "Direction")):
                cell.alignment = Alignment(horizontal="center", vertical="top")

            # Phone as explicit string format
            if "Phone" in h_name:
                cell.number_format = '@'

            # Temperature badge
            if h_name == "Lead Temp" and str(val) in temp_fills:
                cell.fill = temp_fills[str(val)]
                cell.font = temp_fonts[str(val)]
                cell.alignment = Alignment(horizontal="center", vertical="top")

            # Direction badge
            if h_name == "Call Direction" and str(val) in dir_fills:
                cell.fill = dir_fills[str(val)]
                cell.font = dir_fonts[str(val)]
                cell.alignment = Alignment(horizontal="center", vertical="top")

    # Freeze header pane & enable Excel filters
    ws.freeze_panes = "A5"
    if rows_data:
        ws.auto_filter.ref = f"A4:{col_end}{start_data_row + len(rows_data) - 1}"
    _auto_adjust_columns(ws, max_cap=45)

    # Special widths for long textual content
    for h_idx, h in enumerate(headers, start=1):
        col_letter = get_column_letter(h_idx)
        if h == "Full Transcript":
            ws.column_dimensions[col_letter].width = 65
        elif h == "Executive Call Summary":
            ws.column_dimensions[col_letter].width = 45
        elif h in ("Next Action Items", "Specific Inquiry Details & Requirements", "Key Objections Handled"):
            ws.column_dimensions[col_letter].width = 35
        elif "Phone" in h:
            ws.column_dimensions[col_letter].width = 18
        elif "Name" in h:
            ws.column_dimensions[col_letter].width = 22


def generate_calls_export(calls_data, direction_label="All", leads=None, company_name=None):
    """
    Executive Management Grade Multi-Sheet Excel Workbook for Inbound & Outbound Calling Intelligence.
    Designed specifically for CEO, VP of Sales, and Company Leadership to review leads and performance:
    - Sheet 1: Executive KPI Summary & Side-by-Side Inbound vs Outbound Comparison
    - Sheet 2: Outbound Leads & Pipeline (Full Customer Profile, Intent, Budget, AI Score, Transcript)
    - Sheet 3: Inbound Leads & Customer Inquiries (Full Caller Profile, Inquiry Topic, Resolution, Transcript)
    - Sheet 4: All Leads Master Directory (Unified Customer Follow-Up Directory for Sales Teams)
    """
    wb = Workbook()

    leads = leads or []
    leads_by_id = {}
    leads_by_phone = {}
    leads_by_name = {}
    for l in leads:
        if not isinstance(l, dict):
            continue
        lid = str(l.get("lead_id") or "").strip()
        if lid:
            leads_by_id[lid] = l
        p_raw = re.sub(r"\D", "", str(l.get("phone") or ""))
        if len(p_raw) >= 10:
            leads_by_phone[p_raw[-10:]] = l
        nm = str(l.get("name") or "").strip().lower()
        if nm and nm not in ("unknown", "none", "nan"):
            leads_by_name[nm] = l

    comp_name = company_name or "Talkly AI"
    enriched_calls = [
        _extract_customer_lead_details(c, leads_by_id, leads_by_phone, leads_by_name, comp_name)
        for c in (calls_data or [])
        if isinstance(c, dict)
    ]

    outbound_records = [r for r in enriched_calls if r["direction"].lower() != "inbound"]
    inbound_records = [r for r in enriched_calls if r["direction"].lower() == "inbound"]

    mode = str(direction_label).strip().lower()
    is_inbound_only = mode == "inbound"
    is_outbound_only = mode == "outbound"
    is_omnichannel = not is_inbound_only and not is_outbound_only

    brand_primary = "0F172A" if is_omnichannel else ("134E4A" if is_inbound_only else "1E3A8A")
    outbound_brand = "1E3A8A" # Deep Navy
    inbound_brand = "134E4A"  # Deep Teal
    master_brand = "0F172A"   # Slate Charcoal

    # ---------------------------------------------------------
    # SHEET 1: EXECUTIVE KPI SUMMARY
    # ---------------------------------------------------------
    ws_kpi = wb.active
    ws_kpi.title = "Executive Summary"
    ws_kpi.views.sheetView[0].showGridLines = True

    kpi_all = _compute_kpis(enriched_calls)
    kpi_out = _compute_kpis(outbound_records)
    kpi_in = _compute_kpis(inbound_records)

    # Banner
    ws_kpi.merge_cells("A1:G1")
    title_cell = ws_kpi["A1"]
    title_cell.value = f"TALKLY AI -- EXECUTIVE CALLING & LEAD INTELLIGENCE REPORT"
    title_cell.font = Font(bold=True, color="FFFFFF", size=14)
    title_cell.fill = PatternFill(start_color=brand_primary, fill_type="solid")
    title_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws_kpi.row_dimensions[1].height = 36

    ws_kpi.merge_cells("A2:G2")
    sub_cell = ws_kpi["A2"]
    sub_cell.value = (
        f"Company: {comp_name} | Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} | "
        f"Pipeline Scope: {'Complete Omnichannel (Inbound & Outbound)' if is_omnichannel else f'{direction_label.title()} Calls'} | "
        f"Total Leads Handled: {len(enriched_calls)}"
    )
    sub_cell.font = Font(italic=True, color="64748B", size=9)
    sub_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws_kpi.row_dimensions[2].height = 20

    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )

    if is_omnichannel:
        ws_kpi.cell(row=4, column=1, value="EXECUTIVE PIPELINE COMPARISON: INBOUND VS OUTBOUND").font = Font(bold=True, color=brand_primary, size=11)
        headers_kpi = [
            "Executive Performance Metric",
            "Total Pipeline (Combined)",
            "Outbound Campaigns",
            "Inbound Helplines",
            "Executive Context & Benchmark"
        ]
        ws_kpi.row_dimensions[5].height = 26
        for c_idx, h_text in enumerate(headers_kpi, start=1):
            cell = ws_kpi.cell(row=5, column=c_idx, value=h_text)
            cell.fill = PatternFill(start_color=brand_primary, fill_type="solid")
            cell.font = Font(bold=True, color="FFFFFF", size=9.5)
            cell.alignment = Alignment(horizontal="center", vertical="center")

        kpi_table_rows = [
            ["Total Calls & Inquiries Logged", kpi_all["total"], kpi_out["total"], kpi_in["total"], "Total dial attempts and incoming calls recorded"],
            ["Connected / Answered Calls", kpi_all["connected"], kpi_out["connected"], kpi_in["connected"], f"{kpi_all['connect_rate']} overall connection rate"],
            ["Connection / Answer Rate", kpi_all["connect_rate"], kpi_out["connect_rate"], kpi_in["connect_rate"], "Inbound vs Outbound pickup efficiency"],
            ["Average Call Duration", kpi_all["avg_dur_fmt"], kpi_out["avg_dur_fmt"], kpi_in["avg_dur_fmt"], "Mean conversation handling time across calls"],
            ["Hot Leads (High Intent 🔥)", kpi_all["hot"], kpi_out["hot"], kpi_in["hot"], "Immediate priority for sales closing / specialist follow-up"],
            ["Warm Leads (Nurture ⚡)", kpi_all["warm"], kpi_out["warm"], kpi_in["warm"], "Scheduled demo, consultation, or site visit recommended"],
            ["Cold Leads (Low Intent ❄️)", kpi_all["cold"], kpi_out["cold"], kpi_in["cold"], "Declined, price-sensitive, or quick drop-off"],
            ["Average AI Lead Qualification Score", f"{kpi_all['avg_score']} / 100", f"{kpi_out['avg_score']} / 100", f"{kpi_in['avg_score']} / 100", "AI qualification score across conversations"],
            ["Appointments & Commitments Secured", kpi_all["commitments"], kpi_out["commitments"], kpi_in["commitments"], "Demos, visits, bookings, or payment promises"]
        ]

        for r_offset, r_vals in enumerate(kpi_table_rows, start=6):
            ws_kpi.row_dimensions[r_offset].height = 21
            zebra_fill = PatternFill(start_color="F8FAFC" if r_offset % 2 == 0 else "FFFFFF", fill_type="solid")
            for c_idx, val in enumerate(r_vals, start=1):
                cell = ws_kpi.cell(row=r_offset, column=c_idx, value=val)
                cell.font = Font(size=9.5)
                cell.fill = zebra_fill
                cell.border = thin_border
                if c_idx in (2, 3, 4):
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    cell.font = Font(bold=(c_idx == 2), size=9.5, color=brand_primary if c_idx == 2 else "0F172A")
                elif c_idx == 1:
                    cell.font = Font(bold=True, size=9.5)

        next_section_row = len(kpi_table_rows) + 8
    else:
        # Single direction summary
        target_kpi = kpi_in if is_inbound_only else kpi_out
        ws_kpi.cell(row=4, column=1, value=f"{direction_label.upper()} PIPELINE KEY PERFORMANCE INDICATORS").font = Font(bold=True, color=brand_primary, size=11)
        headers_kpi = ["Metric", "Value", "Executive Benchmark / Context"]
        ws_kpi.row_dimensions[5].height = 26
        for c_idx, h_text in enumerate(headers_kpi, start=1):
            cell = ws_kpi.cell(row=5, column=c_idx, value=h_text)
            cell.fill = PatternFill(start_color=brand_primary, fill_type="solid")
            cell.font = Font(bold=True, color="FFFFFF", size=9.5)
            cell.alignment = Alignment(horizontal="center", vertical="center")

        kpi_table_rows = [
            ["Total Calls Logged", target_kpi["total"], f"Total {direction_label.lower()} calls recorded"],
            ["Connected / Answered Calls", target_kpi["connected"], f"{target_kpi['connect_rate']} connection rate"],
            ["Average Call Duration", target_kpi["avg_dur_fmt"], "Across all answered conversations"],
            ["Hot Leads (High Intent 🔥)", target_kpi["hot"], "Immediate priority for human sales follow-up"],
            ["Warm Leads (Medium Intent ⚡)", target_kpi["warm"], "Nurturing or scheduled follow-up recommended"],
            ["Cold Leads (Low / No Intent ❄️)", target_kpi["cold"], "Declined, busy, or non-responsive"],
            ["Average AI Lead Score", f"{target_kpi['avg_score']} / 100", "Across evaluated prospect conversations"],
            ["Appointments & Commitments", target_kpi["commitments"], "Confirmed bookings or promises to pay"]
        ]

        for r_offset, r_vals in enumerate(kpi_table_rows, start=6):
            ws_kpi.row_dimensions[r_offset].height = 21
            zebra_fill = PatternFill(start_color="F8FAFC" if r_offset % 2 == 0 else "FFFFFF", fill_type="solid")
            for c_idx, val in enumerate(r_vals, start=1):
                cell = ws_kpi.cell(row=r_offset, column=c_idx, value=val)
                cell.font = Font(size=9.5)
                cell.fill = zebra_fill
                cell.border = thin_border
                if c_idx == 2:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                    cell.font = Font(bold=True, size=10, color=brand_primary)

        next_section_row = len(kpi_table_rows) + 8

    # Top Outcomes Breakdown Table
    ws_kpi.cell(row=next_section_row, column=1, value="CONCRETE CALL OUTCOMES & CONVERSATIONAL DISPOSITIONS").font = Font(bold=True, color=brand_primary, size=11)
    outcome_headers = ["Call Outcome", "Count", "Percentage of Pipeline", "Action Recommended"]
    ws_kpi.row_dimensions[next_section_row + 1].height = 26
    for c_idx, h_text in enumerate(outcome_headers, start=1):
        cell = ws_kpi.cell(row=next_section_row + 1, column=c_idx, value=h_text)
        cell.fill = PatternFill(start_color=brand_primary, fill_type="solid")
        cell.font = Font(bold=True, color="FFFFFF", size=9.5)
        cell.alignment = Alignment(horizontal="center", vertical="center")

    curr_r = next_section_row + 2
    total_calls_cnt = len(enriched_calls)
    sorted_outcomes = sorted(kpi_all["outcomes"].items(), key=lambda x: x[1], reverse=True)[:10] if is_omnichannel else sorted((kpi_in if is_inbound_only else kpi_out)["outcomes"].items(), key=lambda x: x[1], reverse=True)[:10]

    for outcome_label, count in sorted_outcomes:
        pct_str = f"{(count / total_calls_cnt * 100):.1f}%" if total_calls_cnt > 0 else "0.0%"
        action_rec = (
            "Immediate specialist callback" if "appointment" in outcome_label.lower() or "demo" in outcome_label.lower() or "visit" in outcome_label.lower()
            else ("Schedule follow-up dial" if "callback" in outcome_label.lower()
            else ("Nurture on WhatsApp" if "info" in outcome_label.lower() or "inquiry" in outcome_label.lower()
            else "Retarget later"))
        )
        ws_kpi.row_dimensions[curr_r].height = 20
        zebra_fill = PatternFill(start_color="F8FAFC" if curr_r % 2 == 0 else "FFFFFF", fill_type="solid")
        for c_idx, val in enumerate([outcome_label, count, pct_str, action_rec], start=1):
            cell = ws_kpi.cell(row=curr_r, column=c_idx, value=val)
            cell.font = Font(size=9.5)
            cell.fill = zebra_fill
            cell.border = thin_border
            if c_idx in (2, 3):
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if c_idx == 2:
                    cell.font = Font(bold=True, size=9.5)
        curr_r += 1

    _auto_adjust_columns(ws_kpi)
    ws_kpi.column_dimensions["A"].width = 38
    ws_kpi.column_dimensions["B"].width = 24
    ws_kpi.column_dimensions["C"].width = 22
    ws_kpi.column_dimensions["D"].width = 22
    ws_kpi.column_dimensions["E"].width = 45

    # ---------------------------------------------------------
    # DATA SHEETS CREATION
    # ---------------------------------------------------------

    headers_outbound = [
        "Lead / Call ID", "Date & Time", "Customer Name", "Phone Number", "Email Address",
        "City / Location", "Company / Org", "Campaign / Offering", "Budget / Deal Value",
        "Call Status", "Duration (mm:ss)", "Duration (sec)", "AI Lead Score", "Lead Temp",
        "Call Outcome", "Customer Intent", "Conversion Prob %", "PTP / Commitments",
        "Key Objections Handled", "Next Action Items", "Sentiment", "Language", "Executive Call Summary", "Full Transcript"
    ]

    headers_inbound = [
        "Inbound Call ID", "Date & Time", "Caller / Customer Name", "Phone Number", "Email Address",
        "City / Branch Location", "Company / Org", "Department / Service Requested", "Inquiry Topic / Offering",
        "Budget / Requirements", "Call Status", "Duration (mm:ss)", "Duration (sec)", "AI Lead Score", "Lead Temp",
        "Inquiry Resolution / Outcome", "Customer Intent", "Specific Inquiry Details & Requirements", "Next Action Items / Callback",
        "Sentiment", "Language", "Executive Call Summary", "Full Transcript"
    ]

    headers_master = [
        "Customer / Lead Name", "Phone Number", "Email Address", "Call Direction",
        "City / Location", "Company / Organization", "Offering / Inquired Product", "Budget / Deal Value",
        "Call Status", "Duration (mm:ss)", "AI Lead Score", "Lead Temp", "Call Outcome",
        "Commitments / Follow-up", "Next Action Items", "Customer Sentiment", "Last Contact Date", "Call ID"
    ]

    def _make_outbound_row(r):
        return [
            r["call_id"], r["date_time"], r["name"], r["phone"], r["email"],
            r["location"], r["company"], r["offering"], r["budget"],
            r["status"], r["duration_fmt"], r["duration_sec"], r["score"], r["lead_temp"],
            r["outcome"], r["intents"], r["conv_prob"], r["commitments"],
            r["objections"], r["action_items"], r["sentiment"], r["language"], r["summary"], r["transcript"]
        ]

    def _make_inbound_row(r):
        return [
            r["call_id"], r["date_time"], r["name"], r["phone"], r["email"],
            r["location"], r["company"], r["offering"], r["offering"],
            r["budget"], r["status"], r["duration_fmt"], r["duration_sec"], r["score"], r["lead_temp"],
            r["outcome"], r["intents"], r["requirements"], r["action_items"],
            r["sentiment"], r["language"], r["summary"], r["transcript"]
        ]

    def _make_master_row(r):
        return [
            r["name"], r["phone"], r["email"], r["direction"],
            r["location"], r["company"], r["offering"], r["budget"],
            r["status"], r["duration_fmt"], r["score"], r["lead_temp"], r["outcome"],
            r["commitments"], r["action_items"], r["sentiment"], r["date_time"], r["call_id"]
        ]

    if is_omnichannel:
        # Sheet 2: Outbound Leads
        ws_out = wb.create_sheet("Outbound Leads & Calls")
        _populate_data_sheet(
            ws_out,
            title=f"TALKLY AI -- OUTBOUND LEADS & PROSPECT PIPELINE ({comp_name})",
            subtitle=f"Total Outbound Records: {len(outbound_records)} | Direction: Outbound Campaigns | Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            brand_color=outbound_brand,
            headers=headers_outbound,
            rows_data=[_make_outbound_row(r) for r in outbound_records]
        )

        # Sheet 3: Inbound Leads
        ws_in = wb.create_sheet("Inbound Leads & Inquiries")
        _populate_data_sheet(
            ws_in,
            title=f"TALKLY AI -- INBOUND LEADS & CUSTOMER INQUIRIES ({comp_name})",
            subtitle=f"Total Inbound Records: {len(inbound_records)} | Direction: Inbound Helplines | Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            brand_color=inbound_brand,
            headers=headers_inbound,
            rows_data=[_make_inbound_row(r) for r in inbound_records]
        )

        # Sheet 4: All Leads Master Directory
        ws_master = wb.create_sheet("All Leads Master Directory")
        _populate_data_sheet(
            ws_master,
            title=f"TALKLY AI -- ALL LEADS MASTER DIRECTORY ({comp_name})",
            subtitle=f"Unified Directory of All Leads Across Inbound & Outbound Channels | Total Contacts: {len(enriched_calls)}",
            brand_color=master_brand,
            headers=headers_master,
            rows_data=[_make_master_row(r) for r in enriched_calls]
        )
    elif is_inbound_only:
        ws_in = wb.create_sheet("Inbound Leads & Inquiries")
        _populate_data_sheet(
            ws_in,
            title=f"TALKLY AI -- INBOUND LEADS & CUSTOMER INQUIRIES ({comp_name})",
            subtitle=f"Total Inbound Records: {len(inbound_records)} | Direction: Inbound Helplines | Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            brand_color=inbound_brand,
            headers=headers_inbound,
            rows_data=[_make_inbound_row(r) for r in inbound_records]
        )
    else:
        # Outbound only
        ws_out = wb.create_sheet("Outbound Leads & Calls")
        _populate_data_sheet(
            ws_out,
            title=f"TALKLY AI -- OUTBOUND LEADS & PROSPECT PIPELINE ({comp_name})",
            subtitle=f"Total Outbound Records: {len(outbound_records)} | Direction: Outbound Campaigns | Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            brand_color=outbound_brand,
            headers=headers_outbound,
            rows_data=[_make_outbound_row(r) for r in outbound_records]
        )

    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb.save(temp_file.name)
    temp_file.close()

    return temp_file.name


def generate_multi_sheet_report(calls_data):
    wb = Workbook()
    
    # Remove default sheet
    default_sheet = wb.active
    
    # Colors
    color_hot = "FF9999" # Light Red
    color_warm = "FFCC99" # Light Orange
    color_cold = "99CCFF" # Light Blue
    
    # ---------------------------------------------------------
    # SHEET 1: EXECUTIVE DASHBOARD
    # ---------------------------------------------------------
    ws1 = wb.create_sheet("EXECUTIVE DASHBOARD")
    ws1.append(["Key Performance Indicator", "Value"])
    
    total_leads = len(calls_data)
    hot_leads = sum(1 for c in calls_data if c.get("analysis", {}).get("lead_temperature") == "Hot")
    warm_leads = sum(1 for c in calls_data if c.get("analysis", {}).get("lead_temperature") == "Warm")
    cold_leads = sum(1 for c in calls_data if c.get("analysis", {}).get("lead_temperature") == "Cold")
    
    total_intent = sum(c.get("analysis", {}).get("intent_score", 0) for c in calls_data)
    avg_intent = round(total_intent / total_leads, 2) if total_leads else 0
    
    total_conv = sum(c.get("analysis", {}).get("conversion_probability", 0) for c in calls_data)
    avg_conv = round(total_conv / total_leads, 2) if total_leads else 0
    
    # Missing fields for dashboard we can estimate or leave placeholder
    calls_this_week = total_leads # Simplified
    missed_follow_ups = 0
    
    data1 = [
        ["Total Leads", total_leads],
        ["Hot Leads", hot_leads],
        ["Warm Leads", warm_leads],
        ["Cold Leads", cold_leads],
        ["Avg Buyer Intent %", avg_intent],
        ["Conversion Probability %", avg_conv],
        ["Calls This Week", calls_this_week],
        ["Missed Follow-ups", missed_follow_ups]
    ]
    
    for row in data1:
        ws1.append(_safe_row(row))
        
    _apply_header_style(ws1)
    _auto_adjust_columns(ws1)
    
    # ---------------------------------------------------------
    # SHEET 2: LEAD PIPELINE
    # ---------------------------------------------------------
    ws2 = wb.create_sheet("LEAD PIPELINE")
    headers2 = [
        "Lead ID", "Customer Name", "Phone Number", "Project Interested", 
        "Budget", "Property Type", "Preferred Location", "Lead Temperature",
        "Buyer Intent %", "Conversion Probability %", "Last Call Date", 
        "Next Follow-up Date", "Assigned Agent", "Call Outcome", "Priority"
    ]
    ws2.append(headers2)
    
    for c in calls_data:
        analysis = c.get("analysis") or {}
        reqs = analysis.get("property_requirements") or {}
        temp = analysis.get("lead_temperature", "Warm")
        intent = analysis.get("intent_score", 0)
        
        priority = "High" if temp == "Hot" else "Medium" if temp == "Warm" else "Low"
        dt = c.get("created_at")
        dt_str = dt.strftime("%Y-%m-%d %H:%M:%S") if isinstance(dt, datetime) else str(dt)
        
        row = [
            c.get("call_id", ""),
            c.get("customer_name", "Phone Lead"),
            c.get("customer_id", ""),
            reqs.get("location", "N/A"), # Assuming location is project interested
            reqs.get("budget", "N/A"),
            reqs.get("propertyType", "N/A"),
            reqs.get("location", "N/A"),
            temp,
            intent,
            analysis.get("conversion_probability", 0),
            dt_str,
            "TBD", # Next Follow-up Date
            c.get("agent_name", "AI Agent"),
            analysis.get("summary", ""),
            priority
        ]
        ws2.append(_safe_row(row))
        
        # Color coding
        last_row = ws2.max_row
        if temp == "Hot":
            fill = PatternFill(start_color=color_hot, end_color=color_hot, fill_type="solid")
        elif temp == "Warm":
            fill = PatternFill(start_color=color_warm, end_color=color_warm, fill_type="solid")
        else:
            fill = PatternFill(start_color=color_cold, end_color=color_cold, fill_type="solid")
            
        for cell in ws2[last_row]:
            cell.fill = fill

    _apply_header_style(ws2)
    ws2.auto_filter.ref = ws2.dimensions
    ws2.freeze_panes = "A2"
    _auto_adjust_columns(ws2)

    # ---------------------------------------------------------
    # SHEET 3: AGENT PERFORMANCE
    # ---------------------------------------------------------
    ws3 = wb.create_sheet("AGENT PERFORMANCE")
    headers3 = [
        "Agent Name", "Calls Handled", "Avg Talk Time", "Hot Leads Generated", 
        "Conversions Closed", "Follow-up Completion %", "Avg Sentiment Score"
    ]
    ws3.append(headers3)
    
    agents = {}
    for c in calls_data:
        agent = c.get("agent_name", "AI Agent")
        if agent not in agents:
            agents[agent] = {"calls": 0, "hot": 0, "conv": 0, "sentiments": []}
        
        agents[agent]["calls"] += 1
        analysis = c.get("analysis") or {}
        if analysis.get("lead_temperature") == "Hot":
            agents[agent]["hot"] += 1
        
        agents[agent]["conv"] += 1 if analysis.get("conversion_probability", 0) > 80 else 0
        sentiment = c.get("sentiment", "neutral")
        score = 1 if sentiment == "positive" else (-1 if sentiment == "negative" else 0)
        agents[agent]["sentiments"].append(score)
        
    for agent, stats in agents.items():
        avg_sent = round(sum(stats["sentiments"])/len(stats["sentiments"]), 2) if stats["sentiments"] else 0
        ws3.append(_safe_row([
            agent, stats["calls"], "N/A", stats["hot"], 
            stats["conv"], "100%", avg_sent
        ]))
        
    _apply_header_style(ws3)
    ws3.auto_filter.ref = ws3.dimensions
    _auto_adjust_columns(ws3)

    # ---------------------------------------------------------
    # SHEET 4: CALL INTELLIGENCE SUMMARY
    # ---------------------------------------------------------
    ws4 = wb.create_sheet("CALL INTELLIGENCE SUMMARY")
    headers4 = [
        "Customer Name", "Sentiment", "Budget Mentioned", "Property Type", 
        "Preferred Location", "Timeline to Purchase", "Loan Requirement", 
        "Site Visit Interest", "Key Objections", "Competitor Mentioned", 
        "Interest Score", "Language"
    ]
    ws4.append(headers4)
    
    for c in calls_data:
        analysis = c.get("analysis") or {}
        reqs = analysis.get("property_requirements") or {}
        objections = analysis.get("key_objections") or []
        obj_str = ", ".join([o.get("content", "") for o in objections if isinstance(o, dict)]) if objections else "None"
        
        intents = analysis.get("intents") or []
        site_visit = "Yes" if "Site Visit" in str(intents) else "No"
        
        ws4.append(_safe_row([
            c.get("customer_name", "Phone Lead"),
            c.get("sentiment", "neutral"),
            reqs.get("budget", "N/A"),
            reqs.get("propertyType", "N/A"),
            reqs.get("location", "N/A"),
            reqs.get("timeline", "N/A"),
            "Yes" if reqs.get("loanRequired") else "No",
            site_visit,
            obj_str,
            "N/A", # Competitor Not directly available
            analysis.get("intent_score", 0),
            c.get("language", "English")
        ]))
    _apply_header_style(ws4)
    ws4.auto_filter.ref = ws4.dimensions
    ws4.freeze_panes = "A2"
    _auto_adjust_columns(ws4)

    # ---------------------------------------------------------
    # SHEET 5: FOLLOW-UP ACTION LIST
    # ---------------------------------------------------------
    ws5 = wb.create_sheet("FOLLOW-UP ACTION LIST")
    headers5 = [
        "Customer Name", "Phone", "Reason", "Next Action", 
        "Due Date", "Assigned Agent", "Priority"
    ]
    ws5.append(headers5)
    
    for c in calls_data:
        analysis = c.get("analysis") or {}
        follow_ups = analysis.get("follow_up_recommendations") or []
        if follow_ups:
            for fu in follow_ups:
                if isinstance(fu, dict):
                    ws5.append(_safe_row([
                        c.get("customer_name", "Phone Lead"),
                        c.get("customer_id", ""),
                        fu.get("content", "Follow up"),
                        fu.get("type", "Call"),
                        "Tomorrow",
                        c.get("agent_name", "AI Agent"),
                        fu.get("priority", "Medium")
                    ]))
        else:
            action_items = analysis.get("action_items") or []
            for ai in action_items:
                ws5.append(_safe_row([
                    c.get("customer_name", "Phone Lead"),
                    c.get("customer_id", ""),
                    ai,
                    "Action Required",
                    "Tomorrow",
                    c.get("agent_name", "AI Agent"),
                    "Medium"
                ]))
    _apply_header_style(ws5)
    ws5.auto_filter.ref = ws5.dimensions
    ws5.freeze_panes = "A2"
    _auto_adjust_columns(ws5)

    # ---------------------------------------------------------
    # SHEET 6: LOST LEADS ANALYSIS
    # ---------------------------------------------------------
    ws6 = wb.create_sheet("LOST LEADS ANALYSIS")
    headers6 = [
        "Customer Name", "Reason Lost", "Budget Mismatch", "No Response", 
        "Competitor Chosen", "Not Interested", "Timeline Too Long"
    ]
    ws6.append(headers6)
    
    for c in calls_data:
        analysis = c.get("analysis") or {}
        if analysis.get("lead_temperature") == "Cold":
            objections = analysis.get("key_objections") or []
            obj_str = ", ".join([o.get("content", "") for o in objections if isinstance(o, dict)]) if objections else "Unknown"
            
            budget_mismatch = "Yes" if "budget" in obj_str.lower() or "price" in obj_str.lower() else "No"
            
            ws6.append(_safe_row([
                c.get("customer_name", "Phone Lead"),
                obj_str,
                budget_mismatch,
                "No",
                "No",
                "Yes" if "not interested" in obj_str.lower() else "No",
                "No"
            ]))
            
    _apply_header_style(ws6)
    ws6.auto_filter.ref = ws6.dimensions
    ws6.freeze_panes = "A2"
    _auto_adjust_columns(ws6)

    # Remove the initially created empty sheet
    if default_sheet.title == "Sheet":
        wb.remove(default_sheet)
        
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".xlsx")
    wb.save(temp_file.name)
    temp_file.close()
    
    return temp_file.name
