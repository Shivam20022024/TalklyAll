'use client'

import { useEffect, useState, useRef } from 'react'
import {
  Save,
  Play,
  CheckCircle2,
  X,
  Phone,
  Sparkles,
  Building2,
  Stethoscope,
  GraduationCap,
  CreditCard,
  Briefcase,
  Mic,
  Banknote,
  ShoppingBag,
  RotateCcw,
  Copy,
  Eye,
  Settings2,
  HelpCircle,
  Radio,
  Zap,
  LayoutGrid,
  Trash2,
  ArrowRight,
  ArrowLeft,
  Loader2,
  FileText,
  Check,
  Plus,
  Wand2,
  BookOpen,
  Paperclip,
  Upload
} from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import LiveVoicePlayground from '@/components/voice/LiveVoicePlayground'
import FlowBuilder from '@/components/prompt/FlowBuilder'

interface IndustryTemplate {
  id: string
  name: string
  icon: string
  description: string
  default_offering_label: string
  offering_placeholder: string
  welcome_message: string
  prompt: string
  inbound_welcome_message: string
  inbound_prompt: string
  variables: string[]
  specific_variables?: { key: string; label: string; placeholder: string }[]
  knowledge_base?: string
}

const CLIENT_TEMPLATES: Record<string, IndustryTemplate> = {
  real_estate: {
    id: "real_estate",
    name: "Real Estate",
    icon: "Building2",
    description: "Qualify home buyers, check budget & location, schedule site tours.",
    default_offering_label: "Project / Property Name",
    offering_placeholder: "e.g. Green Valley Heights / 3BHK Luxury Apartments",
    welcome_message: "नमस्ते {{customer_name}}, मैं {{company_name}} की तरफ से बोल रहा हूँ। आपके {{offering}} प्रोजेक्ट की इन्क्वायरी के बारे में बात करने के लिए कॉल किया है। क्या अभी 2 मिनट बात करना convenient है?",
    prompt: `You are an experienced real estate sales consultant representing {{company_name}}.
Your goal is to politely qualify prospective buyers who expressed interest in {{offering}} and schedule an in-person site visit.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Warm Greeting: Acknowledge the customer's inquiry for {{offering}} in {{location}}.
2. Direct Qualification (No Identity Re-asking): You already addressed {{customer_name}} by name in the opening greeting. When the customer acknowledges or replies, proceed directly to asking their configuration preferences. NEVER ask "am I speaking with {{customer_name}}?".
3. Ask Configuration: Ask what configuration they are looking for (e.g. 2BHK, 3BHK, Villa).
4. Ask Budget: Ask their budget range {{budget}}.
5. Ask Timeline: Ask their timeline to purchase.
6. Highlight Key Selling Points: Mention location connectivity, luxury amenities, and ongoing spot-booking offers.
7. Schedule Site Visit: Propose a convenient time (e.g., this weekend or tomorrow morning) for a guided site tour.
8. Tone: Polite, consultative, respectful, and persistent without being pushy. Reply naturally in the customer's language (Hindi, English, or Hinglish).`,
    inbound_welcome_message: "नमस्ते {{customer_name}}, {{company_name}} में कॉल करने के लिए धन्यवाद। आप हमारे {{offering}} के बारे में जानकारी के लिए कॉल कर रहे हैं - मैं आपकी कैसे मदद कर सकती हूँ?",
    inbound_prompt: `आप {{company_name}} के लिए एक पेशेवर रियल एस्टेट इनबाउंड कंसल्टेंट हैं। एक संभावित ग्राहक ने आपकी हेल्पलाइन पर कॉल किया है।

महत्वपूर्ण नियम 1 (दोहराव से बचें): आप पहले ही ऊपर एक बार ग्रीटिंग दे चुके हैं। अगर ग्राहक सिर्फ "Hello", "Haan", "Ji" जैसा छोटा जवाब दे, तो दोबारा अपना परिचय या कंपनी का नाम मत दोहराइए - सीधे अगले उद्देश्य पर जाइए, जैसे कि बातचीत पहले से चल रही हो।
महत्वपूर्ण नियम 2 (एक बार में एक सवाल): एक बार में सिर्फ एक सवाल पूछिए, फिर रुककर ग्राहक के जवाब का इंतज़ार कीजिए, उसके बाद ही अगला सवाल पूछिए। एक ही जवाब में कई सवाल मत मिलाइए।
महत्वपूर्ण नियम 3 (भाषा में निरंतरता): जिस भाषा में बातचीत शुरू की है, उसी में जवाब दीजिए, जब तक ग्राहक साफ़ तौर पर और लगातार किसी दूसरी भाषा में बात न करे। ग्राहक का सिर्फ एक छोटा शब्द जैसे "Hello", "Yes", "OK" भाषा बदलने का संकेत नहीं है - जिस भाषा में शुरू किया था, उसी में बात जारी रखिए।

मुख्य उद्देश्य:
1. ध्यान से सुनें: ग्राहक की पूछताछ को ध्यान से सुनें - वे {{offering}} या किसी अन्य प्रॉपर्टी में रुचि ले सकते हैं।
2. पहचान की पुष्टि करें: पूछें कि क्या आप {{customer_name}} से बात कर रहे हैं, अपने शब्दों में, और आगे बढ़ने से पहले स्पष्ट हाँ का इंतज़ार करें।
3. जानकारी दें: लोकेशन, कॉन्फ़िगरेशन (2BHK/3BHK/विला), कीमत रेंज और उपलब्धता के बारे में स्पष्ट और संक्षिप्त जवाब दें।
4. बजट पूछें: उनका बजट रेंज पूछें।
5. लोकेशन पूछें: उनकी पसंदीदा लोकेशन पूछें।
6. साइट विज़िट ऑफर करें: एक सुविधाजनक समय पर साइट विज़िट शेड्यूल करने का सुझाव दें।
7. टोन: विनम्र, सहायक, और ग्राहक की भाषा (हिंदी/इंग्लिश/हिंग्लिश) में स्वाभाविक रूप से जवाब दें।
8. विदाई: संतुष्ट होने पर गर्मजोशी से विदाई लें और end_call फंक्शन को कॉल करें।`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}", "{{budget}}"],
    specific_variables: [
      { key: "budget", label: "Default Budget Range", placeholder: "e.g. ₹75 Lakhs - ₹1.5 Cr" }
    ]
  },
  healthcare: {
    id: "healthcare",
    name: "Healthcare & Clinic",
    icon: "Stethoscope",
    description: "Confirm doctor appointments, clinic timings, and collect visit notes.",
    default_offering_label: "Specialty / Clinic Service",
    offering_placeholder: "e.g. Dental Checkup / Cardiology Consultation",
    welcome_message: "नमस्ते {{customer_name}} जी, मैं {{company_name}} से बोल रही हूँ। आपके {{offering}} के लिए अपॉइंटमेंट के सिलसिले में बात करने के लिए कॉल किया है। क्या अभी बात करने का सही समय है?",
    prompt: `आप {{company_name}} के लिए एक सहानुभूतिपूर्ण, विनम्र और प्रोफेशनल क्लिनिक कोऑर्डिनेटर हैं।
आपका लक्ष्य {{customer_name}} की {{location}} में {{doctor_name}} के साथ {{offering}} के लिए मेडिकल कंसल्टेशन अपॉइंटमेंट बुक या कन्फर्म करने में मदद करना है।

महत्वपूर्ण नियम:
1. दोहराव से बचें: आप ऊपर दिया गया वेलकम मैसेज पहले ही एक बार बोल चुकी हैं। अगर मरीज सिर्फ "हाँ", "Hello", "बोलिए", या "जी" कहे, तो अपना परिचय या कंपनी का नाम दोबारा मत दोहराइए - सीधे अपने अगले सवाल पर बढ़िए।
2. एक बार में सिर्फ एक सवाल: एक टर्न में केवल एक छोटा और स्पष्ट सवाल पूछिए, फिर रुककर मरीज के जवाब का इंतज़ार कीजिए।
3. भाषा और लहज़ा: पूरी तरह शुद्ध, शांत, आदरणीय और स्वाभाविक हिंदी में बात करें। संक्षिप्त (1 से 2 छोटे वाक्य प्रति टर्न) बोलें।

मुख्य उद्देश्य व बातचीत का प्रवाह:
1. वार्म ग्रीटिंग व पहचान की पुष्टि: पूछें कि क्या आप {{customer_name}} जी से बात कर रही हैं, और आगे बढ़ने से पहले स्पष्ट हाँ का इंतज़ार करें।
2. दिन जानें: उनके पसंदीदा कंसल्टेशन दिन (जैसे कल या वीकेंड) के बारे में विनम्रता से पूछें।
3. समय स्लॉट जानें: पसंदीदा टाइम स्लॉट {{preferred_time}} (सुबह या शाम) पूछें।
4. तुरंत कन्फर्मेशन: स्लॉट तय होते ही कहें: "बहुत बढ़िया! {{location}} क्लिनिक में {{doctor_name}} के साथ आपका अपॉइंटमेंट सफलतापूर्वक तय कर दिया गया है। सारी डिटेल्स आपके व्हाट्सएप पर भी भेज दी गई हैं।"
5. विनम्र विदाई व समाप्ति: गर्मजोशी से कहें: "हमसे बात करने के लिए बहुत धन्यवाद, अपना ख्याल रखिए! अलविदा।" और end_call टूल चलाएं।
6. टोन: सहानुभूतिपूर्ण, शांत, सम्मानजनक और मददगार।`,
    inbound_welcome_message: "नमस्ते {{customer_name}} जी, {{company_name}} क्लिनिक हेल्पलाइन में कॉल करने के लिए धन्यवाद। मैं आपकी क्या सहायता कर सकती हूँ?",
    inbound_prompt: `आप {{company_name}} के लिए एक सहानुभूतिपूर्ण क्लिनिक रिसेप्शनिस्ट हैं। एक मरीज या उनके परिवार का सदस्य आपकी डायरेक्ट हेल्पलाइन पर कॉल कर रहा है।

महत्वपूर्ण नियम:
1. दोहराव से बचें: आप ऊपर दिया गया ग्रीटिंग पहले ही बोल चुकी हैं। अगर कॉलर सिर्फ "हाँ", "Hello", या "जी" कहे, तो दोबारा परिचय न दें - सीधे उनकी समस्या सुनें।
2. एक बार में एक सवाल: एक टर्न में एक ही सवाल पूछें।

मुख्य उद्देश्य:
1. ध्यान से सुनें: कॉलर की पूछताछ सुनें - नई अपॉइंटमेंट, मौजूदा अपॉइंटमेंट कन्फर्मेशन, या सामान्य जानकारी।
2. पहचान की पुष्टि: पूछें क्या आप {{customer_name}} जी से बात कर रही हैं।
3. जानकारी दें: {{offering}} की उपलब्धता, क्लिनिक का समय और लोकेशन साझा करें।
4. अपॉइंटमेंट बुक करें: उनका पसंदीदा दिन और समय स्लॉट पूछकर तुरंत कन्फर्म करें।
5. टोन: शांत, सहानुभूतिपूर्ण, संक्षिप्त (1-2 वाक्य प्रति टर्न)।
6. विदाई: गर्मजोशी से समाप्त करें और end_call फंक्शन को कॉल करें।`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}", "{{doctor_name}}", "{{preferred_time}}"],
    specific_variables: [
      { key: "doctor_name", label: "Default Doctor / Specialist", placeholder: "e.g. Dr. Priya Sharma" },
      { key: "preferred_time", label: "Default Slot Timing", placeholder: "e.g. Evening (5 PM - 8 PM)" }
    ]
  },
  edtech: {
    id: "edtech",
    name: "EdTech & Academy",
    icon: "GraduationCap",
    description: "Qualify student goals, program interests, and book free demo sessions.",
    default_offering_label: "Course / Program Name",
    offering_placeholder: "e.g. Full-Stack AI & Data Science Certification",
    welcome_message: "Hi {{customer_name}}, this is {{company_name}} calling regarding your inquiry for our {{offering}} program. Do you have a quick minute to chat?",
    prompt: `You are an enthusiastic educational counselor representing {{company_name}}.
Your goal is to understand {{customer_name}}'s learning background and invite them to an upcoming live demo session for {{offering}}.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Connect: Acknowledge their recent inquiry for the {{offering}} curriculum.
2. Direct Qualification (No Identity Re-asking): You already addressed {{customer_name}} by name in the opening greeting. When the customer acknowledges, replies, or says yes/yeah/haan/yeh, their identity is confirmed. NEVER ask 'am I speaking with {{customer_name}}?' or 'is this {{customer_name}}?'. Proceed directly to Background Discovery.
3. Background Discovery: Ask whether they are currently a college student, working professional, or career switcher ({{current_role}}).
4. Program Value: Highlight industry-led projects, guaranteed placement support, flexible weekend batches ({{batch_time}}), and mentor guidance.
5. Free Demo / Counseling: Invite them to attend a free live workshop or schedule a 1-on-1 career roadmap call this week.
6. Tone: Motivating, encouraging, informative, and professional.`,
    inbound_welcome_message: "Hi {{customer_name}}, thanks for calling {{company_name}}! How can I help you today?",
    inbound_prompt: `You are a friendly admissions counselor for {{company_name}}, answering an inbound call from a prospective student or parent.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the greeting above once. If the caller gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the caller's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the caller clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the caller is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Listen First: Understand what they're calling about - a specific program ({{offering}}), fees, batch timings, or admission process.
2. Confirm Identity: Ask if you're speaking with {{customer_name}}, in your own words, and wait for a clear yes before continuing.
3. Answer Clearly: Give concise, accurate answers in 1-2 short sentences per turn.
4. Qualify Gently: Ask whether they're a student, working professional, or parent inquiring on behalf of someone else.
5. Offer Next Step: Invite them to a free demo class or a 1-on-1 counseling call this week.
6. Tone: Warm, informative, encouraging, and professional.
7. Closing: Once satisfied, say a warm goodbye and invoke the end_call function.`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{batch_time}}", "{{current_role}}"],
    specific_variables: [
      { key: "batch_time", label: "Default Batch Schedule", placeholder: "e.g. Weekend Live Sessions" },
      { key: "current_role", label: "Target Audience Role", placeholder: "e.g. Working Professional / Graduate" }
    ]
  },
  bfsi: {
    id: "bfsi",
    name: "BFSI (Loans & Insurance)",
    icon: "CreditCard",
    description: "Check eligibility for personal/business loans or policies and schedule callbacks.",
    default_offering_label: "Financial Product / Loan Type",
    offering_placeholder: "e.g. Pre-Approved Business Loan / Home Loan",
    welcome_message: "नमस्ते {{customer_name}} जी, मैं {{company_name}} से बात कर रहा हूँ। आपने हमारे {{offering}} के लिए इन्क्वायरी की थी - क्या अभी 2 मिनट बात करने का सही समय है?",
    prompt: `आप {{company_name}} के एक सीनियर और भरोसेमंद फाइनेंशियल एडवाइजर हैं।
आपका मुख्य उद्देश्य उन संभावित ग्राहकों को क्वालिफाई करना है जिन्होंने {{offering}} में रुचि दिखाई है, और एक सीनियर लोन ऑफिसर के साथ डॉक्यूमेंटेशन या सैंक्शन कॉल शेड्यूल करना है।

महत्वपूर्ण नियम:
1. दोहराव से बचें: आप ऊपर दिया गया वेलकम मैसेज पहले ही एक बार बोल चुके हैं। अगर ग्राहक सिर्फ "हाँ", "बोलिए", "Hello", या "Okay" कहे, तो अपना परिचय या कंपनी का नाम दोबारा मत दोहराइए - सीधे अपने अगले सवाल पर बढ़िए।
2. एक बार में सिर्फ एक सवाल: एक टर्न में केवल एक छोटा और स्पष्ट सवाल पूछिए। कभी भी दो सवाल एक साथ मत पूछिए और रुककर ग्राहक के जवाब का इंतज़ार कीजिए।
3. भाषा में निरंतरता: जिस भाषा (हिंदी/हिंग्लिश) में बातचीत शुरू हुई है, उसी में स्वाभाविक रूप से बात करें।

मुख्य बातचीत का प्रवाह:
1. पहचान की पुष्टि: अगर ग्राहक के पहले जवाब में पहचान स्पष्ट न हो, तो विनम्रता से पुष्टि करें: "क्या मेरी बात {{customer_name}} जी से ही हो रही है?" और स्पष्ट "हाँ" का इंतज़ार करें।
2. लोन की आवश्यकता समझें: पूछें कि उन्हें लगभग कितनी राशि की आवश्यकता है (जैसे {{loan_amount}} तक)।
3. रोजगार का प्रकार जानें: पूछें: "क्या आप अभी Salaried हैं या अपना कोई Business/Self-employed काम करते हैं?"
4. अनुमानित मासिक आय: पूछें: "आपकी अनुमानित मंथली टेक-होम इनकम कितनी है?"
5. खास खूबियां बताएं: बताएं कि उनके लिए मिनिमम डॉक्यूमेंटेशन, आकर्षक ब्याज दर, और {{tenure}} तक के आसान ईएमआई ऑप्शन्स उपलब्ध हैं।
6. अगला कदम: पूछें कि क्या आज दोपहर या कल सुबह डॉक्यूमेंटेशन वेरिफिकेशन कॉल के लिए सही समय रहेगा।
7. विदाई और कॉल समाप्त: समय तय होने पर कहें: "बहुत-बहुत धन्यवाद {{customer_name}} जी! हमारी टीम जल्द ही आपसे संपर्क करेगी। आपका दिन शुभ हो! अलविदा।" और end_call टूल को कॉल करें।
8. टोन: शांत, पेशेवर, पारदर्शी और आदरणीय।`,
    inbound_welcome_message: "नमस्ते {{customer_name}} जी, {{company_name}} लोन और फाइनेंशियल सर्विसेज में कॉल करने के लिए धन्यवाद। मैं आपकी कैसे मदद कर सकता हूँ?",
    inbound_prompt: `आप {{company_name}} के लिए एक पेशेवर फाइनेंशियल सर्विसेज कंसल्टेंट हैं। एक ग्राहक ने हेल्पलाइन पर कॉल किया है।

मुख्य उद्देश्य:
1. ध्यान से सुनें: कॉलर की जरूरत समझें - नया लोन, इंश्योरेंस या एप्लीकेशन स्टेटस।
2. पहचान की पुष्टि: पूछें क्या आप {{customer_name}} से बात कर रहे हैं।
3. स्पष्ट जानकारी दें: एलिजिबिलिटी नियम, जरूरी दस्तावेज और ब्याज दरों के बारे में संक्षिप्त उत्तर दें।
4. लोन राशि पूछें: उन्हें कितनी लोन राशि की जरूरत है।
5. अगला कदम: सीनियर एडवाइजर का कॉलबैक या व्हाट्सएप पर कोटेशन भेजने का सुझाव दें।
6. टोन: भरोसेमंद, पेशेवर और विनम्र।
7. विदाई: धन्यवाद देकर end_call टूल को कॉल करें।`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{loan_amount}}", "{{tenure}}"],
    specific_variables: [
      { key: "loan_amount", label: "Default Loan / Cover Amount", placeholder: "e.g. ₹10,00,000" },
      { key: "tenure", label: "Default Tenure Period", placeholder: "e.g. 5 Years (60 Months)" }
    ]
  },
  general_sales: {
    id: "general_sales",
    name: "B2B Sales & Outbound",
    icon: "Briefcase",
    description: "Cold outreach, qualify pain points, and book 15-minute executive walkthroughs.",
    default_offering_label: "Product / Service Solution",
    offering_placeholder: "e.g. AI Workflow Automation Platform",
    welcome_message: "Hi {{customer_name}}, this is {{company_name}} reaching out. I noticed your interest in our {{offering}}. Do you have a brief moment?",
    prompt: `You are an outbound sales development representative (SDR) for {{company_name}}.
Your goal is to understand {{customer_name}}'s needs and interest regarding {{offering}} specifically, and move them toward a clear next step (e.g. a demo, trial, or purchase decision) for {{offering}}.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Questions and Flow to ask in order:
1. Warm Introduction: Acknowledge speaking with {{customer_name}} and confirm if they have a quick minute.
2. Direct Discovery (No Identity Re-asking): You already addressed {{customer_name}} by name in the opening greeting. Once the customer acknowledges or replies, their identity is confirmed. NEVER ask 'am I speaking with {{customer_name}}?'. Proceed directly to Discovery.
3. Discovery: Ask ONE open question about their current situation or needs related to {{offering}} - e.g. what they use today, what matters most to them, or what prompted their interest.
4. Qualification: Based on their answer, ask ONE relevant follow-up question that digs into what matters most to them specifically about {{offering}} and their team size ({{company_size}}).
5. Value Pitch: Highlight 2-3 benefits of {{offering}} that are relevant to what they just told you matters to them.
6. Call to Action: Propose a 15-minute live screen-share demo with your specialist. Offer two concrete upcoming days and ask which works better.
7. Language & Accent: Speak with a natural, polite Indian English accent. If the customer speaks in Hindi or asks for Hindi, converse naturally and fluently in polite Hindi.
8. Tone: Consultative, articulate, respectful, and concise (1 to 2 short sentences per turn).
9. Wrap-up & Auto Hangup: Once they select a day/time, confirm the demo, say a warm goodbye, and execute the end_call function.`,
    inbound_welcome_message: "Hi {{customer_name}}, thanks for calling {{company_name}}. How can I help you today?",
    inbound_prompt: `You are a knowledgeable inbound sales representative for {{company_name}}, answering a call from a prospect or existing customer.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the greeting above once. If the caller gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the caller's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the caller clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the caller is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Listen First: Understand what the caller needs - product information about {{offering}}, pricing, a demo, or support.
2. Confirm Identity: Ask if you're speaking with {{customer_name}}, in your own words, and wait for a clear yes before continuing.
3. Answer Clearly: Give concise, helpful answers (1-2 short sentences per turn).
4. Qualify Gently: If it's a new inquiry, ask ONE relevant question about their situation or use case for {{offering}} specifically.
5. Offer Next Step: Propose a 15-minute demo or connect them with the right specialist.
6. Language & Accent: Speak with a natural, polite Indian English accent, switching to Hindi if the caller does.
7. Closing: Once their question is resolved, say a warm goodbye and invoke the end_call function.`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{company_size}}", "{{industry}}"],
    specific_variables: [
      { key: "company_size", label: "Target Organization Size", placeholder: "e.g. 10 - 50 employees" }
    ]
  },
  collections: {
    id: "collections",
    name: "Collections (Loan & EMI Recovery)",
    icon: "Banknote",
    description: "Remind borrowers of overdue payments, secure a promise to pay, and escalate hardship cases to a human agent.",
    default_offering_label: "Loan / Account Type",
    offering_placeholder: "e.g. Personal Loan EMI / Credit Line",
    welcome_message: "Hello {{customer_name}}, I am calling from {{company_name}} regarding your {{offering}} account. Is this a good time to talk for a couple of minutes?",
    prompt: `You are a collections executive for {{company_name}}, calling {{customer_name}} about an overdue payment on their {{offering}}.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Identity Verification: Before discussing any account or payment details, confirm you are speaking with the account holder. If it is not them, do not disclose any account or payment information - politely ask to be connected or call back later.
2. State the Purpose Clearly: Once verified, clearly state the overdue amount of {{amount_due}} and the due date {{due_date}} for their {{offering}}. Be factual and direct, never vague about why you are calling.
3. Ask for Payment Today: Ask if they are able to make the payment today. If yes, ask if they'd like you to share the available payment options, rather than immediately listing specific channels.
4. Negotiate a Specific Promise to Pay: If they cannot pay today, ask for a specific date and amount they can commit to. A vague "I'll try" or "soon" is not enough - politely ask for a specific day and amount before ending the call.
5. Hardship Handling: If they mention financial hardship (job loss, medical emergency, inability to pay), acknowledge it with empathy, let them know a specialist from the team will personally follow up on their situation, and do not keep negotiating amounts yourself.
6. Tone: Calm, respectful, professional, and non-confrontational at all times - never threatening, even if the customer is upset.
7. Closing: Clearly restate whatever was agreed (payment today, or a specific promised date/amount), thank them, say a polite goodbye, and execute the end_call function.`,
    inbound_welcome_message: "Hello {{customer_name}}, thank you for calling {{company_name}}. How can I help you with your account today?",
    inbound_prompt: `You are a collections support representative for {{company_name}}, answering an inbound call from a borrower about their {{offering}} account.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the greeting above once. If the caller gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the caller's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the caller clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the caller is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Listen First: Understand why they're calling - to make a payment, dispute a charge, ask about their balance, or discuss a hardship situation.
2. Share Account Info Only After Verification: Confirm you are speaking with the account holder before sharing any balance or payment details.
3. Help Them Pay: If they want to make a payment, guide them through the available options clearly.
4. Negotiate a Specific Promise to Pay: If they cannot pay in full, ask for a specific date and amount rather than accepting a vague answer.
5. Hardship Handling: If they mention financial hardship, acknowledge it with empathy and offer to have a specialist follow up - do not keep pushing for a commitment.
6. Tone: Calm, respectful, and non-confrontational at all times.
7. Closing: Confirm whatever was agreed, thank them, say a polite goodbye, and execute the end_call function.`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{amount_due}}", "{{due_date}}"],
    specific_variables: [
      { key: "amount_due", label: "Default Overdue Amount", placeholder: "e.g. ₹15,000" },
      { key: "due_date", label: "Default Overdue Date", placeholder: "e.g. 5th of this month" }
    ]
  },
  ecommerce: {
    id: "ecommerce",
    name: "E-commerce (COD Confirmation)",
    icon: "ShoppingBag",
    description: "Automated COD order verification, shipping address confirmation, delivery reassurance, and instant cancellation to eliminate RTO costs.",
    default_offering_label: "Product / Item Name",
    offering_placeholder: "e.g. Wireless Noise-Cancelling Earbuds / Running Shoes",
    welcome_message: "नमस्ते {{customer_name}}! आपने ₹{{order_amount}} का {{offering}} COD ऑर्डर किया है। क्या मैं इसे कन्फर्म कर दूँ?",
    prompt: `आप {{company_name}} के लिए एक विनम्र और कुशल ई-कॉमर्स ऑर्डर कन्फर्मेशन असिस्टेंट हैं।
आपका मुख्य उद्देश्य ग्राहक द्वारा किए गए कैश ऑन डिलीवरी (COD) ऑर्डर की पुष्टि करना, डिलीवरी एड्रेस वेरिफाई करना, और रिटर्न टू ओरिजिन (RTO) को रोकना है।

ऑर्डर विवरण:
- ग्राहक का नाम: {{customer_name}}
- ऑर्डर किया गया आइटम: {{offering}}
- ऑर्डर राशि (COD Amount): ₹{{order_amount}}
- ऑर्डर आईडी: {{order_id}}
- डिलीवरी पता: {{delivery_address}}

महत्वपूर्ण नियम 1 (दोहराव से बचें): आप ऊपर दिया गया वेलकम मैसेज पहले ही एक बार बोल चुके हैं। अगर ग्राहक सिर्फ "हाँ", "बोलिए", "Hello", "Ji" या "Okay" कहे, तो अपना परिचय या कंपनी का नाम दोबारा मत दोहराइए - सीधे अगले उद्देश्य पर आगे बढ़िए।
महत्वपूर्ण नियम 2 (एक बार में केवल एक सवाल): एक टर्न में सिर्फ एक छोटा, स्पष्ट सवाल पूछें। कभी भी दो सवाल एक साथ मत पूछें और रुककर ग्राहक के जवाब का इंतज़ार करें।
महत्वपूर्ण नियम 3 (संक्षिप्त और स्वाभाविक बोलचाल): प्रति टर्न 1 से 2 छोटे और आसान वाक्य बोलें। प्राकृतिक हिंदी/हिंग्लिश में बात करें।
महत्वपूर्ण नियम 4 (ग्राहक का नाम बार-बार न दोहराएं): बातचीत के दौरान बार-बार ग्राहक का नाम लेने से बचें।

मुख्य बातचीत का प्रवाह (Conversation Flow):
1. ऑर्डर कन्फर्मेशन:
   - यदि ग्राहक "हाँ", "कन्फर्म कर दो", "भेज दीजिए" कहे, तो ऑर्डर को कन्फर्म मानें।
   - यदि ग्राहक पूछे "यह क्या है?" या "किस चीज़ का ऑर्डर है?", तो विनम्रता से बताएं कि उन्होंने ₹{{order_amount}} का {{offering}} ऑर्डर किया है।
2. डिलीवरी एड्रेस वेरिफिकेशन:
   - ऑर्डर कन्फर्म होने के बाद, डिलीवरी एड्रेस की पुष्टि करें: "क्या आपका डिलीवरी एड्रेस {{delivery_address}} सही है, या इसमें कोई बदलाव या लैंडमार्क जोड़ना है?"
   - अगर ग्राहक एड्रेस सही बताए, तो आगे बढ़ें। अगर कोई नया लैंडमार्क या पता बताए, तो उसे नोट करें और कहें "मैंने नया पता नोट कर लिया है।"
3. डिलीवरी समय और कैश/UPI की तैयारी:
   - ग्राहक को सूचित करें: "आपका ऑर्डर अगले 3 से 4 दिनों में डिलीवर हो जाएगा। कृपया डिलीवरी के समय ₹{{order_amount}} कैश या UPI से पेमेंट तैयार रखें।"
4. विनम्र विदाई और कॉल समाप्त:
   - ग्राहक को धन्यवाद दें: "शॉपिंग करने के लिए धन्यवाद! आपका ऑर्डर जल्द ही डिस्पैच हो जाएगा। आपका दिन शुभ हो!"
   - इसके बाद end_call फंक्शन को कॉल करके कॉल समाप्त करें।
5. रद्दीकरण / कैंसिलेशन हैंडलिंग (Cancellation Handling):
   - यदि ग्राहक कहे कि "मुझे नहीं चाहिए", "कैंसल कर दीजिए", "गलती से ऑर्डर हो गया", या "मैंने ऑर्डर नहीं किया":
   - बिना किसी बहस या दबाव के विनम्रता से स्वीकार करें: "कोई बात नहीं, मैंने आपका यह ऑर्डर तुरंत कैंसल कर दिया है। आपको इसके लिए कोई शुल्क नहीं देना होगा। धन्यवाद।"
   - और तुरंत end_call फंक्शन कॉल करें ताकि पार्सल शिप न हो और शिपिंग खर्च बच सके।`,
    inbound_welcome_message: "नमस्ते {{customer_name}}, {{company_name}} कस्टमर सपोर्ट में कॉल करने के लिए धन्यवाद। मैं आपके ऑर्डर ट्रैकिंग या रिटर्न में कैसे मदद कर सकती हूँ?",
    inbound_prompt: `आप {{company_name}} के लिए एक पेशेवर ई-कॉमर्स इनबाउंड कस्टमर सपोर्ट कंसल्टेंट हैं। एक ग्राहक ने हेल्पलाइन पर कॉल किया है।

महत्वपूर्ण नियम 1 (दोहराव से बचें): आप पहले ही ऊपर एक बार वेलकम मैसेज दे चुके हैं। अगर ग्राहक सिर्फ "Hello", "Haan", "Ji" जैसा छोटा जवाब दे, तो दोबारा अपना परिचय मत दोहराइए - सीधे अगले उद्देश्य पर जाइए।
महत्वपूर्ण नियम 2 (एक बार में एक सवाल): एक बार में सिर्फ एक सवाल पूछिए, फिर रुककर ग्राहक के जवाब का इंतज़ार कीजिए।

मुख्य उद्देश्य:
1. ध्यान से सुनें: कॉलर की जरूरत समझें - ऑर्डर ट्रैकिंग (Status), रिटर्न या एक्सचेंज (Return/Exchange pickup), डिलीवरी पता बदलना, या कैंसिलेशन।
2. पहचान की पुष्टि करें: पूछें क्या आप {{customer_name}} से बात कर रहे हैं और उनके ऑर्डर आईडी {{order_id}} की पुष्टि करें।
3. ऑर्डर ट्रैकिंग: यदि वे डिलीवरी स्टेटस पूछें, तो बताएं कि उनका {{offering}} ऑर्डर डिस्पैच हो चुका है और 2 से 3 दिनों में पहुंच जाएगा।
4. रिटर्न पिकअप: यदि वे रिटर्न या एक्सचेंज चाहते हैं, तो पिकअप की पुष्टि करें और बताएं कि कूरियर पार्टनर 48 घंटे में पिकअप के लिए आएगा।
5. कैंसिलेशन: यदि ग्राहक ऑर्डर कैंसल करना चाहता है, तो तुरंत पुष्टि करें कि ऑर्डर कैंसल कर दिया गया है।
6. टोन: शांत, विनम्र, मददगार और संक्षिप्त (1-2 वाक्य प्रति टर्न)।
7. विदाई: धन्यवाद देकर end_call फंक्शन को कॉल करें।`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{order_amount}}", "{{order_id}}", "{{delivery_address}}"],
    specific_variables: [
      { key: "order_amount", label: "Default COD Amount", placeholder: "e.g. ₹2,199" },
      { key: "order_id", label: "Default Order ID", placeholder: "e.g. ORD-98241" },
      { key: "delivery_address", label: "Default Shipping Address", placeholder: "e.g. Flat 402, Sector 62, Noida" }
    ]
  }
}

export default function PromptPage() {
  const { user, refreshUser } = useAuth()
  const [selectedIndustry, setSelectedIndustry] = useState<string>('real_estate')
  const [activeLiveIndustry, setActiveLiveIndustry] = useState<string>('real_estate')
  const [industrySummary, setIndustrySummary] = useState<Record<string, { status: string; offering: string }>>({})

  const [promptText, setPromptText] = useState("")
  const [welcomeMessage, setWelcomeMessage] = useState("")
  const [inboundPromptText, setInboundPromptText] = useState("")
  const [inboundWelcomeMessage, setInboundWelcomeMessage] = useState("")
  const [knowledgeBase, setKnowledgeBase] = useState("")
  const [offering, setOffering] = useState("")
  const [location, setLocation] = useState("")
  const [industryVariables, setIndustryVariables] = useState<Record<string, string>>({})

  const [activeDirection, setActiveDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [promptStatus, setPromptStatus] = useState<string>('Draft')
  const [loadingIndustry, setLoadingIndustry] = useState(false)

  const [showTestModal, setShowTestModal] = useState(false)
  const [showLiveVoicePlayground, setShowLiveVoicePlayground] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testLanguage, setTestLanguage] = useState('Hindi')
  const [testCustomerName, setTestCustomerName] = useState('Rahul')
  const [testOffering, setTestOffering] = useState('')
  const [testLocation, setTestLocation] = useState('')

  const [showLivePreview, setShowLivePreview] = useState(false)
  const activeTextareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Auto Build & Custom Template States (Bolna-inspired Self-Made Agent Creator)
  const [customTemplates, setCustomTemplates] = useState<any[]>([])

  const allTemplates: Record<string, any> = {
    ...CLIENT_TEMPLATES,
    ...customTemplates.reduce((acc, ct) => {
      if (ct?.id) acc[ct.id] = ct
      return acc
    }, {} as Record<string, any>)
  }
  const currentTemplate = allTemplates[selectedIndustry] || CLIENT_TEMPLATES['real_estate']

  const [showStartChoiceModal, setShowStartChoiceModal] = useState(false)
  const [showAutoBuildWizard, setShowAutoBuildWizard] = useState(false)
  const [builderStep, setBuilderStep] = useState<number>(1)
  const [generatingAgent, setGeneratingAgent] = useState(false)
  const [generationProgress, setGenerationProgress] = useState('')

  // Wizard fields
  const [wizardAgentName, setWizardAgentName] = useState('Saanvi')
  const [wizardCompanyName, setWizardCompanyName] = useState('')
  const [wizardIndustry, setWizardIndustry] = useState('')
  const [wizardAgentDesignation, setWizardAgentDesignation] = useState('Consultation Specialist')
  const [wizardLanguage, setWizardLanguage] = useState('Hindi / Hinglish')
  const [wizardVoiceTone, setWizardVoiceTone] = useState('Warm, consultative, professional')
  const [wizardSopText, setWizardSopText] = useState('')
  const [wizardPrimaryObjective, setWizardPrimaryObjective] = useState('')
  const [wizardMustAskQuestions, setWizardMustAskQuestions] = useState('')
  const [wizardOfferingsUsps, setWizardOfferingsUsps] = useState('')
  const [wizardObjections, setWizardObjections] = useState('')
  const [wizardKnowledgeBase, setWizardKnowledgeBase] = useState('')
  const [wizardClosingCta, setWizardClosingCta] = useState('')
  const [uploadingKnowledgeFile, setUploadingKnowledgeFile] = useState(false)
  const knowledgeFileInputRef = useRef<HTMLInputElement | null>(null)
  const wizardKnowledgeFileInputRef = useRef<HTMLInputElement | null>(null)

  const handleUploadKnowledgeFile = async (e: React.ChangeEvent<HTMLInputElement>, target: 'studio' | 'wizard' = 'studio') => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingKnowledgeFile(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetchApi('/api/v1/prompt/parse-knowledge-file', {
        method: 'POST',
        body: formData
      })

      if (res && res.extracted_text) {
        if (target === 'wizard') {
          setWizardKnowledgeBase(prev => prev ? `${prev}\n\n${res.extracted_text}` : res.extracted_text)
        } else {
          setKnowledgeBase(prev => prev ? `${prev}\n\n${res.extracted_text}` : res.extracted_text)
        }
        alert(`✅ Extracted knowledge from "${res.filename}"! Added ${res.character_count.toLocaleString()} characters of verified facts into the Knowledge Base.`)
      }
    } catch (err: any) {
      const msg = typeof err === 'string'
        ? err
        : typeof err?.message === 'string' && err.message !== '[object Object]'
          ? err.message
          : typeof err?.detail === 'string'
            ? err.detail
            : (typeof err?.message === 'object' && err.message !== null)
              ? JSON.stringify(err.message)
              : (typeof err?.detail === 'object' && err.detail !== null)
                ? JSON.stringify(err.detail)
                : (err ? String(err) : 'Error processing document');
      alert(`Failed to parse file: ${msg}`)
    } finally {
      setUploadingKnowledgeFile(false)
      if (e.target) e.target.value = ''
    }
  }

  // Initial load guard ref - only initialize once on mount
  const isInitializedRef = useRef(false)

  useEffect(() => {
    if (isInitializedRef.current) return
    if (!user) return
    isInitializedRef.current = true

    if (user?.company_name && !wizardCompanyName) {
      setWizardCompanyName(user.company_name)
    }

    let targetTemplate: string | null = null

    // 1. Check URL query param first (?template=...)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const t = params.get('template')
      if (t) targetTemplate = t
    }

    // 2. Check localStorage saved template
    if (!targetTemplate && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('talkly_selected_prompt_template')
        if (saved) targetTemplate = saved
      } catch { }
    }

    // 3. Check user.industry (whether standard or custom_)
    if (!targetTemplate && user?.industry) {
      targetTemplate = user.industry
    }

    const finalInd = targetTemplate || 'real_estate'
    setSelectedIndustry(finalInd)
    loadIndustryPrompt(finalInd)
  }, [user])

  const loadIndustryPrompt = async (industryKey: string) => {
    setLoadingIndustry(true)
    setSelectedIndustry(industryKey)
    try {
      const data = await fetchApi(`/api/v1/prompt?industry=${industryKey}`)
      if (data) {
        if (data.custom_templates) {
          setCustomTemplates(data.custom_templates)
        }
        const customDef = (data.custom_templates || []).find((ct: any) => ct.id === industryKey)
        const fallback = customDef || CLIENT_TEMPLATES[industryKey]

        setPromptText(data.prompt || fallback?.prompt || '')
        setWelcomeMessage(data.welcome_message || fallback?.welcome_message || '')
        setInboundPromptText(data.inbound_prompt || fallback?.inbound_prompt || '')
        setInboundWelcomeMessage(data.inbound_welcome_message || fallback?.inbound_welcome_message || '')
        setKnowledgeBase(data.knowledge_base || fallback?.knowledge_base || '')
        setOffering(data.offering || '')
        setLocation(data.location || '')
        setIndustryVariables(data.variables || {})
        setPromptStatus(data.prompt_status || 'Draft')
        if (data.active_company_industry) {
          setActiveLiveIndustry(data.active_company_industry)
        }
        if (data.industry_prompts_summary) {
          setIndustrySummary(data.industry_prompts_summary)
        }
      }
    } catch (e) {
      console.error("Failed to load prompt for industry:", industryKey, e)
      const customDef = customTemplates.find((ct: any) => ct.id === industryKey)
      const fallbackTmpl = customDef || CLIENT_TEMPLATES[industryKey]
      if (fallbackTmpl) {
        setPromptText(fallbackTmpl.prompt)
        setWelcomeMessage(fallbackTmpl.welcome_message)
        setInboundPromptText(fallbackTmpl.inbound_prompt)
        setInboundWelcomeMessage(fallbackTmpl.inbound_welcome_message)
        setKnowledgeBase(fallbackTmpl.knowledge_base || '')
        setPromptStatus('Draft')
      }
    } finally {
      setLoadingIndustry(false)
    }
  }

  const handleSelectIndustry = (key: string) => {
    if (!key) return
    setSelectedIndustry(key)
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('talkly_selected_prompt_template', key)
        const url = new URL(window.location.href)
        url.searchParams.set('template', key)
        window.history.replaceState({}, '', url.toString())
      } catch { }
    }
    loadIndustryPrompt(key)
  }

  const handleGenerateAutoBuild = async () => {
    if (!wizardIndustry && !wizardSopText && !wizardPrimaryObjective) {
      alert('Please provide your business industry or brief to generate the voice agent.')
      return
    }

    setGeneratingAgent(true)
    setGenerationProgress('Analyzing business requirements and tone...')

    try {
      setTimeout(() => setGenerationProgress('Formulating high-converting conversation flow & anti-repetition rules...'), 1400)
      setTimeout(() => setGenerationProgress('Drafting natural Hindi/English welcome message & dynamic tags...'), 2800)

      const payload = {
        agent_name: wizardAgentName.trim() || 'Saanvi',
        company_name: wizardCompanyName.trim() || user?.company_name || 'Talkly',
        industry: wizardIndustry.trim() || 'Custom Business',
        agent_designation: wizardAgentDesignation.trim() || 'Consultation Specialist',
        language: wizardLanguage,
        voice_tone: wizardVoiceTone,
        sop_or_brief: wizardSopText.trim(),
        primary_objective: wizardPrimaryObjective.trim(),
        must_ask_questions: wizardMustAskQuestions.trim(),
        offerings_and_usps: wizardOfferingsUsps.trim(),
        objections_playbook: wizardObjections.trim(),
        knowledge_base: wizardKnowledgeBase.trim(),
        closing_call_to_action: wizardClosingCta.trim(),
        save_immediately: true
      }

      const res = await fetchApi('/api/v1/prompt/auto-build', {
        method: 'POST',
        body: JSON.stringify(payload)
      })

      if (res && res.template) {
        const t = res.template
        // Add to customTemplates state
        setCustomTemplates(prev => {
          const filtered = prev.filter(item => item.id !== t.template_id)
          return [
            ...filtered,
            {
              id: t.template_id,
              name: t.template_name,
              description: t.description,
              icon: 'Sparkles',
              default_offering_label: t.default_offering_label || 'Offering',
              offering_placeholder: t.offering_placeholder || '',
              welcome_message: t.welcome_message,
              prompt: t.prompt,
              inbound_welcome_message: t.inbound_welcome_message,
              inbound_prompt: t.inbound_prompt,
              knowledge_base: t.knowledge_base || wizardKnowledgeBase.trim() || '',
              variables: t.suggested_variables || ["{{company_name}}", "{{customer_name}}", "{{offering}}"],
              specific_variables: t.specific_variables || []
            }
          ]
        })

        // Switch to this new template
        setSelectedIndustry(t.template_id)
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('talkly_selected_prompt_template', t.template_id)
            const url = new URL(window.location.href)
            url.searchParams.set('template', t.template_id)
            window.history.replaceState({}, '', url.toString())
          } catch { }
        }
        setPromptText(t.prompt)
        setWelcomeMessage(t.welcome_message)
        setInboundPromptText(t.inbound_prompt || '')
        setInboundWelcomeMessage(t.inbound_welcome_message || '')
        setKnowledgeBase(t.knowledge_base || wizardKnowledgeBase.trim() || '')
        setOffering(t.offering_placeholder?.replace(/^e\.g\.\s*/i, '') || '')
        setPromptStatus('Draft')
        setShowAutoBuildWizard(false)
        setShowStartChoiceModal(false)

        alert(`🎉 Agent "${t.template_name}" generated successfully! Your custom agent prompt, dynamic variables, and greetings are ready in Prompt Studio.`)
      }
    } catch (e: any) {
      alert(`Auto Build failed: ${e.message || 'Error communicating with AI service'}`)
    } finally {
      setGeneratingAgent(false)
      setGenerationProgress('')
    }
  }

  const handleDeleteCustomTemplate = async (templateId: string, templateName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Are you sure you want to delete the custom template "${templateName}"?`)) return
    try {
      await fetchApi(`/api/v1/prompt/custom-templates/${templateId}`, { method: 'DELETE' })
      setCustomTemplates(prev => prev.filter(t => t.id !== templateId))
      if (selectedIndustry === templateId) {
        handleSelectIndustry('real_estate')
      }
    } catch (e: any) {
      alert(e.message || 'Failed to delete template')
    }
  }

  const handleResetToTemplate = () => {
    const tmpl = allTemplates[selectedIndustry] || CLIENT_TEMPLATES[selectedIndustry]
    if (!tmpl) return
    if (confirm(`Reset the "${tmpl.name}" prompt back to its default high-converting template? This will replace your current edits with the preset.`)) {
      setPromptText(tmpl.prompt)
      setWelcomeMessage(tmpl.welcome_message)
      setInboundPromptText(tmpl.inbound_prompt)
      setInboundWelcomeMessage(tmpl.inbound_welcome_message)
      setKnowledgeBase(tmpl.knowledge_base || '')
      setPromptStatus('Draft')
    }
  }

  const handleInsertVariable = (varTag: string) => {
    if (activeDirection === 'outbound') {
      setWelcomeMessage(prev => prev ? `${prev} ${varTag}` : varTag)
    } else {
      setInboundWelcomeMessage(prev => prev ? `${prev} ${varTag}` : varTag)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetchApi('/api/v1/prompt', {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText,
          welcome_message: welcomeMessage,
          inbound_prompt: inboundPromptText,
          inbound_welcome_message: inboundWelcomeMessage,
          knowledge_base: knowledgeBase,
          industry: selectedIndustry,
          offering: offering,
          location: location,
          variables: industryVariables
        })
      })
      setPromptStatus('Draft')
      alert(`Draft saved successfully for ${currentTemplate?.name || selectedIndustry}!`)
    } catch (e: any) {
      alert(`Failed to save prompt: ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    const tmplName = currentTemplate?.name || selectedIndustry
    if (!confirm(`Publish this ${tmplName} prompt as your live AI agent? Both outbound and inbound calls for your company will immediately use this vertical.`)) return

    setPublishing(true)
    try {
      await fetchApi('/api/v1/prompt/publish', {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText,
          welcome_message: welcomeMessage,
          inbound_prompt: inboundPromptText,
          inbound_welcome_message: inboundWelcomeMessage,
          knowledge_base: knowledgeBase,
          industry: selectedIndustry,
          offering: offering,
          location: location,
          variables: industryVariables
        })
      })
      setPromptStatus('Published')
      setActiveLiveIndustry(selectedIndustry)
      await refreshUser()
      // Ensure current selection is preserved after user refresh
      setSelectedIndustry(selectedIndustry)
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('talkly_selected_prompt_template', selectedIndustry)
        } catch { }
      }
      alert(`Successfully published! Your live AI agent is now active with the ${tmplName} prompt.`)
    } catch (e: any) {
      alert(e.message || 'Failed to publish.')
    } finally {
      setPublishing(false)
    }
  }

  const handleOpenTestModal = () => {
    setTestOffering(offering || '')
    setTestLocation(location || '')
    setShowTestModal(true)
  }

  const handleTestCall = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testPhone) return
    try {
      await fetchApi('/api/v1/calls/trigger', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: testPhone,
          customer_name: testCustomerName.trim() || 'Valued Customer',
          lead_id: 'test-agent-call',
          campaign_language: testLanguage,
          industry: selectedIndustry,
          offering: testOffering.trim(),
          location: testLocation.trim(),
          amount_due: industryVariables.amount_due || '₹15,000',
          due_date: industryVariables.due_date || '10 November 2026',
          custom_fields: industryVariables || {}
        })
      })
      alert(`Test call initiated successfully to ${testPhone}! Pick up to hear your dynamic AI agent.`)
      setShowTestModal(false)
    } catch (e: any) {
      alert(`Failed to initiate test call: ${e.message}`)
    }
  }

  // Live preview helpers
  const sampleCompanyName = user?.company_name || 'Talkly'
  const sampleCustomerName = 'Rahul Sharma'
  const sampleOffering = offering.trim() || currentTemplate?.offering_placeholder?.replace(/^e\.g\.\s*/i, '') || (selectedIndustry === 'ecommerce' ? 'Wireless Earbuds' : selectedIndustry === 'real_estate' ? 'Green Valley Heights' : selectedIndustry === 'healthcare' ? 'Dental Checkup' : selectedIndustry === 'edtech' ? 'AI Certification' : selectedIndustry === 'bfsi' ? 'Personal Loan' : selectedIndustry === 'collections' ? 'Personal Loan EMI' : 'AI Voice Solution')
  const sampleLocation = location.trim() || 'Connaught Place, New Delhi'

  const computeSimulatedGreeting = (raw: string) => {
    let out = raw || ''
    out = out.replace(/\{\{customer_name\}\}|\{customer_name\}/g, sampleCustomerName)
    out = out.replace(/\{\{company_name\}\}|\{company_name\}/g, sampleCompanyName)
    out = out.replace(/\{\{offering\}\}|\{offering\}|\{\{property_name\}\}/g, sampleOffering)
    out = out.replace(/\{\{location\}\}|\{location\}|\{\{property_location\}\}/g, sampleLocation)
    out = out.replace(/\{\{budget\}\}/g, industryVariables.budget || '₹80 Lakhs')
    out = out.replace(/\{\{doctor_name\}\}/g, industryVariables.doctor_name || 'Dr. Priya Sharma')
    out = out.replace(/\{\{preferred_time\}\}/g, industryVariables.preferred_time || 'Tomorrow 5 PM')
    out = out.replace(/\{\{batch_time\}\}/g, industryVariables.batch_time || 'Weekend Batch')
    out = out.replace(/\{\{current_role\}\}/g, industryVariables.current_role || 'Working Professional')
    out = out.replace(/\{\{loan_amount\}\}/g, industryVariables.loan_amount || '₹10,00,000')
    out = out.replace(/\{\{tenure\}\}/g, industryVariables.tenure || '5 Years')
    const rawAmt = industryVariables.amount_due || '₹15,000'
    const cleanAmt = rawAmt.replace(/^₹\s*/, '')
    out = out.replace(/₹\s*\{\{amount_due\}\}/g, `₹${cleanAmt}`)
    out = out.replace(/\{\{amount_due\}\}/g, rawAmt)
    const rawOrderAmt = industryVariables.order_amount || '₹2,199'
    const cleanOrderAmt = rawOrderAmt.replace(/^₹\s*/, '')
    out = out.replace(/₹\s*\{\{order_amount\}\}/g, `₹${cleanOrderAmt}`)
    out = out.replace(/\{\{order_amount\}\}/g, rawOrderAmt)
    out = out.replace(/\{\{order_id\}\}/g, industryVariables.order_id || 'ORD-98241')
    out = out.replace(/\{\{delivery_address\}\}/g, industryVariables.delivery_address || 'Flat 402, Sector 62, Noida')
    out = out.replace(/\{\{due_date\}\}/g, industryVariables.due_date || '10 November 2026')
    out = out.replace(/\{\{company_size\}\}/g, industryVariables.company_size || '25 employees')
    out = out.replace(/\{\{shop_address\}\}/g, industryVariables.shop_address || 'our store')
    out = out.replace(/\{\{landmark\}\}/g, industryVariables.landmark || '')
    out = out.replace(/\{\{city\}\}/g, industryVariables.city || '')
    out = out.replace(/\{\{shop_timings\}\}/g, industryVariables.shop_timings || '')
    out = out.replace(/\{\{contact_number\}\}/g, industryVariables.contact_number || '')
    out = out.replace(/₹\s*₹/g, '₹')
    return out
  }

  return (
    <AppLayout title="AI Prompt">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">Workspace / AI Prompt</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">Prompt Studio</h1>
          <p className="mt-2 text-sm text-muted-foreground">Setup, customize, and publish dynamic AI prompts for all 6 industry verticals.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowLiveVoicePlayground(true)}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-bold shadow-md hover:opacity-90 transition-all cursor-pointer bg-emerald-600 text-white"
          >
            <Mic size={15} /> Test in Browser (LiveKit)
          </button>
          <button onClick={handleOpenTestModal} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-semibold hover:bg-muted transition-all">
            <Play size={15} /> Test on Phone
          </button>
          <button onClick={handleResetToTemplate} className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition-all" title="Reset this vertical to factory template">
            <RotateCcw size={14} /> Reset
          </button>
          {selectedIndustry.startsWith('custom_') && (
            <button
              onClick={(e) => handleDeleteCustomTemplate(selectedIndustry, currentTemplate?.name || 'Custom Agent', e)}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-xs font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 hover:border-red-500/60 shadow-xs transition-all cursor-pointer"
              title="Delete this custom agent prompt"
            >
              <Trash2 size={15} /> Delete Custom Agent
            </button>
          )}
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 transition-all">
            <Save size={15} />{saving ? "Saving..." : "Save Draft"}
          </button>
          <button onClick={handlePublish} disabled={publishing} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50 transition-all">
            <CheckCircle2 size={15} />{publishing ? "Publishing..." : "Publish for Live Calls"}
          </button>
        </div>
      </section>

      {/* Auto Build vs Start from Template Hero Banner (Bolna-inspired) */}
      <section className="mt-6 rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Zap size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-foreground">Custom AI Agent Builder (Auto Build)</h2>
                <span className="rounded-full bg-primary/20 px-2.5 py-0.5 text-[10px] font-black text-primary uppercase tracking-wider">
                  RECOMMENDED
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground max-w-2xl leading-relaxed">
                Have a unique business or SOP? Answer a few quick questions or paste your company brief, and Talkly AI will automatically generate a tailored voice agent with anti-repetition rules, dynamic variables, and custom greetings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setBuilderStep(1)
                setShowAutoBuildWizard(true)
              }}
              className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-md hover:opacity-90 transition-all cursor-pointer"
            >
              <Sparkles size={14} /> Auto Build Custom Agent &rarr;
            </button>
            <button
              type="button"
              onClick={() => setShowStartChoiceModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-foreground hover:bg-muted transition-all cursor-pointer"
            >
              How it works
            </button>
          </div>
        </div>
      </section>

      {/* Industry Selector & Custom Agents Cards */}
      <section className="mt-5 rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-foreground">
                SELECT INDUSTRY PRESET OR YOUR CUSTOM AGENTS
              </h2>
              <p className="text-xs text-muted-foreground">
                Each vertical maintains its own independent prompt, greeting, and dynamic variables.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBuilderStep(1)
                setShowAutoBuildWizard(true)
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 hover:bg-primary/20 px-3 py-1 text-xs font-bold text-primary transition-all cursor-pointer"
            >
              <Plus size={13} /> New Custom Agent
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3">
          {Object.entries(CLIENT_TEMPLATES).map(([key, t]) => {
            const isSelected = selectedIndustry === key
            const isLiveActive = activeLiveIndustry === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectIndustry(key)}
                className={`w-full min-w-0 overflow-hidden flex flex-col justify-between p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${isSelected
                  ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20 z-10'
                  : 'border-border/80 bg-background hover:bg-muted/40 hover:border-primary/50'
                  }`}
              >
                <div className="w-full min-w-0">
                  <div className="flex w-full items-center justify-between gap-1 mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted shrink-0">
                      {key === 'real_estate' && <Building2 size={16} className="text-primary" />}
                      {key === 'healthcare' && <Stethoscope size={16} className="text-emerald-500" />}
                      {key === 'edtech' && <GraduationCap size={16} className="text-blue-500" />}
                      {key === 'bfsi' && <CreditCard size={16} className="text-amber-500" />}
                      {key === 'general_sales' && <Briefcase size={16} className="text-purple-500" />}
                      {key === 'collections' && <Banknote size={16} className="text-rose-500" />}
                      {key === 'ecommerce' && <ShoppingBag size={16} className="text-orange-500" />}
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end min-w-0">
                      {isLiveActive && (
                        <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-xs">
                          Live
                        </span>
                      )}
                      {industrySummary[key]?.status === 'Published' && !isLiveActive && (
                        <span className="shrink-0 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                          Published
                        </span>
                      )}
                    </div>
                  </div>
                  <h3 className="font-extrabold text-xs sm:text-[13px] tracking-tight text-foreground leading-snug line-clamp-2 break-words">
                    {t.name}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                </div>
                <div className="mt-3 pt-2 w-full border-t border-border/50 flex items-center justify-between text-[11px] font-extrabold">
                  <span className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
                    {isSelected ? '✓ Editing Now' : 'Edit Prompt →'}
                  </span>
                </div>
              </button>
            )
          })}

          {/* User's Self-Made Custom Agent Templates */}
          {customTemplates.map((ct) => {
            const isSelected = selectedIndustry === ct.id
            const isLiveActive = activeLiveIndustry === ct.id
            return (
              <div
                key={ct.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectIndustry(ct.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleSelectIndustry(ct.id)
                  }
                }}
                className={`group relative w-full min-w-0 overflow-hidden flex flex-col justify-between p-3.5 rounded-xl border-2 text-left transition-all cursor-pointer ${isSelected
                  ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20 z-10'
                  : 'border-border/80 bg-background hover:bg-muted/40 hover:border-primary/50'
                  }`}
              >
                <div className="w-full min-w-0">
                  <div className="flex w-full items-center justify-between gap-1 mb-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary shrink-0">
                      <Sparkles size={16} />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="shrink-0 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider">
                        Custom
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteCustomTemplate(ct.id, ct.name, e)
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-500/10 p-1 rounded-md transition-colors cursor-pointer"
                        title="Delete this custom template"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-extrabold text-xs sm:text-[13px] tracking-tight text-foreground leading-snug line-clamp-2 break-words" title={ct.name}>
                    {ct.name}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-muted-foreground line-clamp-2 leading-relaxed">
                    {ct.description || 'Custom company agent prompt'}
                  </p>
                </div>
                <div className="mt-3 pt-2 w-full border-t border-border/50 flex items-center justify-between text-[11px] font-extrabold">
                  <span className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
                    {isSelected ? '✓ Editing Now' : 'Edit Prompt →'}
                  </span>
                </div>
              </div>
            )
          })}

          {/* "+ Auto Build Custom Agent" Action Card in Grid */}
          <button
            type="button"
            onClick={() => {
              setBuilderStep(1)
              setShowAutoBuildWizard(true)
            }}
            className="w-full min-w-0 flex flex-col items-center justify-center p-3.5 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary text-center transition-all cursor-pointer group min-h-[140px]"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary group-hover:scale-110 transition-transform mb-2">
              <Plus size={18} />
            </div>
            <span className="font-extrabold text-xs tracking-tight text-foreground">
              + Auto Build Agent
            </span>
            <p className="mt-1 text-[10px] text-muted-foreground leading-tight">
              Create custom agent for your business
            </p>
          </button>
        </div>
      </section>

      {/* Main Workspace Layout */}
      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">

          {/* Dynamic Offering & Variables Quick-Config Card */}
          <section className="rounded-xl border-2 border-primary/30 bg-card p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Settings2 size={18} className="text-primary" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wide">
                  {currentTemplate.name} — Dynamic Variables Defaults
                </h2>
              </div>
              <span className="text-[11px] font-medium text-muted-foreground">
                Injected into <code className="text-primary font-mono">&#123;&#123;offering&#125;&#125;</code> and placeholders
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  {currentTemplate.default_offering_label} <span className="text-primary font-mono text-[11px]">(&#123;&#123;offering&#125;&#125;)</span>
                </label>
                <input
                  type="text"
                  value={offering}
                  onChange={(e) => setOffering(e.target.value)}
                  placeholder={currentTemplate.offering_placeholder}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The primary product, property, course, or service your agent speaks about.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-foreground mb-1">
                  Default Location / Branch <span className="text-primary font-mono text-[11px]">(&#123;&#123;location&#125;&#125;)</span>
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Connaught Place, New Delhi / Sector 62, Noida"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Default office, clinic, or site visit location used if lead has no location.
                </p>
              </div>
            </div>

            {/* Vertical-Specific Extra Variables */}
            {currentTemplate.specific_variables && currentTemplate.specific_variables.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentTemplate.specific_variables
                  .filter((sv, i, arr) => arr.findIndex(x => x.key === sv.key) === i)
                  .map((sv, idx) => (
                    <div key={`${sv.key}-${idx}`}>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        {sv.label} <span className="text-primary font-mono text-[11px]">(&#123;&#123;{sv.key}&#125;&#125;)</span>
                      </label>
                      <input
                        type="text"
                        value={industryVariables[sv.key] || ''}
                        onChange={(e) => setIndustryVariables({ ...industryVariables, [sv.key]: e.target.value })}
                        placeholder={sv.placeholder}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* Prompt & Greeting Editor Card */}
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span>{currentTemplate.name} Prompt Instructions</span>
                  {loadingIndustry && <span className="text-xs text-muted-foreground animate-pulse">Loading...</span>}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">Setup the welcome message and system persona for this vertical.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${promptStatus === 'Published' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
                  <CheckCircle2 size={12} />
                  {activeLiveIndustry === selectedIndustry ? 'Active for Live Calls' : promptStatus === 'Published' ? 'Published' : 'Draft'}
                </span>
                {selectedIndustry.startsWith('custom_') && (
                  <button
                    onClick={(e) => handleDeleteCustomTemplate(selectedIndustry, currentTemplate?.name || 'Custom Agent', e)}
                    className="flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-bold text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-all cursor-pointer"
                    title="Delete this custom agent prompt"
                  >
                    <Trash2 size={12} /> Delete Agent
                  </button>
                )}
              </div>
            </div>

            {/* Outbound / Inbound Direction Tabs */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1">
                <button
                  type="button"
                  onClick={() => setActiveDirection('outbound')}
                  className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${activeDirection === 'outbound' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Outbound Calls (You call them)
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDirection('inbound')}
                  className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all cursor-pointer ${activeDirection === 'inbound' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Inbound Calls (They call you)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowLivePreview(!showLivePreview)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${showLivePreview ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted'}`}
              >
                <Eye size={14} /> {showLivePreview ? 'Hide Live Preview' : 'Show Live Preview'}
              </button>
            </div>

            {/* Live Preview Box if enabled */}
            {showLivePreview && (
              <div className="mt-4 p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-primary">
                  <span className="flex items-center gap-1.5">
                    <Radio size={14} className="animate-pulse text-primary" /> Live Call Simulation (What your prospect will hear)
                  </span>
                  <span className="text-[11px] text-muted-foreground">Sample: {sampleCustomerName} • {sampleCompanyName}</span>
                </div>
                <div className="p-3 rounded-lg bg-card border border-border text-sm font-medium leading-relaxed">
                  <p className="text-xs font-bold text-muted-foreground mb-1 uppercase tracking-wider">AI Agent Speaks:</p>
                  <p className="text-foreground">
                    &ldquo;{computeSimulatedGreeting(activeDirection === 'outbound' ? welcomeMessage : inboundWelcomeMessage)}&rdquo;
                  </p>
                </div>
              </div>
            )}

            {/* Dynamic Insertion Pills */}
            <div className="mt-4 pt-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-muted-foreground">Insert Variable:</span>
                <span className="text-[11px] text-muted-foreground">(Click to append to greeting)</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(() => {
                  const tagList: string[] = ['{{company_name}}', '{{customer_name}}', '{{offering}}', '{{location}}']
                  const rawVars = currentTemplate?.variables
                  if (Array.isArray(rawVars)) {
                    rawVars.forEach((v: any) => {
                      if (typeof v === 'string') tagList.push(v)
                    })
                  } else if (rawVars && typeof rawVars === 'object') {
                    Object.keys(rawVars).forEach((k: string) => {
                      const clean = k.replace(/^\{\{|\}\}$/g, '')
                      tagList.push(`{{${clean}}}`)
                    })
                  }
                  if (Array.isArray(currentTemplate?.specific_variables)) {
                    currentTemplate.specific_variables.forEach((sv: any) => {
                      if (sv?.key) {
                        const clean = sv.key.replace(/^\{\{|\}\}$/g, '')
                        tagList.push(`{{${clean}}}`)
                      }
                    })
                  }
                  return Array.from(new Set(tagList))
                })().map((tag, idx) => (
                  <button
                    key={`${tag}-${idx}`}
                    type="button"
                    onClick={() => handleInsertVariable(tag)}
                    className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs font-mono font-medium text-foreground hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer border border-border/50"
                  >
                    <span>+</span> {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 space-y-6">
              {/* Welcome Message Section */}
              <div>
                <h2 className="text-sm font-bold text-foreground">
                  {activeDirection === 'outbound' ? 'Agent Welcome Message' : 'Inbound Greeting'}
                </h2>
                <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
                  {activeDirection === 'outbound'
                    ? 'The very first sentence your AI agent speaks when the prospect answers.'
                    : 'The opening greeting spoken when a prospect calls your inbound number.'}
                </p>
                <textarea
                  ref={activeTextareaRef}
                  value={activeDirection === 'outbound' ? welcomeMessage : inboundWelcomeMessage}
                  onChange={(e) => activeDirection === 'outbound' ? setWelcomeMessage(e.target.value) : setInboundWelcomeMessage(e.target.value)}
                  className="w-full resize-y rounded-xl border border-border bg-background p-4 text-sm font-mono leading-relaxed outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 min-h-[90px]"
                  placeholder="e.g. नमस्ते {{customer_name}}, मैं {{company_name}} की तरफ से बोल रहा हूँ..."
                />
              </div>

              {/* System Prompt Section */}
              <div className="border-t border-border pt-6">
                <h2 className="text-sm font-bold text-foreground">
                  {activeDirection === 'outbound' ? 'System Prompt Persona & Rules' : 'Inbound System Persona & Rules'}
                </h2>
                <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
                  Master conversation structure, identity checks, and qualification steps for this vertical.
                </p>
                <FlowBuilder
                  key={`${selectedIndustry}-${activeDirection}`}
                  value={activeDirection === 'outbound' ? promptText : inboundPromptText}
                  onChange={(next) => activeDirection === 'outbound' ? setPromptText(next) : setInboundPromptText(next)}
                  placeholderRole={`You are a professional representative for {{company_name}}, handling ${activeDirection === 'outbound' ? 'outbound' : 'inbound'} calls.`}
                />
              </div>

              {/* Agent Knowledge Base Section */}
              <div className="border-t border-border pt-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5">
                  <div>
                    <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                      <BookOpen size={16} className="text-primary" /> Agent Knowledge Base & Verified FAQs
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Company FAQs, pricing, policies, and product details. The AI agent references this during calls to answer caller questions accurately without hallucinating.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={knowledgeFileInputRef}
                      onChange={(e) => handleUploadKnowledgeFile(e, 'studio')}
                      accept=".pdf,.xlsx,.xls,.csv,.txt"
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => knowledgeFileInputRef.current?.click()}
                      disabled={uploadingKnowledgeFile}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 hover:bg-muted px-2.5 py-1 text-xs font-semibold text-foreground transition-all cursor-pointer shadow-sm hover:border-primary/50"
                      title="Upload PDF brochure, Excel pricing/FAQ sheet, or CSV"
                    >
                      {uploadingKnowledgeFile ? (
                        <>
                          <Loader2 size={13} className="animate-spin text-primary" />
                          <span>Extracting...</span>
                        </>
                      ) : (
                        <>
                          <Paperclip size={13} className="text-primary" />
                          <span>Upload PDF / Excel</span>
                        </>
                      )}
                    </button>
                    <span className="self-start sm:self-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                      Active for Live Calls
                    </span>
                  </div>
                </div>
                <textarea
                  value={knowledgeBase}
                  onChange={(e) => setKnowledgeBase(e.target.value)}
                  className="w-full resize-y rounded-xl border border-border bg-background p-4 text-xs font-mono leading-relaxed outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 min-h-[120px]"
                  placeholder={`e.g.\nQ: What is the refund or cancellation policy?\nA: We offer a 100% full refund within 7 days of purchase.\n\nQ: What are the office or store timings?\nA: Monday to Saturday from 9:30 AM to 7:00 PM. Sunday closed.\n\nQ: Are there any hidden fees or charges?\nA: No, all pricing is completely transparent with zero hidden costs.\n\nQ: What documents are required for application?\nA: Only Aadhaar card and latest utility bill.`}
                />
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Write simple Q&A pairs, bullet points, or policies. The agent will speak answers naturally in the call language.</span>
                  <span className="font-mono text-[10px] opacity-75">{knowledgeBase.length} characters</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right Sidebar: Dynamic Variables Reference & How It Works */}
        <div className="space-y-5">
          <section className="rounded-xl border border-border bg-card p-5 h-fit shadow-sm">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Sparkles size={16} className="text-primary" /> Supported Dynamic Tags
            </h2>
            <p className="mt-1 text-xs text-muted-foreground mb-4">
              Auto-substituted from your uploaded CSV, lead record, or company defaults.
            </p>

            <div className="space-y-2.5">
              {(() => {
                const standardKeys = new Set(['{{customer_name}}', '{{company_name}}', '{{offering}}', '{{location}}'])
                const extraTags = (currentTemplate.specific_variables || [])
                  .map(sv => {
                    const cleanKey = sv.key.replace(/^\{\{|\}\}$/g, '')
                    return {
                      tag: `{{${cleanKey}}}`,
                      desc: sv.label
                    }
                  })
                  .filter(item => !standardKeys.has(item.tag))

                const rawList = [
                  { tag: '{{customer_name}}', desc: 'Contact / Lead name' },
                  { tag: '{{company_name}}', desc: 'Your company name' },
                  { tag: '{{offering}}', desc: currentTemplate.default_offering_label },
                  { tag: '{{location}}', desc: 'City, branch, or property location' },
                  ...extraTags,
                  { tag: '{{any_csv_column}}', desc: 'Any extra CSV column (e.g. doctor, date)' }
                ]

                const seen = new Set<string>()
                const uniqueList = rawList.filter(item => {
                  if (seen.has(item.tag)) return false
                  seen.add(item.tag)
                  return true
                })

                return uniqueList.map((v, idx) => (
                  <div key={`${v.tag}-${idx}`} className="flex flex-col gap-0.5 rounded-lg bg-muted/40 p-2.5 border border-border/40">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-primary">{v.tag}</span>
                      <button
                        type="button"
                        onClick={() => handleInsertVariable(v.tag)}
                        className="text-[10px] text-muted-foreground hover:text-primary font-bold cursor-pointer"
                      >
                        + Insert
                      </button>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{v.desc}</span>
                  </div>
                ))
              })()}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 h-fit shadow-sm">
            <h2 className="text-sm font-bold flex items-center gap-1.5 text-foreground">
              <HelpCircle size={15} className="text-primary" /> How Dynamic Variables Work
            </h2>
            <ol className="mt-2.5 space-y-2 text-xs text-muted-foreground list-decimal pl-4 leading-relaxed">
              <li><strong className="text-foreground">Lead / CSV Value:</strong> If an uploaded CSV has an <code className="text-primary">offering</code> or custom column, Talkly uses it first.</li>
              <li><strong className="text-foreground">Vertical Default:</strong> If the lead has no offering, Talkly injects your configured default offering from above.</li>
              <li><strong className="text-foreground">No Cross-Industry Leaks:</strong> Talkly automatically prevents an old EdTech or loan offering from ever appearing in a Real Estate call.</li>
            </ol>
          </section>
        </div>
      </div>

      {/* Test Call Modal with Realistic Dynamic Fields */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl border border-border">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-border">
              <div>
                <h2 className="text-lg font-bold">Test {currentTemplate.name} Agent</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Dispatches a live phone call with dynamic variables</p>
              </div>
              <button onClick={() => setShowTestModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleTestCall} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-bold text-foreground">Your Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 text-muted-foreground" size={14} />
                  <input
                    required
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full rounded-lg border border-border bg-background p-2.5 pl-9 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-foreground">Test Lead Name (Spoken to You)</label>
                <input
                  type="text"
                  value={testCustomerName}
                  onChange={(e) => setTestCustomerName(e.target.value)}
                  placeholder="e.g. Rahul"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-foreground">
                  Test Offering <span className="text-primary font-mono text-[11px]">(&#123;&#123;offering&#125;&#125;)</span>
                </label>
                <input
                  type="text"
                  value={testOffering}
                  onChange={(e) => setTestOffering(e.target.value)}
                  placeholder={currentTemplate.offering_placeholder}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-foreground">
                  Test Location <span className="text-primary font-mono text-[11px]">(&#123;&#123;location&#125;&#125;)</span>
                </label>
                <input
                  type="text"
                  value={testLocation}
                  onChange={(e) => setTestLocation(e.target.value)}
                  placeholder="e.g. Gurgaon / Delhi"
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold text-foreground">Call Voice Language</label>
                <select
                  value={testLanguage}
                  onChange={(e) => setTestLanguage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-medium"
                >
                  <option value="Hindi">Hindi (Urban Indian Accent)</option>
                  <option value="Hinglish">Hinglish (Code-mixed Hindi + English)</option>
                  <option value="English">Indian English</option>
                </select>
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/20 transition-all cursor-pointer">
                  Call Me Now
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* In-Browser LiveKit Voice Playground Modal */}
      <LiveVoicePlayground
        isOpen={showLiveVoicePlayground}
        onClose={() => setShowLiveVoicePlayground(false)}
        promptText={promptText}
        welcomeMessage={welcomeMessage}
        industry={selectedIndustry}
      />

      {/* 1. "How do you want to start?" Choice Modal (Bolna Image 1) */}
      {showStartChoiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => setShowStartChoiceModal(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="text-center pt-2 pb-6">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-primary flex items-center justify-center gap-1.5 mb-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" /> NEW AGENT
              </span>
              <h2 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
                How do you want to start?
              </h2>
              <p className="mt-2 text-xs text-muted-foreground max-w-md mx-auto">
                You can change everything later. This just decides where we begin.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-2">
              {/* Option A: Auto Build */}
              <div
                onClick={() => {
                  setShowStartChoiceModal(false)
                  setBuilderStep(1)
                  setShowAutoBuildWizard(true)
                }}
                className="group relative flex flex-col justify-between p-5 rounded-2xl border-2 border-primary/40 bg-primary/5 hover:border-primary hover:bg-primary/10 transition-all cursor-pointer shadow-sm hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm group-hover:scale-105 transition-transform">
                      <Zap size={20} />
                    </div>
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-foreground">
                      RECOMMENDED
                    </span>
                  </div>
                  <h3 className="text-base font-extrabold text-foreground group-hover:text-primary transition-colors">
                    Auto Build
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Answer a few quick questions or upload a brief, and we'll generate the voice agent for you.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground font-mono">⏱ ~3 min • 📄 Upload optional</span>
                  <span className="font-bold text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Start building &rarr;
                  </span>
                </div>
              </div>

              {/* Option B: Start from Template */}
              <div
                onClick={() => {
                  setShowStartChoiceModal(false)
                  window.scrollTo({ top: 120, behavior: 'smooth' })
                }}
                className="group relative flex flex-col justify-between p-5 rounded-2xl border-2 border-border/80 bg-background hover:border-primary/50 hover:bg-muted/30 transition-all cursor-pointer shadow-sm hover:shadow-md"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground group-hover:scale-105 transition-transform">
                      <LayoutGrid size={20} />
                    </div>
                  </div>
                  <h3 className="text-base font-extrabold text-foreground group-hover:text-primary transition-colors">
                    Start from Template
                  </h3>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    Choose a ready-made template tailored to your workflow and business vertical.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground font-mono">⏱ ~1 min • 📄 6 templates</span>
                  <span className="font-bold text-foreground group-hover:text-primary flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                    Browse templates &rarr;
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowStartChoiceModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground underline transition-colors cursor-pointer"
              >
                No thanks, I'd like to start from scratch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Auto Build Multi-Step Wizard Modal (Bolna Image 2) */}
      {showAutoBuildWizard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <button
              onClick={() => {
                if (!generatingAgent) setShowAutoBuildWizard(false)
              }}
              disabled={generatingAgent}
              className="absolute right-4 top-4 rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Stepper Header */}
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <span className="text-[11px] font-black uppercase tracking-wider text-primary">NEW AGENT • AUTO BUILD</span>
              </div>

              {/* Progress Steps */}
              <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground mb-2">
                <span className={builderStep === 1 ? 'text-primary font-black' : builderStep > 1 ? 'text-foreground' : ''}>
                  (1) Identity
                </span>
                <span className="opacity-40">&gt;</span>
                <span className={builderStep === 2 ? 'text-primary font-black' : builderStep > 2 ? 'text-foreground' : ''}>
                  (2) Conversation
                </span>
                <span className="opacity-40">&gt;</span>
                <span className={builderStep === 3 ? 'text-primary font-black' : ''}>
                  (3) Closing
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: builderStep === 1 ? '33%' : builderStep === 2 ? '66%' : '100%' }}
                />
              </div>

              <div className="mt-4">
                <h2 className="text-xl font-black text-foreground">
                  {builderStep === 1 && "Who is your agent?"}
                  {builderStep === 2 && "What is your agent's conversation flow?"}
                  {builderStep === 3 && "Closing & call wrap-up"}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {builderStep === 1 && "Tell us about the agent, its voice, and tone. Or upload a brief and we'll fill it in."}
                  {builderStep === 2 && "Define the key qualification questions, offerings, and common objections."}
                  {builderStep === 3 && "Set the call-to-action, first greeting style, and generate your production voice agent."}
                </p>
              </div>
            </div>

            {generatingAgent ? (
              <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sparkles size={32} className="animate-spin" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-foreground">Generating Your Custom Voice Agent</h3>
                  <p className="mt-1 text-xs text-muted-foreground font-mono animate-pulse">
                    {generationProgress || 'Crafting prompt architecture...'}
                  </p>
                </div>
                <div className="max-w-xs text-[11px] text-muted-foreground/80">
                  Applying Talkly's anti-repetition rules, one-question pacing, and dynamic lead variable bindings.
                </div>
              </div>
            ) : (
              <div>
                {/* STEP 1: IDENTITY */}
                {builderStep === 1 && (
                  <div className="space-y-4">
                    {/* Quick-Fill Blueprint Presets */}
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-black text-primary uppercase tracking-wider flex items-center gap-1.5">
                          <Sparkles size={12} className="text-primary" /> 1-Click Blueprints (Quick Fill):
                        </span>
                        <span className="text-[10px] text-muted-foreground font-semibold">Click to auto-fill all 3 steps</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setWizardAgentName('Priya')
                            setWizardCompanyName('Apollo Clinic')
                            setWizardIndustry('Healthcare & Clinic')
                            setWizardAgentDesignation('Appointment Coordinator')
                            setWizardLanguage('Hindi / Hinglish')
                            setWizardVoiceTone('Empathetic, calm, respectful')
                            setWizardSopText('Doctor Appointment Reminder Call: Call patient to confirm their scheduled doctor appointment tomorrow at 11 AM with Dr. Mehta. If patient says "हाँ, पर थोड़ा लेट हो सकता हूँ" (Yes, but might be a little late), politely acknowledge and reassure that clinic will hold the slot for 15 minutes. If they confirm on time, advise reaching 15 mins early with previous prescription/reports. If reschedule, ask for alternate day. If cancel, politely cancel without pressure.')
                            setWizardPrimaryObjective('कल के डॉक्टर अपॉइंटमेंट की पुष्टि करना, संभावित देरी (लेट होना) को नोट करना, और आवश्यक होने पर रीशेड्यूल करना।')
                            setWizardMustAskQuestions('1. क्या आप कल सुबह 11 बजे डॉ. मेहता के अपॉइंटमेंट के लिए आ रहे हैं?\n2. क्या आपको क्लीनिक की लोकेशन या पते की जानकारी चाहिए?')
                            setWizardOfferingsUsps('डॉ. मेहता (सीनियर फिजिशियन), आधुनिक क्लीनिक सुविधाएं, ऑन-टाइम कंसल्टेशन।')
                            setWizardObjections('यदि मरीज कहे कि थोड़ा लेट हो जाएगा -> विनम्रता से आश्वस्त करें कि 15 मिनट स्लॉट होल्ड रहेगा।\nयदि रीशेड्यूल करना चाहे -> परसों या वीकेंड का समय पूछें।\nयदि कैंसल करना चाहे -> विनम्रता से कैंसल करें और डॉक्टर का स्लॉट फ्री करें।')
                            setWizardClosingCta('समय की पुष्टि करें, 15 मिनट पहले रिपोर्ट्स के साथ आने की सलाह दें, धन्यवाद कहें और कॉल समाप्त करें।')
                          }}
                          className="rounded-lg border border-primary/50 bg-primary/20 px-3 py-1.5 text-xs font-extrabold text-primary hover:bg-primary/30 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          🩺 Doctor Appointment Reminder
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setWizardAgentName('Kavya')
                            setWizardCompanyName('Snapdeal Fashion')
                            setWizardIndustry('E-commerce & D2C')
                            setWizardAgentDesignation('Order Verification Executive')
                            setWizardLanguage('Hindi / Hinglish')
                            setWizardVoiceTone('Warm, consultative, professional')
                            setWizardSopText('E-commerce Cash-on-Delivery (COD) Order Confirmation: Confirm customer order for ₹2,199, verify delivery address and landmark, remind about 3-4 day delivery with cash/UPI readiness, and cancel immediately if customer ordered by mistake.')
                            setWizardPrimaryObjective('COD ऑर्डर की पुष्टि करना, डिलीवरी एड्रेस वेरिफाई करना, और RTO रोकना।')
                            setWizardMustAskQuestions('1. क्या मैं आपका ₹2,199 का COD ऑर्डर कन्फर्म कर दूँ?\n2. क्या आपका डिलीवरी एड्रेस और पिनकोड सही है?')
                            setWizardOfferingsUsps('फास्ट 3-4 दिन डिलीवरी, फ्री शिपिंग, आसान कैश व UPI पेमेंट।')
                            setWizardObjections('यदि कैंसल करना चाहे -> तुरंत बिना बहस के कैंसल करें ताकि पार्सल डिस्पैच न हो।\nयदि डिलीवरी समय पूछे -> बताएं 3-4 दिनों में कूरियर पहुंचेगा।')
                            setWizardClosingCta('ऑर्डर डिस्पैच की पुष्टि करें, कैश/UPI तैयार रखने का आग्रह करें, धन्यवाद कहें और कॉल समाप्त करें।')
                          }}
                          className="rounded-lg border border-border bg-muted/60 px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          📦 COD Confirmation
                        </button>
                      </div>
                    </div>

                    {/* SOP / Brief paste card */}
                    <div className="rounded-xl border border-dashed border-primary/40 bg-primary/5 p-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <FileText size={16} className="text-primary" />
                        <span className="text-xs font-bold text-foreground">Have a brief, brochure, or SOP?</span>
                        <span className="text-[10px] text-muted-foreground font-semibold">(Optional)</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mb-2">
                        Paste any text, product catalog, sales pitch, or training instructions. Our AI will extract all details automatically.
                      </p>
                      <textarea
                        value={wizardSopText}
                        onChange={(e) => setWizardSopText(e.target.value)}
                        placeholder="e.g. We are Tata Solar. We offer 3kW-10kW residential solar panel installations across Pune & Mumbai with 40% PM Surya Ghar subsidy. Need to confirm homeowner status and monthly electricity bill > ₹2,500..."
                        rows={3}
                        className="w-full rounded-lg border border-border bg-background p-3 text-xs outline-none focus:border-primary font-mono"
                      />
                    </div>

                    <div className="relative flex py-1 items-center">
                      <div className="flex-grow border-t border-border"></div>
                      <span className="flex-shrink mx-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                        OR FILL IN MANUALLY
                      </span>
                      <div className="flex-grow border-t border-border"></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">Agent Spoken Name *</label>
                        <input
                          type="text"
                          value={wizardAgentName}
                          onChange={(e) => setWizardAgentName(e.target.value)}
                          placeholder="e.g. Saanvi / Priya / Rahul"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">Company / Brand Name *</label>
                        <input
                          type="text"
                          value={wizardCompanyName}
                          onChange={(e) => setWizardCompanyName(e.target.value)}
                          placeholder="e.g. Tata Power Solar / My Clinic"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">Industry / Vertical *</label>
                        <input
                          type="text"
                          value={wizardIndustry}
                          onChange={(e) => setWizardIndustry(e.target.value)}
                          placeholder="e.g. Renewable Solar Energy, Logistics, Clinic, Car Dealership"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">Agent Designation / Role *</label>
                        <input
                          type="text"
                          value={wizardAgentDesignation}
                          onChange={(e) => setWizardAgentDesignation(e.target.value)}
                          placeholder="e.g. Solar Consultation Specialist, Admissions Advisor"
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">Spoken Language</label>
                        <select
                          value={wizardLanguage}
                          onChange={(e) => setWizardLanguage(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                        >
                          <option value="Hindi / Hinglish">Hindi / Hinglish (Code-mixed Natural Indian)</option>
                          <option value="Indian English">Indian English (Professional & Fluent)</option>
                          <option value="Pure Hindi">Pure Hindi (Polite & Traditional)</option>
                          <option value="Tamil">Tamil (Urban Native)</option>
                          <option value="Telugu">Telugu (Urban Native)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">Voice Personality & Tone</label>
                        <select
                          value={wizardVoiceTone}
                          onChange={(e) => setWizardVoiceTone(e.target.value)}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                        >
                          <option value="Warm, consultative, professional">Warm, Consultative & Professional</option>
                          <option value="Confident, persuasive, energetic">Confident, Persuasive & Energetic (Sales)</option>
                          <option value="Empathetic, calm, respectful">Empathetic, Calm & Respectful (Support/Clinic)</option>
                          <option value="Direct, concise, firm">Direct & Polite (Finance / Collections)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* STEP 2: CONVERSATION & GOALS */}
                {builderStep === 2 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        Primary Call Objective *
                      </label>
                      <input
                        type="text"
                        value={wizardPrimaryObjective}
                        onChange={(e) => setWizardPrimaryObjective(e.target.value)}
                        placeholder="e.g. Qualify roof ownership and electricity bill, then book a free site survey."
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">What must this call achieve before concluding?</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        Must-Ask Qualification Questions *
                      </label>
                      <textarea
                        value={wizardMustAskQuestions}
                        onChange={(e) => setWizardMustAskQuestions(e.target.value)}
                        placeholder="e.g.&#10;1. Do you own an independent house or rooftop?&#10;2. What is your average monthly electricity bill?&#10;3. Which city/area is the property located in?"
                        rows={3}
                        className="w-full rounded-lg border border-border bg-background p-3 text-xs outline-none focus:border-primary font-mono"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">The AI agent will ask these questions one-by-one to qualify the lead.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">
                          Key Offerings, Pricing & USPs
                        </label>
                        <textarea
                          value={wizardOfferingsUsps}
                          onChange={(e) => setWizardOfferingsUsps(e.target.value)}
                          placeholder="e.g. 40% government subsidy, ₹0 upfront financing, 25-year warranty, saves 90% bills."
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background p-2.5 text-xs outline-none focus:border-primary"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-foreground mb-1">
                          Common Objections & Playbook
                        </label>
                        <textarea
                          value={wizardObjections}
                          onChange={(e) => setWizardObjections(e.target.value)}
                          placeholder="e.g. If customer says too expensive -> explain ₹0 down payment EMI is lower than electricity bill. If busy -> offer callback tomorrow."
                          rows={3}
                          className="w-full rounded-lg border border-border bg-background p-2.5 text-xs outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-bold text-foreground">
                          Knowledge Base & Verified FAQs (Optional)
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            ref={wizardKnowledgeFileInputRef}
                            onChange={(e) => handleUploadKnowledgeFile(e, 'wizard')}
                            accept=".pdf,.xlsx,.xls,.csv,.txt"
                            className="hidden"
                          />
                          <button
                            type="button"
                            onClick={() => wizardKnowledgeFileInputRef.current?.click()}
                            disabled={uploadingKnowledgeFile}
                            className="inline-flex items-center gap-1 rounded border border-border bg-background hover:bg-muted px-2 py-0.5 text-[11px] font-semibold text-primary transition-all cursor-pointer"
                            title="Upload PDF or Excel document"
                          >
                            {uploadingKnowledgeFile ? (
                              <>
                                <Loader2 size={11} className="animate-spin" />
                                <span>Reading...</span>
                              </>
                            ) : (
                              <>
                                <Paperclip size={11} />
                                <span>Upload PDF / Excel</span>
                              </>
                            )}
                          </button>
                          <span className="text-[10px] text-primary font-semibold hidden sm:flex items-center gap-1">
                            <Sparkles size={11} /> Grounded facts & policies
                          </span>
                        </div>
                      </div>
                      <textarea
                        value={wizardKnowledgeBase}
                        onChange={(e) => setWizardKnowledgeBase(e.target.value)}
                        placeholder="Paste FAQs, product specs, pricing, warranties, or refund policies. The agent will use this knowledge to answer customer questions factually during live calls.&#10;&#10;e.g.&#10;Q: What is the refund policy? A: Full refund within 7 days.&#10;Q: How much is the installation fee? A: Zero installation charges with subsidy.&#10;Q: What documents are required? A: Electricity bill and property ID."
                        rows={3}
                        className="w-full rounded-lg border border-border bg-background p-2.5 text-xs outline-none focus:border-primary font-mono"
                      />
                      <p className="mt-1 text-[11px] text-muted-foreground">The AI will use these verified facts to answer caller questions without hallucinating.</p>
                    </div>
                  </div>
                )}

                {/* STEP 3: CLOSING & NEXT STEPS */}
                {builderStep === 3 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-foreground mb-1">
                        Closing Call-to-Action & Agreement *
                      </label>
                      <input
                        type="text"
                        value={wizardClosingCta}
                        onChange={(e) => setWizardClosingCta(e.target.value)}
                        placeholder="e.g. Propose two timeslots for a free site visit this weekend, confirm time, say goodbye, and invoke end_call."
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary font-medium"
                      />
                    </div>

                    {/* Agent Architecture Summary Card */}
                    <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-primary">AGENT BLUEPRINT SUMMARY</span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-muted-foreground font-semibold">Agent:</span> <span className="font-bold">{wizardAgentName} ({wizardAgentDesignation})</span></div>
                        <div><span className="text-muted-foreground font-semibold">Company:</span> <span className="font-bold">{wizardCompanyName || user?.company_name || 'Talkly'}</span></div>
                        <div><span className="text-muted-foreground font-semibold">Industry:</span> <span className="font-bold">{wizardIndustry || 'Custom'}</span></div>
                        <div><span className="text-muted-foreground font-semibold">Language:</span> <span className="font-bold">{wizardLanguage}</span></div>
                      </div>
                      <div className="text-xs pt-1 border-t border-border/50">
                        <span className="text-muted-foreground font-semibold">Goal:</span> <span className="font-bold">{wizardPrimaryObjective || 'Consultative qualification'}</span>
                      </div>
                      {wizardKnowledgeBase.trim() && (
                        <div className="text-xs pt-1 border-t border-border/50 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                          <CheckCircle2 size={13} />
                          <span>Knowledge Base attached ({wizardKnowledgeBase.trim().split('\n').filter(Boolean).length} entries)</span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-2">
                      <CheckCircle2 size={16} className="shrink-0" />
                      <span>Ready to generate! Talkly AI will formulate your outbound greeting, anti-repetition rules, dynamic variables, and system prompt.</span>
                    </div>
                  </div>
                )}

                {/* Navigation Footer */}
                <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setBuilderStep(prev => Math.max(1, prev - 1))}
                    disabled={builderStep === 1}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-30 disabled:pointer-events-none transition-all cursor-pointer"
                  >
                    <ArrowLeft size={14} /> Back
                  </button>

                  {builderStep < 3 ? (
                    <button
                      type="button"
                      onClick={() => setBuilderStep(prev => Math.min(3, prev + 1))}
                      className="flex items-center gap-1.5 rounded-lg bg-foreground text-background px-4 py-2 text-xs font-bold hover:opacity-90 transition-all cursor-pointer shadow-sm"
                    >
                      Continue <ArrowRight size={14} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleGenerateAutoBuild}
                      className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:opacity-90 shadow-lg shadow-primary/25 transition-all cursor-pointer"
                    >
                      <Sparkles size={15} /> Generate Custom Voice Agent
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
