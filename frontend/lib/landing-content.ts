// Landing page content lives here, so copy and numbers can change without touching layout.
//
// BEFORE LAUNCH:
//   stats:        set `value` on each entry once the figure is verified.
//   integrations: set `status: 'supported'` on a provider once it is confirmed.

export const loginUrl = '/login'

export const contact = {
  email: 'info@novalantis.com',
  phones: [
    { label: '+91 78368 57658', href: 'tel:+917836857658' },
    { label: '+91 91424 18268', href: 'tel:+919142418268' },
  ],
  address: 'Sector 27, Greater Noida, Uttar Pradesh 201310, India',
}

export const company = {
  name: 'Novalantis',
  privacy: 'https://novalantis.com/privacy-policy/',
  terms: 'https://novalantis.com/terms-of-service/',
  blog: 'https://novalantis.com/resources/blogs/',
  overview: 'https://novalantis.com/products/talklyai/',
}

export const introVideo = {
  src: '/TalklyAI.mp4',
  // The current file runs 30 seconds. Update this label if a longer demo replaces it.
  label: 'Watch 30-sec Intro',
  title: 'TalklyAI intro video',
}

export const navLinks = [
  { label: 'Product', to: '/#features' },
  { label: 'Industries', to: '/#industries' },
  { label: 'Solutions', to: '/#collections' },
  { label: 'Pricing', to: '/demo?topic=Pricing' },
  { label: 'Resources', to: company.blog },
]

// value: null shows the placeholder mask. Set a real number to count up to it.
export const stats = [
  { id: 'calls', label: 'Calls Handled', value: null as number | null, mask: '0,000+', suffix: '+' },
  { id: 'businesses', label: 'Businesses Served', value: null as number | null, mask: '000+', suffix: '+' },
  { id: 'connections', label: 'Successful Connections', value: null as number | null, mask: '00%', suffix: '%' },
  { id: 'automation', label: 'Call Automation', value: null as number | null, mask: '00%', suffix: '%' },
]

export const heroCall = {
  customer: 'Rohit Malhotra',
  number: '+91 98••• ••210',
  lines: [
    { speaker: 'ai', text: 'Namaste Rohit ji. Aapne 3 BHK ke liye enquiry ki thi. Budget kitna hai?' },
    { speaker: 'customer', text: 'Around 80 lakh. March tak shift karna hai.', outcome: 0 },
    { speaker: 'ai', text: 'Sunday 11 baje site visit book kar dun?' },
    { speaker: 'customer', text: 'Haan, theek hai.', outcome: 1 },
    { speaker: 'ai', text: 'Booking token ka payment link bhej dun?' },
    { speaker: 'customer', text: 'Haan, bhej dijiye.', outcome: 2 },
    { speaker: 'ai', text: 'Details aur link WhatsApp par bhej diye. Dhanyavaad!', outcome: 3 },
  ] as { speaker: 'ai' | 'customer'; text: string; outcome?: number }[],
}

export const howItWorks = [
  { title: 'Upload Leads', body: 'Import CSV/Excel files or connect campaigns.' },
  { title: 'AI Makes the Call', body: 'TalklyAI calls customers and conducts natural conversations.' },
  { title: 'Analyze Conversations', body: 'Calls are transcribed and analyzed for sentiment, intent and lead quality.' },
  { title: 'Take Action', body: 'Results appear in the dashboard, with automated WhatsApp follow-ups.' },
]

// Sample conversations. `d` is how many seconds the line stays active on screen.
export const demoConversations = {
  hindi: {
    label: 'Hindi',
    lang: 'hi',
    scenario: 'Appointment confirmation',
    lines: [
      { speaker: 'ai', d: 5.5, text: 'नमस्ते, क्या मेरी बात सुनीता जी से हो रही है? मैं आपकी क्लिनिक की ओर से AI असिस्टेंट बोल रही हूँ।' },
      { speaker: 'customer', d: 2.5, text: 'जी, बोल रही हूँ। बताइए।' },
      { speaker: 'ai', d: 4.5, text: 'कल सुबह 10:30 बजे डॉक्टर मेहरा के साथ आपकी अपॉइंटमेंट है। क्या आप आ पाएँगी?' },
      { speaker: 'customer', d: 4, text: 'सुबह थोड़ा मुश्किल है। शाम को कोई समय मिल सकता है?' },
      { speaker: 'ai', d: 4, text: 'जी, कल शाम 5 बजे का समय खाली है। क्या मैं वही बुक कर दूँ?' },
      { speaker: 'customer', d: 2.5, text: 'हाँ, 5 बजे ठीक रहेगा।' },
      { speaker: 'ai', d: 5, text: 'आपकी अपॉइंटमेंट शाम 5 बजे की हो गई है। पूरी जानकारी WhatsApp पर भेज रही हूँ। धन्यवाद!' },
    ],
    outcome: ['Appointment moved to 5 pm', 'WhatsApp confirmation queued'],
  },
  hinglish: {
    label: 'Hinglish',
    lang: 'hi-Latn',
    scenario: 'Real estate enquiry',
    lines: [
      { speaker: 'ai', d: 6, text: 'Namaste Rohit ji, main AI assistant bol rahi hoon. Aapki 3 BHK enquiry ke baare mein call kiya hai. Abhi do minute baat ho sakti hai?' },
      { speaker: 'customer', d: 3.5, text: 'Haan, boliye. Greater Noida side dekh raha hoon.' },
      { speaker: 'ai', d: 4, text: 'Bilkul. Aapka budget roughly kitna hai, aur kab tak shift karna chahenge?' },
      { speaker: 'customer', d: 3.5, text: 'Around 80 lakh. Agle saal March tak shift karna hai.' },
      { speaker: 'ai', d: 4.5, text: 'Theek hai. Is Sunday site visit schedule kar dun? Subah 11 baje ka slot khaali hai.' },
      { speaker: 'customer', d: 2.5, text: 'Haan, Sunday 11 baje theek rahega.' },
      { speaker: 'ai', d: 4.5, text: 'Done. Location aur details WhatsApp par bhej rahi hoon. Dhanyavaad, Rohit ji!' },
    ],
    outcome: ['Lead qualified', 'Site visit booked for Sunday, 11 am', 'WhatsApp details queued'],
  },
  english: {
    label: 'English',
    lang: 'en-IN',
    scenario: 'EMI reminder',
    lines: [
      { speaker: 'ai', d: 5, text: 'Hello, am I speaking with Arjun Deshmukh? This is an AI assistant calling on behalf of your lender.' },
      { speaker: 'customer', d: 2, text: 'Yes, this is Arjun.' },
      { speaker: 'ai', d: 4.5, text: 'Thank you. To confirm it is you, could you share the last four digits of your registered mobile number?' },
      { speaker: 'customer', d: 2, text: 'Sure, it ends in 4821.' },
      { speaker: 'ai', d: 5, text: 'Thanks, Arjun. Your EMI of ₹12,450 was due on 28 October. Which date would work for you to pay it?' },
      { speaker: 'customer', d: 3.5, text: 'My salary comes in on the 7th, so I can pay on the 8th.' },
      { speaker: 'ai', d: 6, text: 'Noted, ₹12,450 on 8 November. I will send the payment link on WhatsApp. If anything changes, I can connect you to a team member.' },
    ],
    outcome: ['Identity verified', 'Promise to pay: ₹12,450 on 8 November', 'WhatsApp payment link queued'],
  },
} as const

// Only mark a provider 'supported' once the integration is confirmed.
export const integrations = [
  { id: 'whatsapp', name: 'WhatsApp', status: 'supported', body: 'Send automated confirmations, reminders, and next steps after each call.' },
  { id: 'crm', name: 'CRM platforms', status: 'placeholder', body: 'Provider to be confirmed.' },
  { id: 'telephony', name: 'Telephony providers', status: 'placeholder', body: 'Provider to be confirmed.' },
  { id: 'leads', name: 'Lead management tools', status: 'placeholder', body: 'Tool connections to be confirmed. CSV and Excel import is available now.' },
  { id: 'api', name: 'Webhooks and APIs', status: 'placeholder', body: 'Availability to be confirmed.' },
]

// Illustrative numbers for the dashboard preview. Always shown with a "Sample data" label.
const week: [string, number, number][] = [
  ['Mon', 1842, 1231],
  ['Tue', 1967, 1319],
  ['Wed', 2104, 1402],
  ['Thu', 1938, 1296],
  ['Fri', 2216, 1487],
  ['Sat', 1387, 971],
  ['Sun', 1086, 726],
]

export const dashboardSample = {
  campaign: 'Festive home loans',
  week: week.map(([day, placed, connected]) => ({ day, placed, connected })),
  totalCalls: week.reduce((sum, row) => sum + row[1], 0),
  connectedCalls: week.reduce((sum, row) => sum + row[2], 0),
  qualifiedLeads: 2156,
  promisedToPay: 482300,
  sentiment: [
    { name: 'Positive', value: 58, color: '#2463EB' },
    { name: 'Neutral', value: 27, color: '#94A3B8' },
    { name: 'Negative', value: 15, color: '#E0653F' },
  ],
  leadScores: [
    { name: 'Hot', value: 412, color: '#1B4FC4' },
    { name: 'Warm', value: 986, color: '#6C94F0' },
    { name: 'Cold', value: 758, color: '#C4D4F9' },
  ],
  recentCalls: [
    { name: 'Meera Iyer', language: 'English', outcome: 'Qualified', score: 86 },
    { name: 'Rohit Malhotra', language: 'Hinglish', outcome: 'Visit booked', score: 79 },
    { name: 'Sunita Verma', language: 'Hindi', outcome: 'Callback set', score: 52 },
    { name: 'Farhan Qureshi', language: 'Hinglish', outcome: 'Not interested', score: 18 },
  ],
  promises: [
    { name: 'Arjun Deshmukh', amount: 12450, due: '8 Nov', status: 'scheduled' as const },
    { name: 'Kavita Nair', amount: 8200, due: '2 Nov', status: 'paid' as const },
    { name: 'Imran Sheikh', amount: 15760, due: 'Paused', status: 'escalated' as const },
  ],
}
