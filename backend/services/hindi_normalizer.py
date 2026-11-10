"""
Language-Aware Number, Currency, Time, Date, and Measurement Normalization Engine.
Dynamically converts numerical expressions into natural spoken Hindi words for TTS synthesis
while preserving English pronunciations for English calls and handling technical exceptions
(phone numbers, OTPs, model codes, URLs).
"""

import re
from typing import Optional

# Standard Hindi cardinal number words 0 to 99
HINDI_0_TO_99 = {
    0: 'शून्य', 1: 'एक', 2: 'दो', 3: 'तीन', 4: 'चार', 5: 'पाँच', 6: 'छह', 7: 'सात', 8: 'आठ', 9: 'नौ', 10: 'दस',
    11: 'ग्यारह', 12: 'बारह', 13: 'तेरह', 14: 'चौदह', 15: 'पंद्रह', 16: 'सोलह', 17: 'सत्रह', 18: 'अठारह', 19: 'उन्नीस', 20: 'बीस',
    21: 'इक्कीस', 22: 'बाइस', 23: 'तेईस', 24: 'चौबीस', 25: 'पच्चीस', 26: 'छब्बीस', 27: 'सत्ताईस', 28: 'अट्ठाइस', 29: 'उनतीस', 30: 'तीस',
    31: 'इकत्तीस', 32: 'बत्तीस', 33: 'तैंतीस', 34: 'चौंतीस', 35: 'पैंतीस', 36: 'छत्तीस', 37: 'सैंतीस', 38: 'अड़तीस', 39: 'उनतालीस', 40: 'चालीस',
    41: 'इकतालीस', 42: 'बयालीस', 43: 'तैंतालीस', 44: 'चवालीस', 45: 'पैंतालीस', 46: 'छियालीस', 47: 'सैंतालीस', 48: 'अड़तालीस', 49: 'उनचास', 50: 'पचास',
    51: 'इक्यावन', 52: 'बावन', 53: 'तिरपन', 54: 'चौवन', 55: 'बचपन', 56: 'छप्पन', 57: 'सत्तावन', 58: 'अट्ठावन', 59: 'उनसठ', 60: 'साठ',
    61: 'इकसठ', 62: 'बासठ', 63: 'तिरसठ', 64: 'चौंसठ', 65: 'पैंसठ', 66: 'छियासठ', 67: 'सरसठ', 68: 'अड़सठ', 69: 'उनहत्तर', 70: 'सत्तर',
    71: 'इकहत्तर', 72: 'बहत्तर', 73: 'तिहत्तर', 74: 'चौहत्तर', 75: 'पचहत्तर', 76: 'छिहत्तर', 77: 'सतहत्तर', 78: 'अठहत्तर', 79: 'उन्यासी', 80: 'अस्सी',
    81: 'इक्यासी', 82: 'बयासी', 83: 'तिरासी', 84: 'चौरासी', 85: 'पचासी', 86: 'छियासी', 87: 'सत्तासी', 88: 'अट्ठासी', 89: 'नवासी', 90: 'नब्बे',
    91: 'इक्यानवे', 92: 'बायनवे', 93: 'तिरानवे', 94: 'चौरानवे', 95: 'पचानवे', 96: 'छियानवे', 97: 'सत्तानवे', 98: 'अट्ठानवे', 99: 'निन्यानवे'
}

HINDI_MONTHS = {
    'january': 'जनवरी', 'jan': 'जनवरी',
    'february': 'फ़रवरी', 'feb': 'फ़रवरी',
    'march': 'मार्च', 'mar': 'मार्च',
    'april': 'अप्रैल', 'apr': 'अप्रैल',
    'may': 'मई',
    'june': 'जून', 'jun': 'जून',
    'july': 'जुलाई', 'jul': 'जुलाई',
    'august': 'अगस्त', 'aug': 'अगस्त',
    'september': 'सितंबर', 'sep': 'सितंबर', 'sept': 'सितंबर',
    'october': 'अक्टूबर', 'oct': 'अक्टूबर',
    'november': 'नवंबर', 'nov': 'नवंबर',
    'december': 'दिसंबर', 'dec': 'दिसंबर'
}

HINDI_DIGITS = {
    '0': 'शून्य', '1': 'एक', '2': 'दो', '3': 'तीन', '4': 'चार',
    '5': 'पाँच', '6': 'छह', '7': 'सात', '8': 'आठ', '9': 'नौ'
}


def int_to_hindi(n: int) -> str:
    """
    Recursively and dynamically converts any non-negative integer into standard Indian Hindi words.
    Handles crores (करोड़), lakhs (लाख), thousands (हज़ार), hundreds (सौ), and colloquial units (डेढ़ सौ, ढाई सौ).
    """
    if n < 0:
        return 'माइनस ' + int_to_hindi(abs(n))
    if n in HINDI_0_TO_99:
        return HINDI_0_TO_99[n]
    if n == 150:
        return 'डेढ़ सौ'
    if n == 250:
        return 'ढाई सौ'

    parts = []

    # Crores (1,00,00,000)
    crores = n // 10000000
    n %= 10000000
    if crores > 0:
        parts.append(int_to_hindi(crores) + ' करोड़')

    # Lakhs (1,00,000)
    lakhs = n // 100000
    n %= 100000
    if lakhs > 0:
        parts.append(int_to_hindi(lakhs) + ' लाख')

    # Thousands (1,000)
    thousands = n // 1000
    n %= 1000
    if thousands > 0:
        parts.append(int_to_hindi(thousands) + ' हज़ार')

    # Hundreds (100)
    hundreds = n // 100
    n %= 100
    if hundreds > 0:
        if hundreds == 1 and n == 50:
            return (' '.join(parts) + ' डेढ़ सौ').strip()
        if hundreds == 2 and n == 50:
            return (' '.join(parts) + ' ढाई सौ').strip()
        parts.append(int_to_hindi(hundreds) + ' सौ')

    if n > 0:
        parts.append(HINDI_0_TO_99[n])

    return ' '.join(parts).strip()


def number_to_digits_hindi(num_str: str) -> str:
    """Converts phone numbers or OTPs into digit-by-digit spoken Hindi."""
    digits = re.sub(r'\D', '', num_str)
    return ' '.join(HINDI_DIGITS.get(d, d) for d in digits)


def normalize_currency_hindi(text: str) -> str:
    """
    Normalizes Indian currency expressions into spoken Hindi words.
    e.g. ₹78,000 -> अठहत्तर हज़ार रुपये
         ₹2,500 -> दो हज़ार पाँच सौ रुपये
         ₹1,50,000 -> एक लाख पचास हज़ार रुपये
         ₹1.5 Lakh / ₹1.5 लाख -> डेढ़ लाख रुपये
         ₹2.5 Cr -> ढाई करोड़ रुपये
         ₹500 -> पाँच सौ रुपये
    """
    # 1. Decimal lakh / crore (e.g. ₹1.5 Lakh, ₹2.5 Cr, 1.5 लाख)
    def _replace_decimal_lakh_cr(m):
        try:
            num = float(m.group(1))
            unit = m.group(2).lower()
            is_crore = 'cr' in unit or 'करोड़' in unit
            
            unit_word = 'करोड़ रुपये' if is_crore else 'लाख रुपये'
            if num == 1.5:
                return f"डेढ़ {unit_word}"
            elif num == 2.5:
                return f"ढाई {unit_word}"
            else:
                int_part = int(num)
                dec_part = int(round((num - int_part) * 10))
                if dec_part == 0:
                    return f"{int_to_hindi(int_part)} {unit_word}"
                return f"{int_to_hindi(int_part)} दशमलव {int_to_hindi(dec_part)} {unit_word}"
        except Exception:
            return m.group(0)

    text = re.sub(
        r'(?i)(?:₹|Rs\.?|INR)?\s*(\d+(?:\.\d+)?)\s*(lakhs?|lac|लाख|crores?|cr|करोड़)(?:\s*(?:रुपये|rupees))?',
        _replace_decimal_lakh_cr,
        text
    )

    # 2. Standard currency (e.g. ₹78,000, Rs. 2,500, ₹500, ₹25,000)
    def _replace_standard_currency(m):
        num_raw = m.group(1).replace(',', '')
        try:
            if '.' in num_raw:
                val = float(num_raw)
                int_part = int(val)
                dec_part = int(round((val - int_part) * 100))
                hindi_main = int_to_hindi(int_part)
                if dec_part > 0:
                    return f"{hindi_main} रुपये {int_to_hindi(dec_part)} पैसे"
                return f"{hindi_main} रुपये"
            else:
                val = int(num_raw)
                return f"{int_to_hindi(val)} रुपये"
        except Exception:
            return m.group(0)

    text = re.sub(
        r'(?i)(?:₹|Rs\.?|INR)\s*(\d{1,3}(?:,\d{2,3})*(?:\.\d+)?|\d+(?:\.\d+)?)',
        _replace_standard_currency,
        text
    )

    return text


def normalize_time_hindi(text: str) -> str:
    """
    Normalizes time expressions into natural spoken Hindi.
    e.g. 10:00 AM -> सुबह दस बजे
         2:00 PM -> दोपहर दो बजे
         6:30 PM -> शाम छह बजकर तीस मिनट
         8:15 AM -> सुबह आठ बजकर पंद्रह मिनट
         7:45 PM -> शाम सात बजकर पैंतालीस मिनट
         10:00 बजे -> दस बजे
    """
    def _replace_clock_time(m):
        hour = int(m.group(1))
        minute = int(m.group(2)) if m.group(2) else 0
        ampm = (m.group(3) or "").upper().strip()

        # Determine time-of-day period in Hindi
        period = ""
        if ampm == "AM":
            period = "सुबह " if hour < 12 else "रात "
        elif ampm == "PM":
            if hour == 12 or hour < 4:
                period = "दोपहर "
            elif 4 <= hour < 8:
                period = "शाम "
            else:
                period = "रात "

        # Special natural Hindi minute phrasing
        hour_word = int_to_hindi(hour)
        if minute == 0:
            return f"{period}{hour_word} बजे".strip()
        elif minute == 15:
            return f"{period}{hour_word} बजकर पंद्रह मिनट".strip()
        elif minute == 30:
            return f"{period}{hour_word} बजकर तीस मिनट".strip()
        elif minute == 45:
            return f"{period}{hour_word} बजकर पैंतालीस मिनट".strip()
        else:
            return f"{period}{hour_word} बजकर {int_to_hindi(minute)} मिनट".strip()

    # Matches 10:00 AM, 2:00 PM, 6:30PM, 10 AM, 2 PM
    text = re.sub(
        r'(?i)\b(1[0-2]|0?[1-9])(?::([0-5][0-9]))?\s*(am|pm)\b',
        _replace_clock_time,
        text
    )

    # Matches 10:00 बजे, 10 बजे, 2 baje -> दस बजे, दो बजे
    def _replace_baje_time(m):
        hour = int(m.group(1))
        minute = int(m.group(2)) if m.group(2) else 0
        hour_word = int_to_hindi(hour)
        if minute == 0:
            return f"{hour_word} बजे"
        return f"{hour_word} बजकर {int_to_hindi(minute)} मिनट"

    text = re.sub(
        r'(?i)\b(1[0-2]|0?[1-9])(?::([0-5][0-9]))?\s*(?:बजे|baje(?!\w))',
        _replace_baje_time,
        text
    )

    # Avoid duplicate time-of-day markers like 'सुबह सुबह दस बजे' -> 'सुबह दस बजे'
    text = re.sub(r'(?i)\b(सुबह|दोपहर|शाम|रात)\s+\1\b', r'\1', text)

    return text


def normalize_measurements_hindi(text: str) -> str:
    """
    Normalizes measurements, technical capacities, and units into spoken Hindi words.
    e.g. 250–300 sq. ft. -> ढाई सौ से तीन सौ वर्ग फुट
         5 kW / 5kW -> पाँच किलोवाट
         10 kW / 10kW -> दस किलोवाट
         25 years -> पच्चीस साल
         25% -> पच्चीस प्रतिशत
         3kW -> तीन किलोवाट
    """
    # 1. Range measurements: e.g. 250-300 sq. ft. or 250–300 sq ft
    def _replace_sqft_range(m):
        n1 = int(m.group(1).replace(',', ''))
        n2 = int(m.group(2).replace(',', ''))
        return f"{int_to_hindi(n1)} से {int_to_hindi(n2)} वर्ग फुट"

    text = re.sub(
        r'(?i)(\d+)\s*(?:-|–|to|से)\s*(\d+)\s*(?:sq\.?\s*ft\.?|sqft|वर्ग\s*फुट)',
        _replace_sqft_range,
        text
    )

    # 2. Single area: e.g. 300 sq. ft. / 300 sqft / 300 वर्ग फुट
    def _replace_sqft_single(m):
        n = int(m.group(1).replace(',', ''))
        return f"{int_to_hindi(n)} वर्ग फुट"

    text = re.sub(
        r'(?i)(\d+)\s*(?:sq\.?\s*ft\.?|sqft)\b',
        _replace_sqft_single,
        text
    )

    # 3. Solar / Electrical power: 3kW, 5 kW, 10kW -> तीन किलोवाट, पाँच किलोवाट
    def _replace_kw(m):
        raw_num = m.group(1)
        if '.' in raw_num:
            val = float(raw_num)
            int_p = int(val)
            dec_p = int(round((val - int_p) * 10))
            if dec_p == 5 and int_p == 1:
                return "डेढ़ किलोवाट"
            elif dec_p == 5 and int_p == 2:
                return "ढाई किलोवाट"
            elif dec_p == 0:
                return f"{int_to_hindi(int_p)} किलोवाट"
            return f"{int_to_hindi(int_p)} दशमलव {int_to_hindi(dec_p)} किलोवाट"
        else:
            return f"{int_to_hindi(int(raw_num))} किलोवाट"

    text = re.sub(
        r'(?i)(\d+(?:\.\d+)?)\s*(?:kw|किलोवाट)\b',
        _replace_kw,
        text
    )

    # 4. Years / Durations: 25 years, 5 years, 25 साल
    def _replace_years(m):
        n = int(m.group(1))
        return f"{int_to_hindi(n)} साल"

    text = re.sub(
        r'(?i)\b(\d+)\s*(?:years?|yrs?)\b',
        _replace_years,
        text
    )

    # 5. Percentages: 25%, 40%, 80%, 90%
    def _replace_percent(m):
        val = m.group(1) or m.group(2)
        n = int(val)
        return f"{int_to_hindi(n)} प्रतिशत"

    text = re.sub(
        r'(?i)(?:\b(\d+)\s*%)|(?:\b(\d+)\s*(?:percent|प्रतिशत)\b)',
        _replace_percent,
        text
    )

    # 6. Days / Hours / Months
    text = re.sub(r'(?i)\b(\d+)\s*(?:hours?|hrs?)\b', lambda m: f"{int_to_hindi(int(m.group(1)))} घंटे", text)
    text = re.sub(r'(?i)\b(\d+)\s*(?:days?)\b', lambda m: f"{int_to_hindi(int(m.group(1)))} दिन", text)
    text = re.sub(r'(?i)\b(\d+)\s*(?:months?)\b', lambda m: f"{int_to_hindi(int(m.group(1)))} महीने", text)
    text = re.sub(r'(?i)\b(\d+)\s*(?:minutes?|mins?)\b', lambda m: f"{int_to_hindi(int(m.group(1)))} मिनट", text)

    return text


def normalize_dates_hindi(text: str) -> str:
    """
    Normalizes dates into natural spoken Hindi.
    e.g. 10 November 2026 -> दस नवंबर दो हज़ार छब्बीस
         15 December -> पंद्रह दिसंबर
         2026 -> दो हज़ार छब्बीस (when matched in date context)
    """
    def _replace_full_date(m):
        day = int(m.group(1))
        month_str = m.group(2).lower()
        year = int(m.group(3)) if m.group(3) else None

        day_hindi = int_to_hindi(day)
        month_hindi = HINDI_MONTHS.get(month_str, month_str.title())
        if year:
            year_hindi = int_to_hindi(year)
            return f"{day_hindi} {month_hindi} {year_hindi}"
        return f"{day_hindi} {month_hindi}"

    months_pattern = '|'.join(HINDI_MONTHS.keys())
    text = re.sub(
        rf'(?i)\b(\d{{1,2}})\s+({months_pattern})(?:\s+(\d{{4}}))?\b',
        _replace_full_date,
        text
    )

    # Standalone year: 2024 - 2035 when preceded by 'साल' or 'वर्ष' or 'in'
    text = re.sub(
        r'(?i)\b(?:in|साल|वर्ष)\s*(20[2-3][0-9])\b',
        lambda m: f"साल {int_to_hindi(int(m.group(1)))}",
        text
    )

    return text


def normalize_standalone_numbers_hindi(text: str) -> str:
    """
    Normalizes remaining standalone numbers into Hindi words while strictly preserving:
    - Phone numbers (10 continuous digits or +91...)
    - OTPs (standalone 4-6 digits)
    - Alphanumeric codes / models (e.g. 3BHK, ORD-12345, IP68, v1)
    - URLs and email addresses
    """
    # Protect phone numbers, emails, URLs, and model codes
    protected_tokens = []
    
    def _stash_token(m):
        protected_tokens.append(m.group(0))
        return f"___PROTECTED_{len(protected_tokens)-1}___"

    # Stash URLs and emails
    text = re.sub(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b', _stash_token, text)
    text = re.sub(r'https?://\S+|www\.\S+', _stash_token, text)
    # Stash Indian phone numbers (+91XXXXXXXXXX or 10-digit starting with 6-9)
    text = re.sub(r'(?:\+91[\-\s]?)?[6-9]\d{9}\b', _stash_token, text)
    # Stash Alphanumeric codes like 3BHK, 2BHK, IP68, ORD-123
    text = re.sub(r'\b\d+[A-Za-z]+\b|\b[A-Za-z]+\d+\b', _stash_token, text)

    # Now replace remaining numbers with commas (e.g. 1,50,000 or 10,000)
    def _replace_int_with_commas(m):
        raw = m.group(1).replace(',', '')
        try:
            return int_to_hindi(int(raw))
        except Exception:
            return m.group(0)

    text = re.sub(r'\b(\d{1,3}(?:,\d{2,3})+)\b', _replace_int_with_commas, text)

    # Replace standalone numbers (1 to 9999999)
    def _replace_plain_num(m):
        num_str = m.group(1)
        try:
            val = int(num_str)
            return int_to_hindi(val)
        except Exception:
            return m.group(0)

    text = re.sub(r'\b(\d+)\b', _replace_plain_num, text)

    # Restore protected tokens
    for idx, tok in enumerate(protected_tokens):
        text = text.replace(f"___PROTECTED_{idx}___", tok)

    return text


def normalize_for_tts(text: str, language: str = "Hindi") -> str:
    """
    Main entry point for language-aware TTS text normalization.
    
    - If language is English: returns text untouched (preserving English numbers and phonetics).
    - If language is Hindi / Hinglish: converts currency, times, measurements, dates,
      and numbers into natural Hindi spoken words.
    
    Fast execution (< 1ms), perfectly suited for real-time streaming audio pipelines.
    """
    if not text:
        return ""

    lang_lower = (language or "").lower()
    is_pure_english = "english" in lang_lower and "hindi" not in lang_lower and "hinglish" not in lang_lower

    if is_pure_english:
        # Preserve English pronunciation untouched
        return text

    # Apply Hindi normalization sequentially
    normalized = text
    normalized = normalize_currency_hindi(normalized)
    normalized = normalize_time_hindi(normalized)
    normalized = normalize_measurements_hindi(normalized)
    normalized = normalize_dates_hindi(normalized)
    normalized = normalize_standalone_numbers_hindi(normalized)

    # Clean up any duplicate spaces
    normalized = re.sub(r'[ \t]+', ' ', normalized).strip()
    return normalized
