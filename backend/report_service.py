import os
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

def generate_calls_export(calls_data, direction_label="All"):
    """
    Two-sheet, executive-grade .xlsx export for Outbound and Inbound calls.
    Sheet 1: Executive KPI Summary & Performance Analytics
    Sheet 2: Detailed Call Logs with AI Score, Concrete Outcomes, Intent, and Transcripts.
    """
    wb = Workbook()
    
    is_inbound = str(direction_label).strip().lower() == "inbound"
    brand_color = "134E4A" if is_inbound else "1E3A8A" # Deep Teal for Inbound, Deep Navy for Outbound
    accent_color = "0D9488" if is_inbound else "2563EB"
    
    # ---------------------------------------------------------
    # SHEET 1: EXECUTIVE KPI SUMMARY
    # ---------------------------------------------------------
    ws_kpi = wb.active
    ws_kpi.title = "Executive Summary"
    ws_kpi.views.sheetView[0].showGridLines = True
    
    # Title Banner
    ws_kpi.merge_cells("A1:F1")
    title_cell = ws_kpi["A1"]
    title_cell.value = f"TALKLY AI -- {direction_label.upper()} CALLING INTELLIGENCE REPORT"
    title_cell.font = Font(bold=True, color="FFFFFF", size=14)
    title_cell.fill = PatternFill(start_color=brand_color, end_color=brand_color, fill_type="solid")
    title_cell.alignment = Alignment(horizontal="left", vertical="center", indent=1)
    ws_kpi.row_dimensions[1].height = 36
    
    # Subtitle / Export info
    ws_kpi["A2"] = f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')} | Direction: {direction_label.title()} Calling | Scope: All Synced Calls"
    ws_kpi["A2"].font = Font(italic=True, color="555555", size=9)
    ws_kpi.row_dimensions[2].height = 20

    # Aggregate KPI figures
    total_calls = len(calls_data)
    connected_calls = 0
    total_duration_sec = 0
    hot_leads = 0
    warm_leads = 0
    cold_leads = 0
    total_score = 0
    scored_calls = 0
    outcomes_count = {}
    
    for c in calls_data:
        dur = c.get("duration") or c.get("duration_seconds") or 0
        try:
            dur_float = float(dur)
        except (ValueError, TypeError):
            dur_float = 0.0
            
        status_clean = str(c.get("status") or "").lower()
        if dur_float > 0 or status_clean in ("completed", "analyzed"):
            connected_calls += 1
            total_duration_sec += int(dur_float)
            
        analysis = c.get("analysis") or {}
        temp = analysis.get("lead_temperature") or ""
        if temp == "Hot":
            hot_leads += 1
        elif temp == "Warm":
            warm_leads += 1
        elif temp == "Cold":
            cold_leads += 1
            
        score = analysis.get("lead_score")
        if score is None:
            score = c.get("aiScore")
        if isinstance(score, (int, float)) and score > 0:
            total_score += score
            scored_calls += 1
            
        outcome = analysis.get("outcome") or c.get("outcome_summary") or c.get("outcome")
        if not outcome:
            outcome = "No Answer" if status_clean in ("no answer", "no-answer") else ("Call Answered" if dur_float > 0 else "Unrecorded")
        outcomes_count[outcome] = outcomes_count.get(outcome, 0) + 1

    connect_rate = f"{(connected_calls / total_calls * 100):.1f}%" if total_calls > 0 else "0.0%"
    avg_score = round(total_score / scored_calls) if scored_calls > 0 else 0
    avg_dur = round(total_duration_sec / connected_calls) if connected_calls > 0 else 0
    avg_mins, avg_secs = divmod(avg_dur, 60)
    avg_dur_fmt = f"{avg_mins}m {avg_secs}s" if avg_mins > 0 else f"{avg_secs}s"

    # KPI Table
    ws_kpi["A4"] = "KEY PERFORMANCE INDICATORS"
    ws_kpi["A4"].font = Font(bold=True, color=brand_color, size=11)
    
    kpi_headers = ["Metric", "Value", "Benchmark / Context"]
    ws_kpi.append([])
    ws_kpi.append(kpi_headers)
    _apply_header_style(ws_kpi, header_row=5, bg_color=brand_color)
    
    kpi_rows = [
        ["Total Calls Logged", total_calls, "Total dial attempts recorded"],
        ["Connected / Answered Calls", connected_calls, f"{connect_rate} connection rate"],
        ["Average Call Duration", avg_dur_fmt, "Across all answered conversations"],
        ["Hot Leads (High Intent)", hot_leads, "Immediate priority for human sales / support follow-up"],
        ["Warm Leads (Medium Intent)", warm_leads, "Nurturing or scheduled follow-up recommended"],
        ["Cold Leads (Low / No Intent)", cold_leads, "Declined, busy, or non-responsive"],
        ["Average AI Lead Score", f"{avg_score} / 100", "Across evaluated prospect conversations"]
    ]
    
    thin_border = Border(
        left=Side(style='thin', color='E2E8F0'),
        right=Side(style='thin', color='E2E8F0'),
        top=Side(style='thin', color='E2E8F0'),
        bottom=Side(style='thin', color='E2E8F0')
    )
    
    for r_idx, row in enumerate(kpi_rows, start=6):
        ws_kpi.append(row)
        ws_kpi.row_dimensions[r_idx].height = 20
        fill_color = "F8FAFC" if r_idx % 2 == 0 else "FFFFFF"
        row_fill = PatternFill(start_color=fill_color, end_color=fill_color, fill_type="solid")
        for cell in ws_kpi[r_idx]:
            cell.fill = row_fill
            cell.border = thin_border
            cell.font = Font(size=9.5)
            if cell.column == 2:
                cell.font = Font(bold=True, size=10, color=brand_color)
                cell.alignment = Alignment(horizontal="center")

    # Outcomes Breakdown Table
    start_outcome_row = len(kpi_rows) + 8
    ws_kpi.cell(row=start_outcome_row, column=1, value="CONCRETE CALL OUTCOMES BREAKDOWN").font = Font(bold=True, color=brand_color, size=11)
    
    outcome_headers = ["Call Outcome", "Count", "Percentage of Calls"]
    ws_kpi.cell(row=start_outcome_row + 1, column=1, value=outcome_headers[0])
    ws_kpi.cell(row=start_outcome_row + 1, column=2, value=outcome_headers[1])
    ws_kpi.cell(row=start_outcome_row + 1, column=3, value=outcome_headers[2])
    _apply_header_style(ws_kpi, header_row=start_outcome_row + 1, bg_color=brand_color)
    
    curr_r = start_outcome_row + 2
    for outcome_label, count in sorted(outcomes_count.items(), key=lambda x: x[1], reverse=True)[:10]:
        pct_str = f"{(count / total_calls * 100):.1f}%" if total_calls > 0 else "0.0%"
        ws_kpi.cell(row=curr_r, column=1, value=outcome_label).font = Font(size=9.5)
        ws_kpi.cell(row=curr_r, column=2, value=count).font = Font(bold=True, size=9.5)
        ws_kpi.cell(row=curr_r, column=3, value=pct_str).font = Font(size=9.5)
        fill_color = "F8FAFC" if curr_r % 2 == 0 else "FFFFFF"
        row_fill = PatternFill(start_color=fill_color, end_color=fill_color, fill_type="solid")
        for c_idx in range(1, 4):
            c_cell = ws_kpi.cell(row=curr_r, column=c_idx)
            c_cell.fill = row_fill
            c_cell.border = thin_border
            if c_idx > 1:
                c_cell.alignment = Alignment(horizontal="center")
        curr_r += 1
        
    _auto_adjust_columns(ws_kpi)
    ws_kpi.column_dimensions["A"].width = 38
    ws_kpi.column_dimensions["B"].width = 18
    ws_kpi.column_dimensions["C"].width = 50

    # ---------------------------------------------------------
    # SHEET 2: CALL LOGS & AI INTELLIGENCE
    # ---------------------------------------------------------
    ws_data = wb.create_sheet(f"{direction_label.title()} Call Logs")
    ws_data.views.sheetView[0].showGridLines = True
    
    if is_inbound:
        headers = [
            "Call ID", "Date & Time", "Caller Name", "Phone Number",
            "Department / Industry", "Inquiry Topic / Product", "Status",
            "Duration (mm:ss)", "Duration (sec)", "AI Score", "Lead Temp",
            "Customer Intent", "Call Outcome", "Inquiry Requirements",
            "Action Items", "Sentiment", "Language", "Call Summary", "Full Transcript"
        ]
    else:
        headers = [
            "Call ID", "Date & Time", "Customer Name", "Phone Number",
            "Campaign / Offering", "Status", "Duration (mm:ss)", "Duration (sec)",
            "AI Score", "Lead Temp", "Call Outcome", "Primary Intent",
            "Conversion Prob %", "PTP / Booking Commitments", "Key Objections",
            "Action Items", "Sentiment", "Language", "Call Summary", "Full Transcript"
        ]
        
    ws_data.append(headers)
    _apply_header_style(ws_data, header_row=1, bg_color=brand_color)
    
    align_left = Alignment(horizontal="left", vertical="top")
    align_center_top = Alignment(horizontal="center", vertical="top")
    align_wrap_top = Alignment(horizontal="left", vertical="top", wrap_text=True)

    temp_fills = {
        "Hot": PatternFill(start_color="FEE2E2", end_color="FEE2E2", fill_type="solid"),
        "Warm": PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid"),
        "Cold": PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
    }
    temp_fonts = {
        "Hot": Font(bold=True, color="991B1B", size=9),
        "Warm": Font(bold=True, color="92400E", size=9),
        "Cold": Font(bold=True, color="075985", size=9)
    }

    for row_idx, c in enumerate(calls_data, start=2):
        duration_secs = c.get("duration_seconds") or c.get("duration") or 0
        try:
            duration_secs = float(duration_secs)
        except (TypeError, ValueError):
            duration_secs = 0.0
        mins, secs = divmod(int(duration_secs), 60)
        duration_fmt = f"{mins:02d}:{secs:02d}" if duration_secs > 0 else "00:00"

        analysis = c.get("analysis") or {}
        dt = c.get("created_at")
        dt_str = dt.strftime("%Y-%m-%d %H:%M:%S") if isinstance(dt, datetime) else str(dt or "")

        phone = c.get("customer_id") or c.get("customer_phone") or c.get("to") or c.get("from") or c.get("phone") or ""
        name = c.get("customer_name") or c.get("name") or "Valued Customer"
        offering = c.get("offering") or c.get("property") or (analysis.get("requirements") or {}).get("offering") or ""
        industry = c.get("industry") or "General"
        outcome = analysis.get("outcome") or c.get("outcome_summary") or c.get("outcome") or ("No Answer" if str(c.get("status")).lower() in ("no answer", "no-answer") else "")
        score = analysis.get("lead_score") if analysis.get("lead_score") is not None else c.get("aiScore", "")
        lead_temp = analysis.get("lead_temperature") or ""
        sentiment = c.get("sentiment") or analysis.get("sentiment") or ""
        summary = c.get("summary") or analysis.get("summary") or ""
        transcript = c.get("transcript") or ""
        
        # Parse intents, requirements, objections, actions
        raw_intents = analysis.get("intents") or [analysis.get("intent_label")] if analysis.get("intent_label") else []
        intents_str = ", ".join(str(x) for x in raw_intents if x)
        
        reqs = analysis.get("requirements") or {}
        req_parts = [f"{k}: {v}" for k, v in reqs.items() if v]
        req_str = " | ".join(req_parts)
        
        raw_objs = analysis.get("key_objections") or []
        obj_parts = []
        for obj in raw_objs:
            if isinstance(obj, dict):
                content = obj.get("content") or obj.get("type") or ""
                if content: obj_parts.append(str(content))
            elif isinstance(obj, str):
                obj_parts.append(obj)
        objections_str = ", ".join(obj_parts)
        
        raw_actions = analysis.get("action_items") or []
        actions_str = ", ".join(str(x) for x in raw_actions if x)
        
        # PTP details
        ptp = analysis.get("promise_to_pay") or c.get("promise_to_pay") or {}
        ptp_commit = ""
        if isinstance(ptp, dict) and ptp.get("promised"):
            amt = ptp.get("amount") or c.get("ptp_amount") or ""
            date = ptp.get("date") or c.get("ptp_date") or ""
            ptp_commit = f"Rs. {amt} by {date}".strip()
            
        conv_prob = f"{analysis.get('conversion_probability')}%" if analysis.get("conversion_probability") is not None else ""

        if is_inbound:
            row_data = [
                c.get("call_id", ""),
                dt_str,
                name,
                phone,
                industry.replace("_", " ").title(),
                offering,
                c.get("status", ""),
                duration_fmt,
                int(duration_secs),
                score if score != "" else "—",
                lead_temp,
                intents_str,
                outcome,
                req_str,
                actions_str,
                sentiment.title() if sentiment else "",
                c.get("language", "English"),
                summary,
                transcript
            ]
        else:
            row_data = [
                c.get("call_id", ""),
                dt_str,
                name,
                phone,
                offering or industry.replace("_", " ").title(),
                c.get("status", ""),
                duration_fmt,
                int(duration_secs),
                score if score != "" else "—",
                lead_temp,
                outcome,
                intents_str,
                conv_prob,
                ptp_commit,
                objections_str,
                actions_str,
                sentiment.title() if sentiment else "",
                c.get("language", "English"),
                summary,
                transcript
            ]

        ws_data.append(_safe_row(row_data))
        ws_data.row_dimensions[row_idx].height = 24
        
        # Zebra striping
        zebra_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid") if row_idx % 2 == 0 else PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
        
        for col_idx, cell in enumerate(ws_data[row_idx], start=1):
            cell.border = thin_border
            cell.font = Font(size=9.5)
            cell.fill = zebra_fill
            cell.alignment = align_left
            
            # Center dates, status, numbers
            if col_idx in (1, 2, 4, 7, 8, 9, 13, 17):
                cell.alignment = align_center_top
                
            # Lead Temperature colored badge
            if headers[col_idx - 1] == "Lead Temp" and lead_temp in temp_fills:
                cell.fill = temp_fills[lead_temp]
                cell.font = temp_fonts[lead_temp]
                cell.alignment = align_center_top

    ws_data.auto_filter.ref = ws_data.dimensions
    ws_data.freeze_panes = "A2"
    _auto_adjust_columns(ws_data)
    
    # Transcript & summary column width cap
    for col_letter in ("A", "B", "C", "D", "E", "F", "G"):
        current_w = ws_data.column_dimensions[col_letter].width or 15
        ws_data.column_dimensions[col_letter].width = max(current_w, 14)
        
    summary_col_idx = headers.index("Call Summary") + 1
    transcript_col_idx = headers.index("Full Transcript") + 1
    ws_data.column_dimensions[get_column_letter(summary_col_idx)].width = 45
    ws_data.column_dimensions[get_column_letter(transcript_col_idx)].width = 65

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
