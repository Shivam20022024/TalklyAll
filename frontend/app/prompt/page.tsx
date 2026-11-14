'use client'

import { useEffect, useState, useRef } from 'react'
import { Save, CheckCircle2, Phone, PlayCircle, RotateCcw, Trash2, Loader2, Building2, MessageSquareText, BookOpen, Braces } from 'lucide-react'
import AppLayout from '@/components/layout/AppLayout'
import { fetchApi } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import LiveVoicePlayground from '@/components/voice/LiveVoicePlayground'
import { buttonClass } from '@/components/ui/button'
import { Alert } from '@/components/ui/Alert'
import { TemplatePicker } from '@/components/prompt/TemplatePicker'
import { BusinessDetails, VariableDefaults } from '@/components/prompt/BusinessDetails'
import { ConversationFlowPanel, KnowledgePanel } from '@/components/prompt/PromptEditor'
import { VariableReference } from '@/components/prompt/VariableReference'
import { TestCallDialog, StartChoiceDialog, AutoBuildWizard } from '@/components/prompt/PromptDialogs'

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
    welcome_message: "नमस्ते {{customer_name}}, मैं {{company_name}} की तरफ से बोल रहा हूँ। आपके {{offering}} की इन्क्वायरी के बारे में बात करने के लिए कॉल किया है। क्या अभी 2 मिनट बात करना convenient है?",
    prompt: `You are an experienced real estate sales consultant representing {{company_name}}.
Your goal is to politely qualify prospective buyers who expressed interest in {{offering}} and schedule an in-person site visit.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Warm Greeting: Acknowledge the customer's inquiry for {{offering}} in {{location}}.
2. Direct Qualification (No Identity Re-asking): You already addressed {{customer_name}} by name in the opening greeting. When the customer acknowledges or replies, proceed directly to asking their configuration preferences. NEVER ask "am I speaking with {{customer_name}}?".
3. Ask Configuration & Flexibility (Never Reject a Buyer): Ask what configuration they are looking for (e.g. 2BHK, 3BHK, Villa). If the buyer requests a different unit type (e.g. asking for 2BHK when 3BHK was mentioned, or asking for Villa), NEVER say "we only focus on 3BHK" or reject them! Always respond positively: "जी बिल्कुल! हमारे पास 2BHK के भी बेहतरीन ऑप्शन्स उपलब्ध हैं। आपका 2BHK के लिए बजट लगभग कितना रहेगा?" Understand their budget and timeline, and invite them for a site visit or consultation.
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
    welcome_message: "नमस्ते {{customer_name}} जी, मैं {{company_name}} से बोल रही हूँ। आपके {{offering}} के सिलसिले में बात करने के लिए कॉल किया है। क्या अभी बात करने का सही समय है?",
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
  // Presentation-only: when the saved prompt could not be loaded the editor shows the stock template, which
  // must not be mistaken for the saved prompt (and must not be saved over it).
  const [promptLoadFailed, setPromptLoadFailed] = useState(false)

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
    setPromptLoadFailed(false)
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
      setPromptLoadFailed(true)
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

  // ---------------------------------------------------------------------------
  // Presentation. Everything above this line (state, handlers, templates, and
  // the greeting preview) is unchanged; the UI is composed from
  // components/prompt/* which only receive values and call these handlers.
  // ---------------------------------------------------------------------------
  const openAutoBuild = () => {
    setBuilderStep(1)
    setShowAutoBuildWizard(true)
  }
  const isLive = activeLiveIndustry === selectedIndustry
  const statusBadge = isLive
    ? <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[14px] font-semibold text-emerald-700"><CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />Live on calls</span>
    : promptStatus === 'Published'
      ? <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[14px] font-semibold text-blue-700">Published</span>
      : <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-[14px] font-semibold text-amber-800">Draft</span>

  // Which part of the prompt the workspace is showing. Panels stay mounted (just hidden) so nothing is lost when switching.
  const [activeTab, setActiveTab] = useState<'business' | 'flow' | 'knowledge' | 'variables'>('flow')
  const TABS = [
    { key: 'business', label: 'Business Details', Icon: Building2 },
    { key: 'flow', label: 'Conversation Flow', Icon: MessageSquareText },
    { key: 'knowledge', label: 'Knowledge Base', Icon: BookOpen },
    { key: 'variables', label: 'Variables', Icon: Braces },
  ] as const
  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = TABS[(i + step + TABS.length) % TABS.length]
    setActiveTab(next.key)
    document.getElementById(`prompt-tab-${next.key}`)?.focus()
  }
  const headBtn =
    'inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:cursor-not-allowed disabled:opacity-50'
  const toolBtn =
    'inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-3.5 text-[15px] font-semibold text-ds-ink shadow-sm transition-colors hover:bg-ds-surface disabled:cursor-not-allowed disabled:opacity-50'

  return (
    <AppLayout title="AI Prompt">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Prompt Studio</h1>
          <p className="mt-1.5 text-[16px] text-ds-ink-2 sm:text-[17px]">Configure, test, and publish the prompt your AI agent uses on live calls.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          <button onClick={() => setShowLiveVoicePlayground(true)} className={headBtn}>
            <PlayCircle size={18} strokeWidth={1.75} className="text-ds-primary" />Test in Browser
          </button>
          <button onClick={handleOpenTestModal} className={headBtn}>
            <Phone size={18} strokeWidth={1.75} className="text-ds-primary" />Test on Phone
          </button>
        </div>
      </header>

      <TemplatePicker
        presets={CLIENT_TEMPLATES}
        customTemplates={customTemplates}
        selectedIndustry={selectedIndustry}
        activeLiveIndustry={activeLiveIndustry}
        industrySummary={industrySummary}
        onSelect={handleSelectIndustry}
        onDeleteCustom={handleDeleteCustomTemplate}
        onAutoBuild={openAutoBuild}
        onHowItWorks={() => setShowStartChoiceModal(true)}
      />

      {promptLoadFailed && !loadingIndustry && (
        <Alert
          tone="error"
          urgent
          title="Your saved prompt couldn’t be loaded"
          action={
            <button type="button" onClick={() => loadIndustryPrompt(selectedIndustry)} className={buttonClass('outline', 'sm')}>
              Try again
            </button>
          }
        >
          The editor below shows this template’s factory text, not what you saved. Saving and publishing are disabled so it can’t overwrite your saved prompt.
        </Alert>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Prompt editor" className="min-w-0 rounded-2xl border border-ds-line bg-ds-bg shadow-sm">
          {/* Editing toolbar: stays reachable while a long prompt is edited */}
          <div role="region" aria-label="Save and publish" className="sticky top-14 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border-b border-ds-line bg-ds-bg/95 px-4 py-3.5 backdrop-blur sm:px-6">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              <p className="min-w-0 truncate text-[16px] text-ds-ink-2">
                Editing: <span className="text-[18px] font-semibold text-ds-ink" title={currentTemplate.name}>{currentTemplate.name}</span>
              </p>
              {statusBadge}
              {loadingIndustry && <span className="flex items-center gap-1 text-[14px] text-ds-ink-2"><Loader2 size={14} className="animate-spin" />Loading…</span>}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button onClick={handleResetToTemplate} className={toolBtn} title="Reset this template to its factory prompt">
                <RotateCcw size={17} strokeWidth={1.75} />Reset
              </button>
              {selectedIndustry.startsWith('custom_') && (
                <button
                  onClick={(e) => handleDeleteCustomTemplate(selectedIndustry, currentTemplate?.name || 'Custom Agent', e)}
                  className="inline-flex h-11 items-center gap-2 rounded-xl border border-ds-error/30 bg-ds-bg px-4 text-[15px] font-semibold text-ds-error-ink hover:bg-ds-error-soft"
                  title="Delete this custom agent prompt"
                >
                  <Trash2 size={17} strokeWidth={1.75} /><span className="hidden sm:inline">Delete agent</span>
                </button>
              )}
              <button onClick={handleSave} disabled={saving || promptLoadFailed} className={toolBtn}>
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} strokeWidth={1.75} />}
                {saving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                onClick={handlePublish}
                disabled={publishing || promptLoadFailed}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-ds-primary px-4 text-[15px] font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-ds-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {publishing ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} strokeWidth={1.75} />}
                {publishing ? 'Publishing…' : 'Publish'}
              </button>
            </div>
          </div>

          {/* Section navigation */}
          <div role="tablist" aria-label="Prompt sections" className="grid grid-cols-2 gap-2 border-b border-ds-line px-3 py-3 sm:grid-cols-4 sm:px-6">
            {TABS.map(({ key, label, Icon }, i) => {
              const active = activeTab === key
              return (
                <button
                  key={key}
                  id={`prompt-tab-${key}`}
                  role="tab"
                  type="button"
                  aria-selected={active}
                  aria-controls={`prompt-panel-${key}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setActiveTab(key)}
                  onKeyDown={(e) => onTabKey(e, i)}
                  className={`flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-center text-[15px] font-semibold leading-tight transition-colors ${
                    active ? 'bg-blue-50 text-ds-primary ring-1 ring-ds-primary/30' : 'text-ds-ink-2 hover:bg-ds-surface hover:text-ds-ink'
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
                  {label}
                </button>
              )
            })}
          </div>

          <div role="tabpanel" id="prompt-panel-business" aria-labelledby="prompt-tab-business" hidden={activeTab !== 'business'} className="p-4 sm:p-6">
            <BusinessDetails template={currentTemplate} offering={offering} setOffering={setOffering} location={location} setLocation={setLocation} />
          </div>
          <div role="tabpanel" id="prompt-panel-flow" aria-labelledby="prompt-tab-flow" hidden={activeTab !== 'flow'} className="p-4 sm:p-6">
            <ConversationFlowPanel
              selectedIndustry={selectedIndustry}
              activeDirection={activeDirection}
              setActiveDirection={setActiveDirection}
              showLivePreview={showLivePreview}
              setShowLivePreview={setShowLivePreview}
              previewText={computeSimulatedGreeting(activeDirection === 'outbound' ? welcomeMessage : inboundWelcomeMessage)}
              sampleCustomerName={sampleCustomerName}
              sampleCompanyName={sampleCompanyName}
              welcomeMessage={welcomeMessage}
              setWelcomeMessage={setWelcomeMessage}
              inboundWelcomeMessage={inboundWelcomeMessage}
              setInboundWelcomeMessage={setInboundWelcomeMessage}
              promptText={promptText}
              setPromptText={setPromptText}
              inboundPromptText={inboundPromptText}
              setInboundPromptText={setInboundPromptText}
              activeTextareaRef={activeTextareaRef}
            />
          </div>
          <div role="tabpanel" id="prompt-panel-knowledge" aria-labelledby="prompt-tab-knowledge" hidden={activeTab !== 'knowledge'} className="p-4 sm:p-6">
            <KnowledgePanel
              knowledgeBase={knowledgeBase}
              setKnowledgeBase={setKnowledgeBase}
              knowledgeFileInputRef={knowledgeFileInputRef}
              onKnowledgeFile={(e) => handleUploadKnowledgeFile(e, 'studio')}
              uploadingKnowledgeFile={uploadingKnowledgeFile}
            />
          </div>
          <div role="tabpanel" id="prompt-panel-variables" aria-labelledby="prompt-tab-variables" hidden={activeTab !== 'variables'} className="p-4 sm:p-6">
            <VariableDefaults template={currentTemplate} industryVariables={industryVariables} setIndustryVariables={setIndustryVariables} />
          </div>
        </section>

        <aside aria-label="Dynamic variables" className="min-w-0 xl:sticky xl:top-[4.5rem] xl:self-start">
          <VariableReference
            template={currentTemplate}
            onInsert={(tag) => {
              handleInsertVariable(tag)
              setActiveTab('flow')
            }}
          />
        </aside>
      </div>

      <TestCallDialog
        open={showTestModal}
        onClose={() => setShowTestModal(false)}
        templateName={currentTemplate.name}
        offeringPlaceholder={currentTemplate.offering_placeholder}
        onSubmit={handleTestCall}
        testPhone={testPhone}
        setTestPhone={setTestPhone}
        testCustomerName={testCustomerName}
        setTestCustomerName={setTestCustomerName}
        testOffering={testOffering}
        setTestOffering={setTestOffering}
        testLocation={testLocation}
        setTestLocation={setTestLocation}
        testLanguage={testLanguage}
        setTestLanguage={setTestLanguage}
      />

      {/* In-browser LiveKit voice playground (unchanged component) */}
      <LiveVoicePlayground
        isOpen={showLiveVoicePlayground}
        onClose={() => setShowLiveVoicePlayground(false)}
        promptText={promptText}
        welcomeMessage={welcomeMessage}
        industry={selectedIndustry}
      />

      <StartChoiceDialog
        open={showStartChoiceModal}
        onClose={() => setShowStartChoiceModal(false)}
        onAutoBuild={() => {
          setShowStartChoiceModal(false)
          setBuilderStep(1)
          setShowAutoBuildWizard(true)
        }}
        onBrowseTemplates={() => {
          setShowStartChoiceModal(false)
          window.scrollTo({ top: 120, behavior: 'smooth' })
        }}
      />

      <AutoBuildWizard
        open={showAutoBuildWizard}
        onClose={() => {
          if (!generatingAgent) setShowAutoBuildWizard(false)
        }}
        step={builderStep}
        setStep={setBuilderStep}
        generating={generatingAgent}
        progress={generationProgress}
        onGenerate={handleGenerateAutoBuild}
        fallbackCompanyName={user?.company_name || ''}
        knowledgeFileInputRef={wizardKnowledgeFileInputRef}
        onKnowledgeFile={(e) => handleUploadKnowledgeFile(e, 'wizard')}
        uploadingKnowledgeFile={uploadingKnowledgeFile}
        f={{
          agentName: wizardAgentName, setAgentName: setWizardAgentName,
          companyName: wizardCompanyName, setCompanyName: setWizardCompanyName,
          industry: wizardIndustry, setIndustry: setWizardIndustry,
          designation: wizardAgentDesignation, setDesignation: setWizardAgentDesignation,
          language: wizardLanguage, setLanguage: setWizardLanguage,
          voiceTone: wizardVoiceTone, setVoiceTone: setWizardVoiceTone,
          sopText: wizardSopText, setSopText: setWizardSopText,
          primaryObjective: wizardPrimaryObjective, setPrimaryObjective: setWizardPrimaryObjective,
          mustAskQuestions: wizardMustAskQuestions, setMustAskQuestions: setWizardMustAskQuestions,
          offeringsUsps: wizardOfferingsUsps, setOfferingsUsps: setWizardOfferingsUsps,
          objections: wizardObjections, setObjections: setWizardObjections,
          knowledgeBase: wizardKnowledgeBase, setKnowledgeBase: setWizardKnowledgeBase,
          closingCta: wizardClosingCta, setClosingCta: setWizardClosingCta,
        }}
      />
    </AppLayout>
  )
}
