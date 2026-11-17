import os
import openpyxl
from report_service import generate_calls_export

def test_executive_excel_omnichannel_export():
    sample_calls = [
        {
            "call_id": "outbound-001",
            "direction": "outbound",
            "customer_name": "Shivam Kumar",
            "customer_phone": "+919876543210",
            "created_at": "2026-11-17 10:30:00",
            "status": "completed",
            "duration_seconds": 150,
            "offering": "Full Stack & AI Course",
            "analysis": {
                "lead_score": 88,
                "lead_temperature": "Hot",
                "outcome": "Live Demo Session Booked",
                "intents": ["Upskilling", "Job Placement"],
                "requirements": {"budget": "₹35,000", "location": "Noida", "email": "shivam@example.com"},
                "key_objections": [{"content": "Prefers weekend batch"}],
                "action_items": ["Send syllabus PDF and calendar invite"]
            },
            "transcript": "AI: Hello Shivam...\nCustomer: Yes..."
        },
        {
            "call_id": "inbound-001",
            "direction": "inbound",
            "customer_name": "Priya Sharma",
            "customer_phone": "+919811223344",
            "created_at": "2026-11-17 11:15:00",
            "status": "completed",
            "duration_seconds": 195,
            "offering": "Clinic Appointment",
            "analysis": {
                "lead_score": 92,
                "lead_temperature": "Hot",
                "outcome": "Appointment Confirmed",
                "intents": ["Cardiology Consultation"],
                "requirements": {"location": "South Delhi Clinic", "email": "priya@example.com"},
                "action_items": ["Confirmation SMS sent with location map"]
            },
            "transcript": "AI: Namaste...\nCustomer: Hello..."
        }
    ]

    sample_leads = [
        {
            "lead_id": "lead-1",
            "name": "Shivam Kumar",
            "phone": "+919876543210",
            "email": "shivam.lead@abc.com",
            "company": "Tech Corp",
            "location": "Noida Sector 62",
            "budget": "₹40,000"
        }
    ]

    # Test Omnichannel (Both Inbound & Outbound)
    file_path = generate_calls_export(sample_calls, "All", leads=sample_leads, company_name="ABC Technology")
    assert os.path.exists(file_path), "Generated Excel file must exist on disk!"

    wb = openpyxl.load_workbook(file_path)
    expected_sheets = [
        "Executive Summary",
        "Outbound Leads & Calls",
        "Inbound Leads & Inquiries",
        "All Leads Master Directory"
    ]
    assert wb.sheetnames == expected_sheets, f"Expected sheets {expected_sheets}, got {wb.sheetnames}"

    # Verify Sheet 1: Executive Summary
    ws_kpi = wb["Executive Summary"]
    assert "TALKLY AI -- EXECUTIVE CALLING & LEAD INTELLIGENCE REPORT" in str(ws_kpi["A1"].value)
    assert ws_kpi.max_row >= 15

    # Verify Sheet 2: Outbound Leads
    ws_out = wb["Outbound Leads & Calls"]
    headers_out = [ws_out.cell(row=4, column=c).value for c in range(1, 25)]
    assert "Customer Name" in headers_out
    assert "Phone Number" in headers_out
    assert "Email Address" in headers_out
    assert "Budget / Deal Value" in headers_out
    # Row 5 has enriched customer data
    assert ws_out.cell(row=5, column=3).value == "Shivam Kumar"
    assert ws_out.cell(row=5, column=5).value == "shivam.lead@abc.com" # Enriched from lead!
    assert ws_out.cell(row=5, column=7).value == "Tech Corp"          # Enriched from lead!
    assert ws_out.cell(row=5, column=14).value == "Hot"

    # Verify Sheet 3: Inbound Leads
    ws_in = wb["Inbound Leads & Inquiries"]
    headers_in = [ws_in.cell(row=4, column=c).value for c in range(1, 24)]
    assert "Caller / Customer Name" in headers_in
    assert "Phone Number" in headers_in
    assert "Inquiry Topic / Offering" in headers_in
    assert ws_in.cell(row=5, column=3).value == "Priya Sharma"
    assert ws_in.cell(row=5, column=15).value == "Hot"

    # Verify Sheet 4: Master Directory
    ws_master = wb["All Leads Master Directory"]
    assert ws_master.max_row == 6 # Header + 2 data rows

    wb.close()
    if os.path.exists(file_path):
        os.remove(file_path)
    print("✓ Executive Excel Export Unit Test Passed Successfully!")

if __name__ == "__main__":
    test_executive_excel_omnichannel_export()
