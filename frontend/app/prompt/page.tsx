'use client'

import { useEffect, useState } from 'react'
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
  Banknote
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
  welcome_message: string
  prompt: string
  inbound_welcome_message: string
  inbound_prompt: string
  variables: string[]
}

const CLIENT_TEMPLATES: Record<string, IndustryTemplate> = {
  real_estate: {
    id: "real_estate",
    name: "Real Estate",
    icon: "Building2",
    description: "Qualify home buyers, check budget & location, schedule site tours.",
    default_offering_label: "Project / Property Name",
    welcome_message: "नमस्ते {{customer_name}}, मैं {{company_name}} की तरफ से बोल रहा हूँ। आपके {{offering}} प्रोजेक्ट की इन्क्वायरी के बारे में बात करने के लिए कॉल किया है। क्या अभी 2 मिनट बात करना convenient है?",
    prompt: `You are an experienced real estate sales consultant representing {{company_name}}.
Your goal is to politely qualify prospective buyers who expressed interest in {{offering}} and schedule an in-person site visit.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Warm Greeting: Acknowledge the customer's inquiry for {{offering}} in {{location}}.
2. Confirm Identity: Ask if you're speaking with {{customer_name}}, in your own words, and wait for a clear yes before continuing to your other questions.
3. Ask Configuration: Ask what configuration they are looking for (e.g. 2BHK, 3BHK, Villa).
4. Ask Budget: Ask their budget range.
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
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}", "{{budget}}"]
  },
  healthcare: {
    id: "healthcare",
    name: "Healthcare & Clinic",
    icon: "Stethoscope",
    description: "Confirm doctor appointments, clinic timings, and collect visit notes.",
    default_offering_label: "Doctor / Clinic Specialty",
    welcome_message: "नमस्ते {{customer_name}}, मैं {{company_name}} से बोल रही हूँ। आपके {{offering}} के लिए अपॉइंटमेंट के सिलसिले में बात करने के लिए कॉल किया है। क्या अभी बात करने का सही समय है?",
    prompt: `You are a compassionate, professional clinic coordinator for {{company_name}}.
Your goal is to assist {{customer_name}} with booking their medical consultation appointment for {{offering}} at {{location}}.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Warm Greeting: Acknowledge their inquiry for {{offering}}.
2. Confirm Identity: Ask if you're speaking with {{customer_name}}, in your own words, and wait for a clear yes before continuing.
3. Language: Speak fluently and naturally in Hindi (or Hinglish/English according to customer preference). If the customer speaks Hindi or asks for Hindi, speak completely in polite, natural Hindi.
4. Ask Preferred Day: Politely ask their preferred consultation day, in your own natural words - weekday or weekend, or a specific day.
5. Ask Preferred Time: Once the day is confirmed, ask their preferred time slot (morning/evening).
6. Confirm Appointment: Lock in their chosen consultation slot (e.g. Sunday evening at 5 PM), confirm doctor availability at {{location}}, and inform them that an SMS/WhatsApp confirmation will follow.
7. Polite Closing & End Call: Conclude politely with "बहुत-बहुत धन्यवाद, आपका अपॉइंटमेंट तय कर दिया गया है। आपका दिन शुभ हो! अलविदा।" and call the end_call tool to finish the call.
8. Tone: Empathetic, calm, respectful, and concise (1 to 2 short sentences per turn).`,
    inbound_welcome_message: "Hello {{customer_name}}, thank you for calling {{company_name}}. How may I assist you today?",
    inbound_prompt: `You are a compassionate clinic receptionist for {{company_name}}. A patient or their family member has called your direct helpline.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the greeting above once. If the caller gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the caller's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the caller clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the caller is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Listen First: Understand what they're calling about - a new appointment, confirming an existing one, or general information.
2. Confirm Identity: Ask if you're speaking with {{customer_name}} (or confirm you're speaking with the right family member/contact), in your own words, and wait for a clear yes before continuing.
3. Share Information: Give clear details on {{offering}} availability, clinic timings, and location.
4. Ask Preferred Day: Ask their preferred day.
5. Ask Preferred Time: Once the day is confirmed, ask their preferred time slot, then confirm the appointment immediately.
6. Tone: Calm, empathetic, concise (1 to 2 short sentences per turn).
7. Closing: End warmly and invoke the end_call function.`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{location}}", "{{doctor_name}}", "{{preferred_time}}"]
  },
  edtech: {
    id: "edtech",
    name: "EdTech & Academy",
    icon: "GraduationCap",
    description: "Qualify student goals, program interests, and book free demo sessions.",
    default_offering_label: "Course / Program Name",
    welcome_message: "Hi {{customer_name}}, this is {{company_name}} calling regarding your inquiry for our {{offering}} program. Do you have a quick minute to chat?",
    prompt: `You are an enthusiastic educational counselor representing {{company_name}}.
Your goal is to understand {{customer_name}}'s learning background and invite them to an upcoming live demo session for {{offering}}.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Connect: Acknowledge their recent inquiry for the {{offering}} curriculum.
2. Confirm Identity: Ask if you're speaking with {{customer_name}}, in your own words, and wait for a clear yes before continuing.
3. Background Discovery: Ask whether they are currently a college student, working professional, or career switcher.
4. Program Value: Highlight industry-led projects, guaranteed placement support, flexible weekend batches, and mentor guidance.
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
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{batch_time}}", "{{current_role}}"]
  },
  bfsi: {
    id: "bfsi",
    name: "BFSI (Loans & Insurance)",
    icon: "CreditCard",
    description: "Check eligibility for personal/business loans or policies and schedule callbacks.",
    default_offering_label: "Financial Product / Loan Type",
    welcome_message: "Hello {{customer_name}}, I am calling from {{company_name}} regarding your recent inquiry for our {{offering}} options. Am I speaking with {{customer_name}}?",
    prompt: `You are a knowledgeable financial advisory agent for {{company_name}}.
Your goal is to qualify {{customer_name}} for {{offering}} and arrange a verification call with a senior loan officer.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Verification: Confirm the customer applied or checked eligibility for {{offering}}.
2. Ask the Amount: Ask the approximate loan or coverage amount they need.
3. Ask Employment Type: Ask whether they are salaried or self-employed.
4. Ask Income: Ask their approximate monthly income.
5. Value Proposition: Mention competitive interest rates, zero foreclosure charges (if applicable), and same-day instant pre-approval.
6. Next Step: Confirm their interest in receiving a customized sanction quote and schedule a documentation callback.
7. Tone: Trustworthy, professional, compliant, and discreet.`,
    inbound_welcome_message: "Hello {{customer_name}}, thank you for calling {{company_name}}. How may I assist you today?",
    inbound_prompt: `You are a professional financial services representative for {{company_name}}, answering an inbound call.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the greeting above once. If the caller gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the caller's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the caller clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the caller is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Listen First: Understand the caller's need - a new loan/insurance inquiry about {{offering}}, application status, or document submission.
2. Answer Clearly: Share eligibility basics, required documents, and processing timelines concisely.
3. Ask Amount: Ask the loan/coverage amount needed.
4. Ask Employment Type: If relevant, ask their employment type.
5. Next Step: Offer to schedule a callback from a senior advisor or send details over WhatsApp.
6. Tone: Trustworthy, professional, compliant, and discreet.
7. Closing: Say a warm goodbye and invoke the end_call function.`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{loan_amount}}", "{{tenure}}"]
  },
  general_sales: {
    id: "general_sales",
    name: "B2B Sales & Outbound",
    icon: "Briefcase",
    description: "Cold outreach, qualify pain points, and book 15-minute executive walkthroughs.",
    default_offering_label: "Product / Service Solution",
    welcome_message: "Hi {{customer_name}}, this is {{company_name}} reaching out. I noticed your interest in our {{offering}} solutions. Do you have a brief moment?",
    prompt: `You are an outbound sales development representative (SDR) for {{company_name}}.
Your goal is to understand {{customer_name}}'s needs and interest regarding {{offering}} specifically, and move them toward a clear next step (e.g. a demo, trial, or purchase decision) for {{offering}}.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Questions and Flow to ask in order:
1. Warm Introduction: Acknowledge speaking with {{customer_name}} and confirm if they have a quick minute.
2. Confirm Identity: Ask if you're speaking with {{customer_name}}, in your own words, and wait for a clear yes before continuing to your other questions.
3. Discovery: Ask ONE open question about their current situation or needs related to {{offering}} - e.g. what they use today, what matters most to them, or what prompted their interest. Phrase this naturally for whatever {{offering}} actually is (a physical product, a service, software, or anything else) - do not assume it is a calling, CRM, or lead-management tool unless {{offering}} itself says so.
4. Qualification: Based on their answer, ask ONE relevant follow-up question that digs into what matters most to them specifically about {{offering}} - for a physical product this might be a key feature, use case, or priority; for a service, a specific requirement or concern. Always tie this question to {{offering}} itself, never to generic business processes, workflows, or lead-management topics unless {{offering}} is actually a business/workflow/lead-management product.
5. Value Pitch: Highlight 2-3 benefits of {{offering}} that are relevant to what they just told you matters to them. Use ONLY features, specifications, or claims about {{offering}} that you have actually been given in this prompt or company information - never invent capabilities, numbers, or guarantees about {{offering}} that were not provided to you.
6. Call to Action: Propose a 15-minute live screen-share demo with your specialist. Offer two concrete upcoming days (e.g. the next two weekdays from today) and ask which works better - never default to naming the same two fixed weekdays on every call regardless of what day it actually is.
7. Language & Accent: Speak with a natural, polite Indian English accent. If the customer speaks in Hindi or asks for Hindi ('हिंदी में बात करो'), converse naturally and fluently in polite Hindi.
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
4. Qualify Gently: If it's a new inquiry, ask ONE relevant question about their situation or use case for {{offering}} specifically - phrased naturally for whatever {{offering}} actually is, not assumed to be a business/team tool unless {{offering}} says so.
5. Offer Next Step: Propose a 15-minute demo or connect them with the right specialist.
6. Language & Accent: Speak with a natural, polite Indian English accent, switching to Hindi if the caller does.
7. Closing: Once their question is resolved, say a warm goodbye and invoke the end_call function.`,
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{company_size}}", "{{industry}}"]
  },
  collections: {
    id: "collections",
    name: "Collections (Loan & EMI Recovery)",
    icon: "Banknote",
    description: "Remind borrowers of overdue payments, secure a promise to pay, and escalate hardship cases to a human agent.",
    default_offering_label: "Loan / Account Type",
    welcome_message: "Hello {{customer_name}}, I am calling from {{company_name}} regarding your {{offering}} account. Is this a good time to talk for a couple of minutes?",
    prompt: `You are a collections executive for {{company_name}}, calling {{customer_name}} about an overdue payment on their {{offering}}.

IMPORTANT RULE 1 (avoid repetition): You have already delivered the welcome message above once. If the customer gives a short acknowledgment like "Hello," "Yes," "Okay," or "Haan," do not reintroduce yourself or restate the company name/purpose again - move straight to the next objective, as if the conversation is already underway.
IMPORTANT RULE 2 (one question at a time): Ask only one question per turn, then stop and wait for the customer's answer before asking the next one. Never combine multiple questions into a single response.
IMPORTANT RULE 3 (language consistency): Reply in the same language you opened with, unless the customer clearly and consistently speaks in a different language. A single short word like "Hello," "Yes," or "OK" from the customer is not a signal to switch languages - continue naturally in the language you started with.

Key Objectives:
1. Identity Verification: Before discussing any account or payment details, confirm you are speaking with the account holder. If it is not them, do not disclose any account or payment information - politely ask to be connected or call back later.
2. State the Purpose Clearly: Once verified, clearly state the overdue amount of {{amount_due}} and the due date {{due_date}} for their {{offering}}. Be factual and direct, never vague about why you are calling.
3. Ask for Payment Today: Ask if they are able to make the payment today. If yes, ask if they'd like you to share the available payment options, rather than immediately listing specific channels - only mention a payment method you have actually been told is real and approved. Never invent, assume, or name a specific channel (e.g. a UPI ID, bank account, branch, or payment link) that wasn't explicitly provided to you.
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
    variables: ["{{company_name}}", "{{customer_name}}", "{{offering}}", "{{amount_due}}", "{{due_date}}"]
  }
}

export default function PromptPage() {
  const { user, refreshUser } = useAuth()
  const [promptText, setPromptText] = useState("Loading...")
  const [welcomeMessage, setWelcomeMessage] = useState("Loading...")
  const [inboundPromptText, setInboundPromptText] = useState("Loading...")
  const [inboundWelcomeMessage, setInboundWelcomeMessage] = useState("Loading...")
  const [activeDirection, setActiveDirection] = useState<'outbound' | 'inbound'>('outbound')
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [promptStatus, setPromptStatus] = useState<string>('Draft')
  const [showTestModal, setShowTestModal] = useState(false)
  const [showLiveVoicePlayground, setShowLiveVoicePlayground] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [testLanguage, setTestLanguage] = useState('English')
  const [selectedIndustry, setSelectedIndustry] = useState<string>('healthcare')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const t = params.get('template')
      if (t && CLIENT_TEMPLATES[t]) {
        setSelectedIndustry(t)
        return
      }
    }
    if (user?.industry && CLIENT_TEMPLATES[user.industry]) {
      setSelectedIndustry(user.industry)
    }
  }, [user?.industry])

  useEffect(() => {
    const fetchPrompt = async () => {
      try {
        const data = await fetchApi('/api/v1/prompt')
        if (data) {
          if (data.prompt) setPromptText(data.prompt)
          if (data.welcome_message) setWelcomeMessage(data.welcome_message)
          else setWelcomeMessage("नमस्ते {{customer_name}}, मैं {{company_name}} की तरफ से बोल रहा हूँ। क्या अभी 2 मिनट बात करना convenient है?")
          if (data.prompt_status) setPromptStatus(data.prompt_status)
          // Fall back to the caller's own industry template, not the
          // `selectedIndustry` state default - this effect can run before the
          // separate [user?.industry] effect below has corrected that state,
          // so closing over `selectedIndustry` here risked silently saving
          // the wrong industry's inbound script on first publish.
          const fallbackIndustry = (user?.industry && CLIENT_TEMPLATES[user.industry]) ? user.industry : selectedIndustry
          if (data.inbound_prompt) setInboundPromptText(data.inbound_prompt)
          else setInboundPromptText(CLIENT_TEMPLATES[fallbackIndustry]?.inbound_prompt || '')
          if (data.inbound_welcome_message) setInboundWelcomeMessage(data.inbound_welcome_message)
          else setInboundWelcomeMessage(CLIENT_TEMPLATES[fallbackIndustry]?.inbound_welcome_message || '')
        }
      } catch (e) {
        console.error("Failed to load prompt")
      }
    }
    fetchPrompt()
  }, [user?.industry])

  const handleApplyTemplate = async (key: string) => {
    const tmpl = CLIENT_TEMPLATES[key]
    if (!tmpl) return
    if (confirm(`Load the "${tmpl.name}" preset? This will update your prompt and welcome message.`)) {
      setSelectedIndustry(key)
      setPromptText(tmpl.prompt)
      setWelcomeMessage(tmpl.welcome_message)
      setInboundPromptText(tmpl.inbound_prompt)
      setInboundWelcomeMessage(tmpl.inbound_welcome_message)
      setPromptStatus('Draft')
      try {
        await fetchApi('/api/v1/prompt', {
          method: 'POST',
          body: JSON.stringify({
            prompt: tmpl.prompt, welcome_message: tmpl.welcome_message,
            inbound_prompt: tmpl.inbound_prompt, inbound_welcome_message: tmpl.inbound_welcome_message,
            industry: key
          })
        })
      } catch (err) {
        console.error('Failed to auto-save template draft', err)
      }
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetchApi('/api/v1/prompt', {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText, welcome_message: welcomeMessage,
          inbound_prompt: inboundPromptText, inbound_welcome_message: inboundWelcomeMessage,
          industry: selectedIndustry
        })
      })
      setPromptStatus('Draft')
      alert("Draft saved.")
    } catch (e) {
      alert("Failed to save prompt.")
    } finally {
      setSaving(false)
    }
  }

  const handlePublish = async () => {
    if (!confirm('Publish this prompt to your company’s live AI agent? This updates both your outbound and inbound call scripts.')) return
    setPublishing(true)
    try {
      await fetchApi('/api/v1/prompt', {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText, welcome_message: welcomeMessage,
          inbound_prompt: inboundPromptText, inbound_welcome_message: inboundWelcomeMessage,
          industry: selectedIndustry
        })
      })
      await fetchApi('/api/v1/prompt/publish', {
        method: 'POST',
        body: JSON.stringify({
          prompt: promptText, welcome_message: welcomeMessage,
          inbound_prompt: inboundPromptText, inbound_welcome_message: inboundWelcomeMessage,
          industry: selectedIndustry
        })
      })
      setPromptStatus('Published')
      // Publishing changes company.industry server-side, but the cached
      // `user` object in AuthProvider doesn't know that - without this,
      // every other page reading user.industry (e.g. Leads' Quick Call)
      // keeps using whatever industry was cached at login, silently
      // mismatching the template that was just published.
      await refreshUser()
      alert(`Published! Live AI agent is now configured with the ${CLIENT_TEMPLATES[selectedIndustry]?.name || ''} template.`)
    } catch (e: any) {
      alert(e.message || 'Failed to publish.')
    } finally {
      setPublishing(false)
    }
  }

  const handleTestCall = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testPhone) return
    try {
      await fetchApi('/api/v1/calls/trigger', {
        method: 'POST',
        body: JSON.stringify({
          phone_number: testPhone,
          lead_id: 'test-agent-call',
          campaign_language: testLanguage,
          industry: selectedIndustry
        })
      })
      alert("Test call initiated successfully! Your phone should ring shortly.")
      setShowTestModal(false)
    } catch (e) {
      alert("Failed to initiate test call")
    }
  }

  return (
    <AppLayout title="AI Prompt">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">Workspace / AI Prompt</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">Agent Configuration</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage your AI agent's instructions, use-case presets, and behavior.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowLiveVoicePlayground(true)}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2.5 text-xs font-bold shadow-md hover:opacity-90 transition-all cursor-pointer"
            style={{ backgroundColor: '#059669', color: '#ffffff' }}
          >
            <Mic size={15} className="text-white" /> Test in Browser (LiveKit)
          </button>
          <button onClick={() => setShowTestModal(true)} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-semibold hover:bg-muted">
            <Play size={15} />Test on Phone
          </button>
          <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 rounded-lg border border-border bg-card px-3.5 py-2.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
            <Save size={15} />{saving ? "Saving..." : "Save Draft"}
          </button>
          <button onClick={handlePublish} disabled={publishing} className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50">
            <CheckCircle2 size={15} />{publishing ? "Publishing..." : "Publish"}
          </button>
        </div>
      </section>

      {/* Multi-Industry Preset Bar */}
      <section className="mt-6 rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles size={16} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-foreground">
                LOAD PRE-BUILT INDUSTRY TEMPLATE
              </h2>
              <p className="text-xs font-bold text-muted-foreground">
                Instant one-click setup tailored for your vertical
              </p>
            </div>
          </div>
          <span className="inline-flex items-center self-start sm:self-auto rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
            Click to load full prompt &amp; greeting
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {Object.entries(CLIENT_TEMPLATES).map(([key, t]) => {
            const isSelected = selectedIndustry === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleApplyTemplate(key)}
                className={`flex flex-col items-start justify-between p-4 rounded-xl border-2 text-left transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/15 shadow-md ring-2 ring-primary/20 scale-[1.02]'
                    : 'border-border/80 bg-background hover:bg-muted/40 hover:border-primary/50 hover:shadow-sm'
                }`}
              >
                <div className="w-full">
                  <div className="flex w-full items-center justify-between gap-1 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted shrink-0">
                        {key === 'real_estate' && <Building2 size={16} className="text-primary" />}
                        {key === 'healthcare' && <Stethoscope size={16} className="text-emerald-500" />}
                        {key === 'edtech' && <GraduationCap size={16} className="text-blue-500" />}
                        {key === 'bfsi' && <CreditCard size={16} className="text-amber-500" />}
                        {key === 'general_sales' && <Briefcase size={16} className="text-purple-500" />}
                        {key === 'collections' && <Banknote size={16} className="text-rose-500" />}
                      </div>
                      <span className="font-extrabold text-sm tracking-tight text-foreground">
                        {t.name}
                      </span>
                    </div>
                    {user?.industry === key && (
                      <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-primary-foreground shadow-sm">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-foreground/80 dark:text-foreground/90 line-clamp-2 leading-relaxed">
                    {t.description}
                  </p>
                </div>
                <div className="mt-3 pt-2 w-full border-t border-border/50 flex items-center justify-between text-[11px] font-extrabold">
                  <span className={isSelected ? 'text-primary' : 'text-muted-foreground'}>
                    {isSelected ? '✓ Currently Loaded' : 'Load Template →'}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-[1fr_300px]">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-lg font-bold">Agent Configuration</h2>
              <p className="mt-1 text-xs text-muted-foreground">Setup the welcome message and system prompt for your agent.</p>
            </div>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${promptStatus === 'Published' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'}`}>
              <CheckCircle2 size={12} />{promptStatus === 'Published' ? 'Published' : 'Draft — not published'}
            </span>
          </div>

          {/* Outbound / Inbound Direction Tabs */}
          <div className="mt-4 inline-flex rounded-lg border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveDirection('outbound')}
              className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${activeDirection === 'outbound' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Outbound Calls (You call them)
            </button>
            <button
              type="button"
              onClick={() => setActiveDirection('inbound')}
              className={`rounded-md px-4 py-1.5 text-xs font-bold transition-all ${activeDirection === 'inbound' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Inbound Calls (They call you)
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {activeDirection === 'outbound'
              ? 'This script is used when your AI agent initiates the call to a lead or customer.'
              : 'This script is used when a customer calls your dedicated or shared Talkly number directly - it starts by listening, not pitching.'}
          </p>

          <div className="mt-5 space-y-6">

            {/* Welcome Message Section */}
            <div>
              <h2 className="text-sm font-bold text-foreground">
                {activeDirection === 'outbound' ? 'Agent Welcome Message' : 'Inbound Greeting'}
              </h2>
              <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
                {activeDirection === 'outbound'
                  ? 'The very first sentence your AI agent speaks when the prospect picks up.'
                  : 'The very first sentence your AI agent speaks when it answers an incoming call.'}
              </p>
              <textarea
                value={activeDirection === 'outbound' ? welcomeMessage : inboundWelcomeMessage}
                onChange={(e) => activeDirection === 'outbound' ? setWelcomeMessage(e.target.value) : setInboundWelcomeMessage(e.target.value)}
                className="w-full resize-y rounded-xl border border-border bg-background p-4 text-sm font-mono leading-relaxed outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 min-h-[90px]"
                placeholder={activeDirection === 'outbound'
                  ? "e.g. Hello {{customer_name}}, this is {{company_name}} calling regarding {{offering}}..."
                  : "e.g. Hello, thank you for calling {{company_name}}! How may I help you today?"}
              />
            </div>

            {/* System Prompt Section */}
            <div className="border-t border-border pt-6">
              <h2 className="text-sm font-bold text-foreground">
                {activeDirection === 'outbound' ? 'System Prompt Instructions' : 'Inbound System Prompt Instructions'}
              </h2>
              <p className="mt-0.5 mb-2.5 text-xs text-muted-foreground">
                {activeDirection === 'outbound'
                  ? 'The master AI persona, objection handling scripts, and conversation flow.'
                  : 'How your agent handles an incoming call - what to listen for, how to answer, and when to offer a next step.'}
              </p>
              <FlowBuilder
                key={activeDirection}
                value={activeDirection === 'outbound' ? promptText : inboundPromptText}
                onChange={(next) => activeDirection === 'outbound' ? setPromptText(next) : setInboundPromptText(next)}
                placeholderRole={`You are a professional representative for {{company_name}}, handling ${activeDirection === 'outbound' ? 'outbound' : 'inbound'} calls.`}
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 h-fit">
          <h2 className="text-lg font-bold">Dynamic Variables</h2>
          <p className="mt-1 text-xs text-muted-foreground mb-4">Injected automatically per contact from your uploaded CSV.</p>
          
          <div className="space-y-2.5">
            {[
              { tag: '{{customer_name}}', desc: 'Contact / Lead name' },
              { tag: '{{company_name}}', desc: 'Your company name' },
              { tag: '{{offering}}', desc: 'Product, course, clinic service, or property' },
              { tag: '{{location}}', desc: 'City or branch location' },
              { tag: '{{budget}}', desc: 'Budget range or price' },
              { tag: '{{campaign_name}}', desc: 'Active campaign name' },
              { tag: '{{any_csv_column}}', desc: 'Any extra CSV column (e.g. doctor, date)' }
            ].map(v => (
              <div key={v.tag} className="flex flex-col gap-0.5 rounded-lg bg-muted/40 p-2.5 border border-border/40">
                <span className="font-mono text-xs font-semibold text-primary">{v.tag}</span>
                <span className="text-[11px] text-muted-foreground">{v.desc}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Test Call Modal */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Test Agent</h2>
              <button onClick={() => setShowTestModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Enter your phone number to receive a test call from the AI agent using your saved prompt.</p>
            <form onSubmit={handleTestCall} className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-semibold text-muted-foreground">Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 text-muted-foreground" size={14} />
                  <input
                    required
                    type="text"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full rounded-lg border border-border bg-background p-2.5 pl-9 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-xs font-semibold text-muted-foreground">Voice Language</label>
                <select
                  value={testLanguage}
                  onChange={(e) => setTestLanguage(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="English">English</option>
                  <option value="Hindi">Hindi</option>
                  <option value="Hinglish">Hinglish</option>
                </select>
                <p className="mt-1 text-[11px] text-muted-foreground">Sets the TTS voice for the whole call - pick the language your prompt and welcome message are actually written in.</p>
              </div>
              <button type="submit" className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Call Me Now
              </button>
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
    </AppLayout>
  )
}
