import { contact } from './landing-content'

const endpoint = process.env.NEXT_PUBLIC_DEMO_ENDPOINT
const accessKey = process.env.NEXT_PUBLIC_DEMO_ACCESS_KEY

export interface DemoFormValues {
  name: string
  email: string
  phone: string
  company: string
  topic: string
  message: string
}

// Posts to the configured endpoint. With no endpoint set, opens a pre-filled email.
export async function submitDemoRequest(values: DemoFormValues): Promise<{ via: 'email' | 'endpoint' }> {
  const subject = `TalklyAI: ${values.topic} request from ${values.company}`

  if (!endpoint) {
    const body = [
      `Name: ${values.name}`,
      `Work email: ${values.email}`,
      `Phone: ${values.phone}`,
      `Company: ${values.company}`,
      `Topic: ${values.topic}`,
      '',
      values.message,
    ].join('\n')
    window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    return { via: 'email' }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...values, subject, ...(accessKey ? { access_key: accessKey } : {}) }),
  })
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
  return { via: 'endpoint' }
}
