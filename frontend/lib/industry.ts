import {
  Building2,
  Stethoscope,
  GraduationCap,
  CreditCard,
  Briefcase,
  Users,
  Phone,
  Activity,
  Target,
  Sparkles,
  TrendingUp,
  CalendarCheck,
  Award,
  ShieldCheck,
  CheckCircle2,
  Banknote,
  ShoppingBag,
  Sun,
  Zap
} from 'lucide-react'

export type StandardIndustryKey = 'real_estate' | 'healthcare' | 'edtech' | 'bfsi' | 'general_sales' | 'collections' | 'ecommerce'
export type IndustryKey = StandardIndustryKey | string

export interface IndustryConfig {
  id: IndustryKey
  label: string
  shortLabel: string
  tagline: string
  iconName: string
  offeringName: string
  leadTerm: string
  conversionGoal: string
  metrics: {
    total_leads: { label: string; icon: any; tone: 'blue' | 'violet' | 'green' | 'orange'; desc: string }
    calls_made: { label: string; icon: any; tone: 'blue' | 'violet' | 'green' | 'orange'; desc: string }
    connected_calls: { label: string; icon: any; tone: 'blue' | 'violet' | 'green' | 'orange'; desc: string }
    qualified_leads: { label: string; icon: any; tone: 'blue' | 'violet' | 'green' | 'orange'; desc: string }
    interested_leads: { label: string; icon: any; tone: 'blue' | 'violet' | 'green' | 'orange'; desc: string }
    conversion_rate: { label: string; icon: any; tone: 'blue' | 'violet' | 'green' | 'orange'; desc: string }
  }
  funnelStages: [string, string, string, string, string, string]
  intentDistribution: { label: string; pct: number; color: string }[]
  topObjections: { objection: string; frequency: string; aiHandling: string }[]
  keyExtractionFields: string[]
}

export const INDUSTRY_CONFIGS: Record<IndustryKey, IndustryConfig> = {
  real_estate: {
    id: 'real_estate',
    label: 'Real Estate & Properties',
    shortLabel: 'Real Estate',
    tagline: 'Automated Buyer Qualification & Site Visit Scheduling',
    iconName: 'Building2',
    offeringName: 'Project / Property Name',
    leadTerm: 'Prospective Buyers',
    conversionGoal: 'Site Visits Scheduled',
    metrics: {
      total_leads: { label: 'Total Inquiries', icon: Users, tone: 'blue', desc: 'Buyer inquiries captured' },
      calls_made: { label: 'Outbound Dialed', icon: Phone, tone: 'violet', desc: 'AI outreach calls initiated' },
      connected_calls: { label: 'Connected Buyers', icon: Activity, tone: 'green', desc: 'Engaged in qualification' },
      qualified_leads: { label: 'Budget Qualified', icon: Target, tone: 'orange', desc: 'Budget & unit type aligned' },
      interested_leads: { label: 'High-Intent Buyers', icon: Sparkles, tone: 'blue', desc: 'Ready for in-person tour' },
      conversion_rate: { label: 'Site Visit Rate', icon: TrendingUp, tone: 'green', desc: 'Tours booked vs leads' },
    },
    funnelStages: [
      'Total Buyer Inquiries',
      'Outreach Contacted',
      'Connected & Engaged',
      'Budget & BHK Qualified',
      'High-Intent Buyers',
      'Site Visits Booked'
    ],
    intentDistribution: [
      { label: '2BHK Luxury Apartments', pct: 45, color: 'bg-blue-500' },
      { label: '3BHK Premium Residences', pct: 32, color: 'bg-emerald-500' },
      { label: 'Villas & Penthouses', pct: 15, color: 'bg-amber-500' },
      { label: 'Commercial / Plots', pct: 8, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'Possession Date Too Far', frequency: '38%', aiHandling: 'Highlights RERA registration & phased milestone guarantees' },
      { objection: 'Price Per Sqft High', frequency: '29%', aiHandling: 'Shares launch inaugural discount & flexible 20:80 payment scheme' },
      { objection: 'Need Weekend Visit Slot', frequency: '22%', aiHandling: 'Instantly locks VIP weekend afternoon slot with automated WhatsApp cab pass' },
    ],
    keyExtractionFields: ['Budget Range (e.g. ₹75L - ₹1.2Cr)', 'Configuration (2BHK / 3BHK / Villa)', 'Preferred Location / City', 'Purchase Timeline (Immediate / 6 mo)']
  },

  healthcare: {
    id: 'healthcare',
    label: 'Healthcare & Clinics',
    shortLabel: 'Healthcare',
    tagline: 'Patient Appointment Booking & Pre-Consultation Triage',
    iconName: 'Stethoscope',
    offeringName: 'Doctor / Clinic Specialty',
    leadTerm: 'Patients & Inquirers',
    conversionGoal: 'Consultations Confirmed',
    metrics: {
      total_leads: { label: 'Patient Inquiries', icon: Users, tone: 'blue', desc: 'Consultation requests received' },
      calls_made: { label: 'Confirmation Calls', icon: Phone, tone: 'violet', desc: 'Automated voice triage calls' },
      connected_calls: { label: 'Connected Patients', icon: Activity, tone: 'green', desc: 'Spoken with triage AI' },
      qualified_leads: { label: 'Pre-Screened Cases', icon: Target, tone: 'orange', desc: 'Symptoms & timing collected' },
      interested_leads: { label: 'Urgent / Priority Leads', icon: Sparkles, tone: 'blue', desc: 'Confirmed slot interest' },
      conversion_rate: { label: 'Booking Rate', icon: TrendingUp, tone: 'green', desc: 'Consultations confirmed' },
    },
    funnelStages: [
      'Total Patient Requests',
      'Outreach Initiated',
      'Connected Patients',
      'Specialty & Slot Matched',
      'Pre-Screened Priority',
      'Consultations Confirmed'
    ],
    intentDistribution: [
      { label: 'General Medicine / OPD', pct: 40, color: 'bg-blue-500' },
      { label: 'Cardiology & Diagnostics', pct: 26, color: 'bg-emerald-500' },
      { label: 'Dental & Orthodontics', pct: 20, color: 'bg-amber-500' },
      { label: 'Pediatrics & Dermatology', pct: 14, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'Doctor Specific Timing', frequency: '42%', aiHandling: 'Checks doctor OPD roster in real time and offers alternate early morning/evening slot' },
      { objection: 'Consultation / Procedure Fee', frequency: '31%', aiHandling: 'Provides transparent fee breakdown and insurance pre-authorization info' },
      { objection: 'Need Tele-Consultation', frequency: '18%', aiHandling: 'Switches patient to digital video consultation link via SMS/WhatsApp' },
    ],
    keyExtractionFields: ['Specialty / Doctor Name', 'Primary Health Concern', 'Preferred Time Slot (Morning / Evening)', 'Existing Patient or New Visit']
  },

  edtech: {
    id: 'edtech',
    label: 'EdTech & Academies',
    shortLabel: 'EdTech',
    tagline: 'Student Counseling & Live Demo Session Enrollment',
    iconName: 'GraduationCap',
    offeringName: 'Course / Certification Program',
    leadTerm: 'Student Candidates',
    conversionGoal: 'Demo Sessions Booked',
    metrics: {
      total_leads: { label: 'Course Inquiries', icon: Users, tone: 'blue', desc: 'Brochure / syllabus downloads' },
      calls_made: { label: 'Counseling Calls', icon: Phone, tone: 'violet', desc: 'Outbound counselor calls' },
      connected_calls: { label: 'Connected Learners', icon: Activity, tone: 'green', desc: 'Academic conversations' },
      qualified_leads: { label: 'Career Matched', icon: Target, tone: 'orange', desc: 'Background & goals aligned' },
      interested_leads: { label: 'High-Intent Students', icon: Sparkles, tone: 'blue', desc: 'Ready for live workshop' },
      conversion_rate: { label: 'Demo Book Rate', icon: TrendingUp, tone: 'green', desc: 'Demo signups vs inquiries' },
    },
    funnelStages: [
      'Course Inquiries',
      'Counseling Dialed',
      'Connected Aspirants',
      'Career Goals Qualified',
      'High-Intent Learners',
      'Live Demos Booked'
    ],
    intentDistribution: [
      { label: 'Fullstack AI & Software', pct: 44, color: 'bg-blue-500' },
      { label: 'Data Science & ML', pct: 28, color: 'bg-emerald-500' },
      { label: 'Product & UX Design', pct: 16, color: 'bg-amber-500' },
      { label: 'Cloud & DevOps', pct: 12, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'Course Fee / EMI Options', frequency: '45%', aiHandling: 'Explains 0% interest monthly EMI plans and merit scholarship eligibility' },
      { objection: 'Time Commitment / Working Pro', frequency: '28%', aiHandling: 'Offers weekend live sessions + lifetime access to HD class recordings' },
      { objection: 'Job Guarantee Queries', frequency: '21%', aiHandling: 'Shares hiring partner network of 450+ companies and 1:1 resume reviews' },
    ],
    keyExtractionFields: ['Current Status (College / Working Pro)', 'Target Career Goal', 'Preferred Batch (Weekend / Weekday)', 'Timeline to Upskill']
  },

  bfsi: {
    id: 'bfsi',
    label: 'BFSI & Lending Advisory',
    shortLabel: 'BFSI & Loans',
    tagline: 'Loan Qualification & Document Verification Pre-Approval',
    iconName: 'CreditCard',
    offeringName: 'Financial Product / Loan Type',
    leadTerm: 'Loan Applicants',
    conversionGoal: 'Pre-Approvals Sanctioned',
    metrics: {
      total_leads: { label: 'Loan Inquiries', icon: Users, tone: 'blue', desc: 'Eligibility inquiries received' },
      calls_made: { label: 'Verification Calls', icon: Phone, tone: 'violet', desc: 'AI compliance & discovery calls' },
      connected_calls: { label: 'Connected Borrowers', icon: Activity, tone: 'green', desc: 'Direct borrower discussions' },
      qualified_leads: { label: 'Income & CIBIL Screened', icon: Target, tone: 'orange', desc: 'Met minimum criteria' },
      interested_leads: { label: 'High-Intent Borrowers', icon: Sparkles, tone: 'blue', desc: 'Submitted KYC consent' },
      conversion_rate: { label: 'Sanction Rate', icon: TrendingUp, tone: 'green', desc: 'Pre-approvals vs leads' },
    },
    funnelStages: [
      'Loan Inquiries Received',
      'Verification Outreach',
      'Connected Borrowers',
      'Income & CIBIL Screened',
      'Sanction Ready',
      'Pre-Approvals Booked'
    ],
    intentDistribution: [
      { label: 'Instant Personal Loans', pct: 42, color: 'bg-blue-500' },
      { label: 'Home Loan Balance Transfer', pct: 30, color: 'bg-emerald-500' },
      { label: 'MSME Business Loans', pct: 18, color: 'bg-amber-500' },
      { label: 'Vehicle & Education Loans', pct: 10, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'High Interest Rate', frequency: '41%', aiHandling: 'Compares rate against 12 partner banks to find lowest reducing interest rate' },
      { objection: 'Too Many Documents', frequency: '32%', aiHandling: 'Explains 100% paperless approval via DigiLocker and bank account aggregator' },
      { objection: 'Processing Fees', frequency: '19%', aiHandling: 'Offers zero processing fee waiver for calls completed this week' },
    ],
    keyExtractionFields: ['Loan Amount Required', 'Employment Type (Salaried / Self-Employed)', 'Monthly Net Inhand Salary', 'Approximate CIBIL Score']
  },

  general_sales: {
    id: 'general_sales',
    label: 'B2B Sales & SaaS',
    shortLabel: 'B2B Sales',
    tagline: 'Outbound SDR Pipeline Generation & Executive Demo Booking',
    iconName: 'Briefcase',
    offeringName: 'B2B Solution / SaaS Offering',
    leadTerm: 'Prospect Accounts',
    conversionGoal: 'Executive Demos Booked',
    metrics: {
      total_leads: { label: 'Target Accounts', icon: Users, tone: 'blue', desc: 'Cold / warm accounts uploaded' },
      calls_made: { label: 'SDR Outbound Calls', icon: Phone, tone: 'violet', desc: 'AI discovery outreach' },
      connected_calls: { label: 'Decision Makers', icon: Activity, tone: 'green', desc: 'VP / Director level reach' },
      qualified_leads: { label: 'BANT Qualified', icon: Target, tone: 'orange', desc: 'Budget & need confirmed' },
      interested_leads: { label: 'High-Intent Deals', icon: Sparkles, tone: 'blue', desc: 'Ready for solution deep-dive' },
      conversion_rate: { label: 'Demo Book Rate', icon: TrendingUp, tone: 'green', desc: 'Demos locked vs accounts' },
    },
    funnelStages: [
      'Target Accounts Uploaded',
      'Outbound Dialed',
      'Decision Makers Reached',
      'BANT Qualified Leads',
      'High-Intent Champions',
      'Executive Demos Booked'
    ],
    intentDistribution: [
      { label: 'Outbound Voice Automation', pct: 48, color: 'bg-blue-500' },
      { label: 'Real-time CRM Integration', pct: 27, color: 'bg-emerald-500' },
      { label: 'AI Speech Analytics', pct: 15, color: 'bg-amber-500' },
      { label: 'Inbound Call Screening', pct: 10, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'Already using standard dialer / CRM', frequency: '43%', aiHandling: 'Explains how Voice AI integrates seamlessly with existing CRMs (HubSpot/Salesforce/Zoho) rather than replacing them' },
      { objection: 'AI sounds robotic / unnatural', frequency: '34%', aiHandling: 'Offers instant live call test to hear native conversational Hindi/English intonation' },
      { objection: 'Implementation timeline concerns', frequency: '16%', aiHandling: 'Demonstrates 10-minute zero-code campaign setup with pre-built vertical templates' },
    ],
    keyExtractionFields: ['Company Size & Team Volume', 'Current Tooling / CRM', 'Primary Bottleneck (Answer Rates / Agent Time)', 'Decision Timeline']
  },

  collections: {
    id: 'collections',
    label: 'Collections & EMI Recovery',
    shortLabel: 'Collections',
    tagline: 'Overdue EMI Reminders & Promise-to-Pay Recovery',
    iconName: 'Banknote',
    offeringName: 'Loan / Account Type',
    leadTerm: 'Overdue Borrowers',
    conversionGoal: 'Promises to Pay Secured',
    metrics: {
      total_leads: { label: 'Overdue Accounts', icon: Users, tone: 'blue', desc: 'Accounts in the recovery queue' },
      calls_made: { label: 'Reminder Calls', icon: Phone, tone: 'violet', desc: 'AI recovery calls placed' },
      connected_calls: { label: 'Connected Borrowers', icon: Activity, tone: 'green', desc: 'Reached the account holder' },
      qualified_leads: { label: 'Identity Verified', icon: Target, tone: 'orange', desc: 'Confirmed speaking with borrower' },
      interested_leads: { label: 'Promises to Pay', icon: Sparkles, tone: 'blue', desc: 'Specific amount & date committed' },
      conversion_rate: { label: 'Recovery Rate', icon: TrendingUp, tone: 'green', desc: 'Promises kept vs overdue accounts' },
    },
    funnelStages: [
      'Overdue Accounts Queued',
      'Reminder Calls Dialed',
      'Connected Borrowers',
      'Identity Verified',
      'Promise to Pay Secured',
      'Payment Received'
    ],
    intentDistribution: [
      { label: 'Personal Loan EMI', pct: 40, color: 'bg-blue-500' },
      { label: 'Credit Card Dues', pct: 27, color: 'bg-emerald-500' },
      { label: 'Business Loan EMI', pct: 20, color: 'bg-amber-500' },
      { label: 'Vehicle Loan EMI', pct: 13, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'Financial Hardship / Job Loss', frequency: '34%', aiHandling: 'Acknowledges with empathy and escalates to a human recovery specialist rather than negotiating terms itself' },
      { objection: 'Dispute Over Amount Owed', frequency: '26%', aiHandling: 'Does not argue the figure - offers to connect with a specialist who can review the statement' },
      { objection: 'Already Paid / Payment Pending', frequency: '19%', aiHandling: 'Notes the claim for verification instead of repeating the payment demand on the same call' },
    ],
    keyExtractionFields: ['Overdue Amount', 'Due Date', 'Promise to Pay Date', 'Promise to Pay Amount']
  },

  ecommerce: {
    id: 'ecommerce',
    label: 'E-commerce & D2C Brands',
    shortLabel: 'E-commerce',
    tagline: 'Automated COD Confirmation, Address Verification & RTO Prevention',
    iconName: 'ShoppingBag',
    offeringName: 'Product / Item Name',
    leadTerm: 'COD Orders',
    conversionGoal: 'Orders Confirmed & Dispatched',
    metrics: {
      total_leads: { label: 'Total COD Orders', icon: ShoppingBag, tone: 'blue', desc: 'Placed orders received' },
      calls_made: { label: 'Verification Calls', icon: Phone, tone: 'violet', desc: 'Automated COD verification calls' },
      connected_calls: { label: 'Connected Buyers', icon: Activity, tone: 'green', desc: 'Buyers answering call' },
      qualified_leads: { label: 'Address Verified', icon: Target, tone: 'orange', desc: 'Address & pincode validated' },
      interested_leads: { label: 'Confirmed for Dispatch', icon: Sparkles, tone: 'blue', desc: 'Confirmed COD delivery' },
      conversion_rate: { label: 'Confirmation Rate', icon: TrendingUp, tone: 'green', desc: 'Confirmed vs total orders' },
    },
    funnelStages: [
      'Total COD Orders Placed',
      'Verification Calls Dialed',
      'Connected Buyers',
      'Address & Pincode Verified',
      'RTO & Fake Orders Filtered',
      'Confirmed for Dispatch'
    ],
    intentDistribution: [
      { label: 'Fashion & Apparel', pct: 42, color: 'bg-blue-500' },
      { label: 'Beauty & Personal Care', pct: 28, color: 'bg-emerald-500' },
      { label: 'Consumer Electronics', pct: 18, color: 'bg-amber-500' },
      { label: 'Home & Kitchen', pct: 12, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'Ordered by mistake / Cancel please', frequency: '36%', aiHandling: 'Immediately cancels order in CRM to save courier freight and avoid shipping to uninterested buyers' },
      { objection: 'Delivery timeline concern', frequency: '28%', aiHandling: 'Reassures 3-4 day express dispatch with live WhatsApp courier tracking' },
      { objection: 'Incomplete address / landmark missing', frequency: '22%', aiHandling: 'Collects landmark and updates shipping label before warehouse dispatch' },
    ],
    keyExtractionFields: ['Order Status (Confirmed/Cancelled)', 'COD Amount', 'Delivery Address & Landmark', 'Payment Readiness (Cash/UPI)']
  }
}

/**
 * Resolves an IndustryConfig for any standard or custom industry vertical.
 * If the industry is a custom vertical (e.g. solar energy, consultation, retail),
 * it dynamically builds an intelligent, tailored configuration rather than falling
 * back to an unrelated preset.
 */
export function getIndustryConfig(
  industry?: string | null,
  customTitle?: string | null,
  customOffering?: string | null
): IndustryConfig {
  if (industry && (INDUSTRY_CONFIGS as any)[industry]) {
    return (INDUSTRY_CONFIGS as any)[industry]
  }

  const raw = (industry || 'custom').trim()
  const lowerRaw = raw.toLowerCase()
  const lowerTitle = (customTitle || '').toLowerCase()
  const lowerOff = (customOffering || '').toLowerCase()

  const isSolar = lowerRaw.includes('solar') || lowerTitle.includes('solar') || lowerOff.includes('solar')

  let cleanLabel = customTitle?.trim()
  if (!cleanLabel) {
    cleanLabel = raw
      .replace(/^custom_/i, '')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map(w => {
        const u = w.toUpperCase()
        if (['AI', 'ML', 'TCS', 'BHK', 'COD', 'EMI', 'VIP', 'DBT'].includes(u)) return u
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      })
      .join(' ')
  }

  if (isSolar) {
    return {
      id: raw,
      label: cleanLabel || 'Rooftop Solar Consultation',
      shortLabel: 'Solar Energy',
      tagline: 'Solar Lead Qualification, Subsidy Guidance & Free Site Survey Booking',
      iconName: 'Sun',
      offeringName: customOffering || 'Solar Panel System (kW)',
      leadTerm: 'Solar Inquiries',
      conversionGoal: 'Site Surveys Booked',
      metrics: {
        total_leads: { label: 'Solar Inquiries', icon: Users, tone: 'blue', desc: 'Solar consultations & inquiries captured' },
        calls_made: { label: 'Outreach Dialed', icon: Phone, tone: 'violet', desc: 'AI consultation calls initiated' },
        connected_calls: { label: 'Connected Homeowners', icon: Activity, tone: 'green', desc: 'Engaged in roof & bill qualification' },
        qualified_leads: { label: 'Site Surveys Booked', icon: Target, tone: 'orange', desc: 'Technical site survey confirmed' },
        interested_leads: { label: 'Subsidy Qualified', icon: Sparkles, tone: 'blue', desc: 'Roof & bill criteria eligible' },
        conversion_rate: { label: 'Survey Booking Rate', icon: TrendingUp, tone: 'green', desc: 'Site surveys vs inquiries' },
      },
      funnelStages: [
        'Total Solar Inquiries',
        'Outreach Contacted',
        'Connected Homeowners',
        'Roof & Bill Qualified',
        'Subsidy Eligible',
        'Site Surveys Booked'
      ],
      intentDistribution: [
        { label: '3kW Residential System', pct: 45, color: 'bg-amber-500' },
        { label: '5kW Residential System', pct: 30, color: 'bg-emerald-500' },
        { label: '10kW + Commercial', pct: 15, color: 'bg-blue-500' },
        { label: 'Subsidy & Net Metering', pct: 10, color: 'bg-purple-500' },
      ],
      topObjections: [
        { objection: 'Subsidy Process Too Complicated', frequency: '42%', aiHandling: 'Explains direct PM Surya Ghar DBT transfer of ₹78,000 handled end-to-end' },
        { objection: 'Rainy or Cloudy Season Efficiency', frequency: '31%', aiHandling: 'Clarifies panels operate using diffuse daylight and year-round net metering grid banking' },
        { objection: 'Upfront Installation Cost', frequency: '20%', aiHandling: 'Highlights zero-down financing where monthly solar savings exceed EMI' },
      ],
      keyExtractionFields: ['Roof Ownership (Independent / Flat)', 'Monthly Electricity Bill', 'System Capacity (kW)', 'Preferred Survey Slot']
    }
  }

  return {
    id: raw,
    label: cleanLabel || 'Custom Consultation & Sales',
    shortLabel: cleanLabel?.split(' ')[0] || 'Custom',
    tagline: 'Automated Lead Qualification, Consultation & Appointment Scheduling',
    iconName: 'Sparkles',
    offeringName: customOffering || 'Product / Service Offering',
    leadTerm: 'Prospective Leads',
    conversionGoal: 'Appointments Booked',
    metrics: {
      total_leads: { label: 'Total Inquiries', icon: Users, tone: 'blue', desc: 'Inquiries captured for this vertical' },
      calls_made: { label: 'Outreach Calls', icon: Phone, tone: 'violet', desc: 'AI voice qualification calls initiated' },
      connected_calls: { label: 'Connected Prospects', icon: Activity, tone: 'green', desc: 'Prospects engaged in live conversation' },
      qualified_leads: { label: 'Qualified Leads', icon: Target, tone: 'orange', desc: 'Requirements & budget verified' },
      interested_leads: { label: 'High-Intent Prospects', icon: Sparkles, tone: 'blue', desc: 'Ready for consultation callback' },
      conversion_rate: { label: 'Conversion Rate', icon: TrendingUp, tone: 'green', desc: 'Qualified bookings vs total leads' },
    },
    funnelStages: [
      'Total Lead Inquiries',
      'Outreach Contacted',
      'Connected & Engaged',
      'Requirement Qualified',
      'High-Intent Prospects',
      'Appointments Booked'
    ],
    intentDistribution: [
      { label: 'High Interest / Ready to Buy', pct: 40, color: 'bg-blue-500' },
      { label: 'Information & Pricing Inquiry', pct: 35, color: 'bg-emerald-500' },
      { label: 'Evaluating Alternatives', pct: 15, color: 'bg-amber-500' },
      { label: 'Callback Requested', pct: 10, color: 'bg-purple-500' },
    ],
    topObjections: [
      { objection: 'Need more information', frequency: '35%', aiHandling: 'Provides verified facts and offers specialist walkthrough' },
      { objection: 'Pricing question', frequency: '30%', aiHandling: 'Explains transparent pricing tiers and ROI structure' },
      { objection: 'Timing inconvenient', frequency: '25%', aiHandling: 'Schedules exact callback date and time window' },
    ],
    keyExtractionFields: ['Customer Need', 'Budget / Scale', 'Location', 'Next Step Agreed']
  }
}
