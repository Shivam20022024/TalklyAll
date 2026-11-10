import os
import re
import json
import logging
import requests
from starlette.concurrency import run_in_threadpool

logger = logging.getLogger("talkly-prompt-builder")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("BUILDER_OPENAI_MODEL", "gpt-4o-mini")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "google/gemini-2.0-flash-001")

SYSTEM_BUILDER_INSTRUCTIONS = """You are Talkly's Principal AI Voice Agent Architect.
Talkly is an enterprise AI Voice Agent platform built specifically for high-conversion conversational phone calls across India and global markets.

Your task is to take a business's requirements, brief, or SOP and generate a production-ready, ultra-effective Voice Agent configuration.

CRITICAL VOICE AGENT RULES THAT MUST BE ENFORCED IN THE GENERATED PROMPT:
1. RULE 1 (AVOID REPETITION): The AI agent delivers the welcome message once upon phone pickup. If the prospect responds with a short acknowledgement like "Hello", "Haan", "Ji", "Yes", "Okay", or "Bolie", the agent MUST NOT reintroduce itself or restate the company name/purpose. It moves straight into the first question as if the conversation is naturally rolling.
2. RULE 2 (ONE QUESTION AT A TIME): Spoken phone conversations require turn-taking. The agent MUST ask only ONE concise question per turn and pause for the prospect's answer. Never stack multiple questions into one response.
3. RULE 3 (STRICT LANGUAGE LOCK & CONSISTENCY):
   - IF PRIMARY LANGUAGE IS ENGLISH / INDIAN ENGLISH:
     The entire welcome_message, system prompt, questions, objections playbook, and wrap-up MUST be 100% in English!
     The welcome_message MUST be in English: e.g. "Hello {{customer_name}}, this is {agent_name} with {{company_name}} regarding {{offering}}. Do you have a brief moment to chat?"
     IMPORTANT RULE 3 inside the generated prompt MUST explicitly state: "IMPORTANT RULE 3: Converse strictly in English naturally throughout the call, keeping spoken turns concise."
     Do NOT generate any Hindi words, Devanagari characters, or Hinglish for an English agent.
   - IF PRIMARY LANGUAGE IS HINDI / HINGLISH:
     The welcome_message and system prompt must be in natural conversational Hindi/Hinglish.
     The welcome_message MUST be in Hindi/Hinglish: e.g. "नमस्ते {{customer_name}}, मैं {agent_name} हूँ {{company_name}} से। आपके {{offering}} के लिए बात करने के लिए कॉल किया है। क्या अभी 2 मिनट बात करना convenient है?"
     IMPORTANT RULE 3 inside the generated prompt MUST state: "IMPORTANT RULE 3: Converse in natural Hindi/Hinglish, keeping spoken turns concise."
4. CALL-TO-ACTION & WRAP-UP: Guide the prospect toward the primary objective (e.g. booking a demo, scheduling a site visit or consultation, securing a promise to pay). When the objective is agreed, say a warm, polite goodbye and execute the `end_call` function.
5. STORE / SHOP ADDRESS & LOCATION RULES (MANDATORY FOR RETAIL, SHOPS & PHYSICAL BUSINESSES):
   - Use `{{shop_address}}` as the single source of truth for the complete shop address.
   - Use `{{landmark}}` and `{{city}}` only as supporting location information.
   - NEVER invent, shorten, replace, assume, or hardcode an address (such as "DLF Cyber Park" or fictional places).
   - In the Objections Playbook:
     * If customer asks for the shop address or where to visit: instruct the agent to state {{shop_address}} (Landmark: {{landmark}}, City: {{city}}). If the address is missing, direct the customer to contact the store representative at {{contact_number}} instead of guessing.
   - In the Wrap-up / Closing:
     * If encouraging the customer to visit the store, provide {{shop_address}}.
   - Whenever the agent represents a business with a physical shop, retail store, dealership, showroom, clinic, or office, include in "specific_variables":
     * key: "shop_address", label: "Shop Address", placeholder: "Complete shop address"
     * key: "landmark", label: "Landmark", placeholder: "Nearby landmark"
     * key: "city", label: "City", placeholder: "City name"
     * key: "shop_timings", label: "Shop Timings", placeholder: "Opening hours"
     * key: "contact_number", label: "Contact Number", placeholder: "Store contact number"
6. KNOWLEDGE BASE & FACT GROUNDING (CRITICAL FOR ACCURATE LIVE CALL ANSWERS):
   - If Knowledge Base, FAQs, pricing, policies, or specific facts are provided:
     * Extract and format them cleanly under "knowledge_base" in the JSON schema (as a clear Q&A / factual bullet list).
     * Embed a designated "KNOWLEDGE BASE & VERIFIED FACTS" section into BOTH the outbound "prompt" and "inbound_prompt".
     * Add this explicit rule in the prompt: "When the caller asks about pricing, policies, timings, warranty, or company facts, answer concisely (1-2 sentences) using the Knowledge Base above. If an answer is NOT in the Knowledge Base, DO NOT invent or guess; politely say a specialist will verify and share details on WhatsApp."

7. INFORMATION ASSISTANCE VS APPOINTMENT BOOKING (ANTI-LOOPING & NATURAL FLOW):
   - When the prospect asks questions (pricing, subsidies, technical specs, roof space, warranty, weather conditions, or inspection charges), the agent MUST answer factually and concisely in 1-2 sentences.
   - The agent MUST NEVER force or repeat an appointment/booking pitch immediately after every single factual answer.
   - Only transition to booking when the customer expresses readiness or when all inquiries have been answered.
   - In Hindi prompts, express numbers, currency, and measurements naturally in Hindi words (e.g. ₹78,000 as अठहत्तर हज़ार रुपये, 3kW as तीन किलोवाट).
8. AMBIGUOUS NUMBER RECOGNITION (ANTI-ASSUMPTION):
   - If the prospect gives an ambiguous or unclear number (e.g. 'Fox Five', 'forty five') when asked about bills or amounts, NEVER automatically assume eligibility or guess the value. Ask for polite clarification: 'माफ कीजिए, क्या आपका मासिक बिल ₹5,000 है या कुछ और? कृपया राशि स्पष्ट करें।'
9. APPOINTMENT CONFIRMATION VALIDATION:
   - Customer agreement to a slot is not a confirmed booking until backend validation. The agent must verify availability, submit the booking, and confirm the specific time slot with a warm wrap-up.

Return your response strictly as a valid JSON object matching the requested schema.
"""

USER_BUILDER_TEMPLATE = """Generate a complete Voice Agent specification for this company:

--- COMPANY & AGENT BRIEF ---
Agent Name: {agent_name}
Company Name: {company_name}
Industry / Vertical: {industry}
Agent Role / Designation: {agent_designation}
Primary Language: {language}
Voice Persona & Tone: {voice_tone}

Brief / SOP / Knowledge Base:
{sop_or_brief}

Primary Call Objective:
{primary_objective}

Knowledge Base / FAQs / Policies / Facts:
{knowledge_base}

Must-Ask Qualification Questions:
{must_ask_questions}

Key Offerings, Pricing & USPs:
{offerings_and_usps}

Common Objections & How to Handle:
{objections_playbook}

Closing Call-to-Action:
{closing_call_to_action}

--- REQUIRED OUTPUT SCHEMA (JSON) ---
{{
  "template_id": "snake_case_unique_identifier (e.g. solar_energy_sales)",
  "template_name": "Short Display Name (e.g. Solar Consultation Advisor)",
  "description": "1 concise sentence explaining what this voice agent does",
  "welcome_message": "The exact first spoken sentence when customer answers. If Language is English: 'Hello {{customer_name}}, this is {agent_name} with {{company_name}} regarding {{offering}}. Do you have a brief moment to chat?' If Language is Hindi: 'नमस्ते {{customer_name}}, मैं {agent_name} हूँ {{company_name}} से। क्या अभी 2 मिनट बात करना convenient है?'",
  "prompt": "Full outbound system prompt following Talkly's standard structure (Role, Goal, IMPORTANT RULE 1, IMPORTANT RULE 2, IMPORTANT RULE 3 [language lock matching Primary Language], Key Objectives 1 to 6/7, Objections Playbook, Tone Guidelines, Wrap-up & end_call tool).",
  "inbound_welcome_message": "First greeting when customer calls company helpline (in matching language).",
  "inbound_prompt": "Full inbound system prompt matching company's offerings and helpline workflow (in matching language).",
  "default_offering_label": "Label for the offering field (e.g. Solar System Capacity, Vehicle Model, Course Track)",
  "offering_placeholder": "Placeholder text for the offering (e.g. 5kW Rooftop Solar)",
  "knowledge_base": "Curated FAQs, policies, pricing, and key verified facts (Q&A format or bullet points)",
  "suggested_variables": ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}", ...additional vertical variables],
  "specific_variables": [
    {{"key": "variable_name", "label": "Human Label", "placeholder": "Example value"}}
  ]
}}
"""

class PromptBuilderService:
    async def build_custom_agent_prompt(self, brief: dict) -> dict:
        """
        Generates a customized voice agent prompt and greeting using OpenAI / Gemini.
        """
        agent_name = brief.get("agent_name", "Saanvi").strip() or "Saanvi"
        company_name = brief.get("company_name", "Talkly").strip() or "Talkly"
        industry = brief.get("industry", "Custom Sales").strip() or "Custom Sales"
        agent_designation = brief.get("agent_designation", "Consultation Specialist").strip() or "Consultation Specialist"
        language = brief.get("language", "Hindi / Hinglish").strip() or "Hindi / Hinglish"
        voice_tone = brief.get("voice_tone", "Warm, professional, consultative").strip() or "Warm, professional, consultative"

        sop_or_brief = brief.get("sop_or_brief", "").strip() or "Standard consultative outbound qualification."
        knowledge_base = brief.get("knowledge_base", "").strip() or ""
        primary_objective = brief.get("primary_objective", "").strip() or "Qualify prospect interest and schedule a follow-up consultation or demo."

        must_ask = brief.get("must_ask_questions", "")
        if isinstance(must_ask, list):
            must_ask_text = "\n".join([f"- {q}" for q in must_ask if str(q).strip()])
        else:
            must_ask_text = str(must_ask).strip() or "Confirm identity, understand current requirement, qualify timeline and budget."

        # Respect user's explicit language choice
        is_explicit_english = "english" in language.lower()
        if is_explicit_english:
            language = "Indian English"
        elif "hindi" in language.lower():
            language = language

        offerings_and_usps = brief.get("offerings_and_usps", "").strip() or "High quality services, quick turnaround, and dedicated support."
        objections_playbook = brief.get("objections_playbook", "").strip() or "If busy, offer a callback time. If price-conscious, explain flexible options and return on investment."
        closing_cta = brief.get("closing_call_to_action", "").strip() or "Propose two convenient upcoming timeslots for a specialist consultation."

        prompt_content = USER_BUILDER_TEMPLATE.format(
            agent_name=agent_name,
            company_name=company_name,
            industry=industry,
            agent_designation=agent_designation,
            language=language,
            voice_tone=voice_tone,
            sop_or_brief=sop_or_brief,
            knowledge_base=knowledge_base or "General company policies, verified offerings, and service details.",
            primary_objective=primary_objective,
            must_ask_questions=must_ask_text,
            offerings_and_usps=offerings_and_usps,
            objections_playbook=objections_playbook,
            closing_call_to_action=closing_cta
        )

        def _call_llm():
            # 1. Try OpenAI
            if OPENAI_API_KEY:
                try:
                    url = "https://api.openai.com/v1/chat/completions"
                    headers = {
                        "Authorization": f"Bearer {OPENAI_API_KEY}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": OPENAI_MODEL,
                        "messages": [
                            {"role": "system", "content": SYSTEM_BUILDER_INSTRUCTIONS},
                            {"role": "user", "content": prompt_content}
                        ],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.4
                    }
                    res = requests.post(url, headers=headers, json=payload, timeout=40)
                    if res.ok:
                        content = res.json()["choices"][0]["message"]["content"]
                        return json.loads(content)
                    else:
                        logger.warning(f"OpenAI builder failed HTTP {res.status_code}: {res.text}")
                except Exception as ex:
                    logger.warning(f"OpenAI builder error: {ex}")

            # 2. Try OpenRouter (Gemini)
            if OPENROUTER_API_KEY:
                try:
                    url = "https://openrouter.ai/api/v1/chat/completions"
                    headers = {
                        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                        "Content-Type": "application/json"
                    }
                    payload = {
                        "model": OPENROUTER_MODEL,
                        "messages": [
                            {"role": "system", "content": SYSTEM_BUILDER_INSTRUCTIONS},
                            {"role": "user", "content": prompt_content}
                        ],
                        "response_format": {"type": "json_object"},
                        "temperature": 0.4
                    }
                    res = requests.post(url, headers=headers, json=payload, timeout=40)
                    if res.ok:
                        content = res.json()["choices"][0]["message"]["content"]
                        return json.loads(content)
                    else:
                        logger.warning(f"OpenRouter builder failed HTTP {res.status_code}: {res.text}")
                except Exception as ex:
                    logger.warning(f"OpenRouter builder error: {ex}")

            return None

        result = await run_in_threadpool(_call_llm)

        if not result or not isinstance(result, dict) or not result.get("prompt"):
            # Clean programmatic fallback if LLM is unavailable
            safe_slug = re.sub(r"[^a-z0-9_]+", "_", industry.lower()).strip("_") or "custom_agent"
            result = {
                "template_id": f"custom_{safe_slug}",
                "template_name": f"{company_name} - {agent_designation}",
                "description": f"Custom voice agent for {company_name} specializing in {industry}.",
                "welcome_message": f"नमस्ते {{{{customer_name}}}}, मैं {{{{company_name}}}} से {agent_name} बोल रही हूँ। आपके {{{{offering}}}} की इन्क्वायरी के बारे में बात करने के लिए कॉल किया है। क्या अभी बात करना convenient है?",
                "prompt": (
                    f"You are {agent_name}, an experienced {agent_designation} representing {{{{company_name}}}}.\n"
                    f"Your goal is to politely qualify {{{{customer_name}}}} regarding {{{{offering}}}} and {primary_objective}.\n\n"
                    "IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like 'Hello,' 'Yes,' 'Okay,' or 'Haan,' do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective.\n"
                    "IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.\n"
                    "IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language.\n\n"
                    "Key Objectives:\n"
                    f"1. Warm Greeting: Acknowledge speaking with {{{{customer_name}}}} for {{{{offering}}}} in {{{{location}}}}.\n"
                    "2. Direct Qualification (No Identity Re-asking): You already addressed the customer by name in the opening greeting. Once they acknowledge or reply, proceed directly to qualification without asking to confirm their identity.\n"
                    f"3. Qualification: Ask the key questions:\n{must_ask_text}\n"
                    f"4. Value Pitch: Highlight {offerings_and_usps}.\n"
                    f"5. Objection Handling: {objections_playbook}.\n"
                    f"6. Call to Action: {closing_cta}.\n"
                    f"7. Tone: {voice_tone}. Keep answers short (1-2 sentences per turn).\n"
                    "8. Closing: Say a warm goodbye and execute the end_call function."
                ),
                "inbound_welcome_message": f"नमस्ते {{{{customer_name}}}}, {{{{company_name}}}} में कॉल करने के लिए धन्यवाद। मैं {agent_name}, आपकी कैसे मदद कर सकती हूँ?",
                "inbound_prompt": (
                    f"You are {agent_name}, a friendly customer specialist at {{{{company_name}}}} answering an inbound call.\n"
                    "1. Listen carefully to the caller's requirements.\n"
                    f"2. Answer questions concisely about {{{{offering}}}}.\n"
                    f"3. Propose next steps: {closing_cta}.\n"
                    "4. Wrap up with warm goodbye and execute end_call."
                ),
                "default_offering_label": "Product / Service Offering",
                "offering_placeholder": f"e.g. {offerings_and_usps.split(',')[0] if offerings_and_usps else 'Standard Service'}",
                "knowledge_base": knowledge_base or (
                    f"Q: What is the offering? A: {{{{offering}}}}.\n"
                    f"Q: Where is this available? A: {{{{location}}}}.\n"
                    f"Q: How can I get more details? A: Our specialist will share the complete details and brochure."
                ),
                "suggested_variables": ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}", "{{shop_address}}"],
                "specific_variables": [
                    {"key": "shop_address", "label": "Shop Address", "placeholder": "Enter complete shop address"},
                    {"key": "landmark", "label": "Landmark", "placeholder": "Enter nearby landmark"},
                    {"key": "city", "label": "City", "placeholder": "Enter city"},
                    {"key": "shop_timings", "label": "Shop Timings", "placeholder": "e.g. 10 AM - 8 PM"},
                    {"key": "contact_number", "label": "Contact Number", "placeholder": "Shop contact phone"}
                ] if any(w in f"{industry} {sop_or_brief}".lower() for w in ["shop", "store", "retail", "mobile", "showroom", "dealership", "visit", "outlet"]) else []
            }

        # Sanitize specific_variables to remove default system variables and duplicates
        STANDARD_KEYS = {"customer_name", "company_name", "offering", "location", "any_csv_column"}
        raw_specific = result.get("specific_variables") or []
        seen_keys = set()
        cleaned_specific = []
        for sv in raw_specific:
            if not isinstance(sv, dict):
                continue
            k = re.sub(r"[^{}a-zA-Z0-9_]", "", str(sv.get("key", ""))).strip("{}").lower()
            if not k or k in STANDARD_KEYS or k in seen_keys:
                continue
            seen_keys.add(k)
            cleaned_specific.append({
                "key": k,
                "label": sv.get("label") or k.replace("_", " ").title(),
                "placeholder": sv.get("placeholder") or f"e.g. {k}"
            })
        result["specific_variables"] = cleaned_specific

        # Format and ensure knowledge_base exists on result
        kb_val = result.get("knowledge_base") or knowledge_base or ""
        if isinstance(kb_val, list):
            kb_val = "\n".join([str(item) for item in kb_val])
        result["knowledge_base"] = str(kb_val).strip()

        # If knowledge_base exists, ensure prompt embeds the structured knowledge section
        if result["knowledge_base"] and "KNOWLEDGE BASE & VERIFIED FACTS" not in result.get("prompt", ""):
            kb_block = (
                f"\n\n--- KNOWLEDGE BASE & VERIFIED FACTS ---\n"
                f"{result['knowledge_base']}\n\n"
                f"Rule for Caller Questions: Use the Knowledge Base above to answer accurately in 1-2 concise sentences. If an answer is not in this Knowledge Base, do not guess; state that a team member will follow up with verified information."
            )
            if "prompt" in result:
                result["prompt"] += kb_block
            if "inbound_prompt" in result and "KNOWLEDGE BASE & VERIFIED FACTS" not in result.get("inbound_prompt", ""):
                result["inbound_prompt"] += kb_block

        # Normalize template_id
        raw_id = result.get("template_id") or "custom_agent"
        clean_id = re.sub(r"[^a-z0-9_]+", "_", raw_id.lower()).strip("_")
        if not clean_id.startswith("custom_"):
            clean_id = f"custom_{clean_id}"
        result["template_id"] = clean_id

        # Enforce language lock consistency on result
        if "english" in language.lower():
            result["language"] = "Indian English"
            if "prompt" in result:
                result["prompt"] = re.sub(r"(?i)Converse in Hindi/?Hinglish naturally[^\n.]*", "Converse strictly in English naturally, keeping spoken turns concise.", result["prompt"])
                result["prompt"] = re.sub(r"(?i)Converse in the selected language[^\n.]*", "Converse strictly in English naturally, keeping spoken turns concise.", result["prompt"])
        else:
            result["language"] = "Hindi / Hinglish"

        return result

prompt_builder_service = PromptBuilderService()

