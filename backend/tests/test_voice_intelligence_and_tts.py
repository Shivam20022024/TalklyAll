"""
Talkly AI - Voice Conversation Intelligence & Hindi TTS Normalization QA Test Suite
Tests:
- TN01-TN10: Number, Currency, Time, Date, Measurement Normalization & Language Awareness
- CS01-CS05: Sentence Boundary & Chunking Safety (Decimals, sq. ft., ellipses)
- CI01-CI05: Conversational Intelligence Directives, Intent & Clean TTS Sanity
"""

import sys
import os
import re

# Ensure backend directory is in python path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from services.hindi_normalizer import (
    int_to_hindi,
    normalize_currency_hindi,
    normalize_time_hindi,
    normalize_measurements_hindi,
    normalize_dates_hindi,
    normalize_standalone_numbers_hindi,
    normalize_for_tts
)
from routes.plivo_routes import clean_tts_text, extract_first_sentence


def test_tn01_currency_normalization():
    cases = [
        ("₹78,000", "अठहत्तर हज़ार रुपये"),
        ("₹2,500", "दो हज़ार पाँच सौ रुपये"),
        ("₹1.5 Lakh", "डेढ़ लाख रुपये"),
        ("₹2.5 Cr", "ढाई करोड़ रुपये"),
        ("₹500", "पाँच सौ रुपये"),
        ("₹0", "शून्य रुपये"),
    ]
    for inp, expected in cases:
        out = normalize_for_tts(inp, language="Hindi")
        assert expected in out, f"Failed on {inp}: expected '{expected}' in '{out}'"
    print("✓ TN01: Currency Normalization PASSED")


def test_tn02_time_normalization():
    cases = [
        ("10:00 AM", "सुबह दस बजे"),
        ("2:00 PM", "दोपहर दो बजे"),
        ("6:30 PM", "शाम छह बजकर तीस मिनट"),
        ("8:15 AM", "सुबह आठ बजकर पंद्रह मिनट"),
        ("7:45 PM", "शाम सात बजकर पैंतालीस मिनट"),
        ("10:00 बजे", "दस बजे"),
        ("10 बजे", "दस बजे"),
        ("11 बजे", "ग्यारह बजे"),
        ("सुबह 10 या 11 बजे?", "सुबह दस बजे या ग्यारह बजे?"),
        ("कल 10 से 12 बजे", "कल दस बजे से बारह बजे"),
        ("10:30 par", "दस बजकर तीस मिनट"),
        ("सुबह 10:00 AM", "सुबह दस बजे"),  # No duplicate 'सुबह सुबह'
    ]
    for inp, expected in cases:
        out = normalize_for_tts(inp, language="Hindi")
        assert expected in out, f"Failed on {inp}: expected '{expected}' in '{out}'"
    print("✓ TN02: Time Normalization PASSED")


def test_tn03_measurement_and_solar_capacities():
    cases = [
        ("250-300 sq. ft.", "ढाई सौ से तीन सौ वर्ग फुट"),
        ("350-400 sq. ft.", "तीन सौ पचास से चार सौ वर्ग फुट"),
        ("3kW", "तीन किलोवाट"),
        ("5kW", "पाँच किलोवाट"),
        ("10kW", "दस किलोवाट"),
        ("25 years", "पच्चीस साल"),
        ("25%", "पच्चीस प्रतिशत"),
        ("40%", "चालीस प्रतिशत"),
    ]
    for inp, expected in cases:
        out = normalize_for_tts(inp, language="Hindi")
        assert expected in out, f"Failed on {inp}: expected '{expected}' in '{out}'"
    print("✓ TN03: Measurement & Solar Capacities PASSED")


def test_tn04_date_normalization():
    cases = [
        ("10 November 2026", "दस नवंबर दो हज़ार छब्बीस"),
        ("15 December", "पंद्रह दिसंबर"),
    ]
    for inp, expected in cases:
        out = normalize_for_tts(inp, language="Hindi")
        assert expected in out, f"Failed on {inp}: expected '{expected}' in '{out}'"
    print("✓ TN04: Date Normalization PASSED")


def test_tn05_standalone_numbers_and_exceptions():
    # Model codes, phone numbers, and emails must NOT be distorted
    sample = "Call +919876543210 or email test@talkly.ai for 3BHK flat with 250 units."
    out = normalize_for_tts(sample, language="Hindi")
    assert "+919876543210" in out, "Phone number was unexpectedly modified!"
    assert "test@talkly.ai" in out, "Email was unexpectedly modified!"
    assert "3BHK" in out, "Alphanumeric model code was unexpectedly modified!"
    assert "ढाई सौ" in out or "दो सौ पचास" in out, "Standalone 250 was not normalized!"
    print("✓ TN05: Standalone Numbers & Exception Protection PASSED")


def test_tn06_english_mode_preservation():
    # If language is English, numbers, dollar signs, and times must remain untouched
    english_text = "You will get a $78,000 rebate on 3kW system with 250 sq. ft. roof at 10:00 AM."
    out = normalize_for_tts(english_text, language="English")
    assert out == english_text, f"English text was modified unexpectedly: {out}"
    print("✓ TN06: English Mode Preservation PASSED")


def test_tn07_full_hindi_speech_utterances():
    # Real utterances from conversations
    utterances = [
        ("आपको PM सूर्या घर योजना के तहत ₹78,000 की सब्सिडी मिलेगी।", "अठहत्तर हज़ार रुपये"),
        ("क्या आपका मासिक बिजली बिल ₹2,500 से ज्यादा है?", "दो हज़ार पाँच सौ रुपये"),
        ("सौर पैनलों पर 25 साल की प्रदर्शन वारंटी और इन्वर्टर्स पर 5 साल की वारंटी होती है।", "पच्चीस साल"),
        ("सौर पैनल इंस्टॉलेशन के लिए, 3kW सिस्टम के लिए लगभग 250-300 वर्ग फुट जगह चाहिए।", "तीन किलोवाट"),
        ("क्या आप सुबह 10 बजे या दोपहर 2 बजे में से कोई समय चुनना चाहेंगे?", "सुबह दस बजे"),
        ("ठीक है! सुबह के लिए कौन सा समय सही रहेगा, सुबह 10 बजे या 11 बजे?", "सुबह दस बजे या ग्यारह बजे?"),
    ]
    for utt, expected_substr in utterances:
        cleaned = clean_tts_text(utt, language="Hindi")
        assert expected_substr in cleaned, f"Failed on '{utt}': expected '{expected_substr}' in '{cleaned}'"

    # Even if language parameter is "English", Hindi text MUST be normalized to Hindi words
    cross_lang_clean = clean_tts_text("ठीक है! सुबह के लिए कौन सा समय सही रहेगा, सुबह 10 बजे या 11 बजे?", language="English")
    assert "सुबह दस बजे या ग्यारह बजे" in cross_lang_clean, f"Cross-language fallback failed: {cross_lang_clean}"

    print("✓ TN07: Full Hindi Speech Utterances PASSED")


def test_cs01_sentence_boundary_safety():
    # Decimals must NOT cause premature sentence split
    s1, r1 = extract_first_sentence("यह 1.5 लाख रुपये की सब्सिडी है। क्या आप आगे बढ़ेंगे?")
    assert s1 == "यह 1.5 लाख रुपये की सब्सिडी है।", f"Decimals split prematurely: {s1}"
    assert r1 == "क्या आप आगे बढ़ेंगे?", f"Unexpected remainder: {r1}"

    # sq. ft. abbreviation must NOT cause premature sentence split
    s2, r2 = extract_first_sentence("3kW सिस्टम के लिए लगभग 250 sq. ft. जगह चाहिए। और 5kW के लिए 350 sq. ft. चाहिए।")
    assert s2 == "3kW सिस्टम के लिए लगभग 250 sq. ft. जगह चाहिए।", f"sq. ft. split prematurely: {s2}"
    assert r2 == "और 5kW के लिए 350 sq. ft. चाहिए।", f"Unexpected remainder: {r2}"

    # Incomplete buffer without terminal punctuation must wait
    s3, r3 = extract_first_sentence("3kW सिस्टम के लिए लगभग 250")
    assert s3 == "", f"Incomplete buffer emitted prematurely: {s3}"
    assert r3 == "3kW सिस्टम के लिए लगभग 250", f"Remainder lost: {r3}"

    print("✓ CS01: Sentence Boundary & Chunking Safety PASSED")


def test_ci01_clean_tts_formatting_sanitization():
    # Markdown asterisks, underscores, and leaked placeholders must be stripped
    raw = "**नमस्ते** _Rohit_, आपका बिल ₹2,500 है। [Details]"
    cleaned = clean_tts_text(raw, customer_name="Rohit", is_subsequent=False, language="Hindi")
    assert "**" not in cleaned
    assert "_" not in cleaned
    assert "[" not in cleaned
    assert "दो हज़ार पाँच सौ रुपये" in cleaned

    # Robotic opener 'समझ गया।' must be sanitized to natural 'जी, '
    robotic_opener = "समझ गया। क्या आप सुबह का समय पसंद करेंगे या शाम का?"
    natural_clean = clean_tts_text(robotic_opener, language="Hindi")
    assert natural_clean.startswith("जी, "), f"Opener not sanitized: {natural_clean}"
    assert "समझ गया" not in natural_clean, f"'समझ गया' still present: {natural_clean}"

    # Female grammatical consistency
    internal_masc = "हाँ, मैं समझ गया।"
    fem_clean = clean_tts_text(internal_masc, language="Hindi")
    assert "समझ गई" in fem_clean, f"Gender mismatch not resolved: {fem_clean}"

    print("✓ CI01: Clean TTS Formatting Sanitization PASSED")


def test_ci02_appointment_booking_tool_validation():
    from routes.plivo_routes import _openai_session_update_payload
    payload = _openai_session_update_payload(system_prompt="Test", transcription_lang="hi")
    tools = payload["session"]["tools"]
    tool_names = [t.get("name") for t in tools]
    assert "end_call" in tool_names, "end_call tool missing!"
    assert "book_appointment_slot" in tool_names, "book_appointment_slot tool missing!"
    book_tool = next(t for t in tools if t.get("name") == "book_appointment_slot")
    assert "slot_time" in book_tool["parameters"]["required"], "slot_time must be required!"
    print("✓ CI02: Appointment Booking Tool Validation PASSED")


def test_ci03_hinglish_amount_and_weather_phrases():
    # Test natural Hindi & Hinglish expressions
    samples = [
        ("Mera bill 5000 hai.", "पाँच हज़ार"),
        ("Mera bill 2500 hai.", "दो हज़ार पाँच सौ"),
        ("2 baje slot book kar dijiye.", "दो बजे"),
        ("Cloudy weather mein 25% generation rehta hai.", "पच्चीस प्रतिशत"),
    ]
    for text, expected in samples:
        norm = normalize_for_tts(text, language="Hindi")
        assert expected in norm, f"Failed on '{text}': expected '{expected}' in '{norm}'"
    print("✓ CI03: Hinglish Amount & Weather Normalization PASSED")


def test_ci04_hinglish_language_continuity_detection():
    from services.hindi_normalizer import is_hindi_or_hinglish
    # The Vishal Mega Mart Hinglish greeting from user call
    vishal_greeting = "Namaste! Main Saanvi bol rahi hoon Vishal Mega Mart se. Hamare yahan sabhi electronic items par 10% discount chal raha hai. Kya aap kisi electronic item ki shopping plan kar rahe hain?"
    assert is_hindi_or_hinglish(vishal_greeting) is True, "Hinglish greeting must be recognized as Hindi/Hinglish!"

    solar_devanagari = "नमस्ते Rohit, मैं Saanvi हूँ TCS से। आपके सौर पैनल इंस्टॉलेशन के लिए बात करने के लिए कॉल किया है।"
    assert is_hindi_or_hinglish(solar_devanagari) is True, "Devanagari greeting must be recognized as Hindi/Hinglish!"

    english_greeting = "Hello John, this is Saanvi from Vishal Mega Mart. We have a 10% discount on electronics. Are you planning any shopping today?"
    assert is_hindi_or_hinglish(english_greeting) is False, "Pure English greeting must not be classified as Hindi!"

    # Test English call with English metadata where system prompt has stray phonetic correction words
    prompt_with_stray_glossary = "You are a counselor. ASR corrections: site infection -> साइट निरीक्षण."
    assert is_hindi_or_hinglish("Hi Yash, this is TCS calling.", prompt_with_stray_glossary, "English") is False, "English metadata must not be overridden by stray glossary terms!"

    # Test Hinglish call metadata
    assert is_hindi_or_hinglish("Hi Yash, this is TCS calling.", "", "Hinglish") is True, "Hinglish metadata must evaluate to True!"

    print("✓ CI04: Hinglish Call Language Continuity & Auto-Detection PASSED")


if __name__ == "__main__":
    print("\nRunning Talkly AI Voice Intelligence & TTS Normalization Test Suite...\n")
    test_tn01_currency_normalization()
    test_tn02_time_normalization()
    test_tn03_measurement_and_solar_capacities()
    test_tn04_date_normalization()
    test_tn05_standalone_numbers_and_exceptions()
    test_tn06_english_mode_preservation()
    test_tn07_full_hindi_speech_utterances()
    test_cs01_sentence_boundary_safety()
    test_ci01_clean_tts_formatting_sanitization()
    test_ci02_appointment_booking_tool_validation()
    test_ci03_hinglish_amount_and_weather_phrases()
    test_ci04_hinglish_language_continuity_detection()
    print("\n==========================================")
    print("ALL 12 TEST SUITES COMPLETED SUCCESSFULLY! ")
    print("==========================================\n")
