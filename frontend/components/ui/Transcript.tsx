/**
 * Renders a stored call transcript ("AI: ..." / "Customer: ..." lines) as a
 * conversation. Customer-side speakers sit on the right, the agent on the left.
 * Other named speakers (e.g. "Manager:", "Third Party:" from uploaded
 * recordings) keep their own label. Lines without a speaker label are shown as
 * quiet notes rather than being attributed to anyone.
 */
const CUSTOMER = /^(user|customer|caller)$/i;
const AGENT = /^(assistant|ai|agent|talkly ai|ai agent)$/i;
// "Label: text" where the label is a short name (optionally wrapped in ** from markdown).
const SPEAKER_LINE = /^\**\s*([A-Za-z][A-Za-z .'-]{0,24}?)\s*\**\s*:\s*\**\s*([\s\S]+)$/;

export function Transcript({ text, customerLabel = 'Customer' }: { text?: string | null; customerLabel?: string }) {
  const lines = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <ol className="space-y-3 rounded-lg border border-ds-line bg-ds-surface p-4">
      {lines.map((line, i) => {
        const m = SPEAKER_LINE.exec(line);
        if (!m) {
          return (
            <li key={i} className="text-center text-xs text-ds-ink-3">
              {line}
            </li>
          );
        }
        const speaker = m[1].trim();
        const content = m[2].trim();
        const isCustomer = CUSTOMER.test(speaker);
        const isAgent = AGENT.test(speaker);
        const label = isCustomer ? customerLabel : isAgent ? 'Talkly AI' : speaker;
        return (
          <li key={i} className={`flex flex-col ${isCustomer ? 'items-end' : 'items-start'}`}>
            <span className="mb-1 text-[11px] font-medium text-ds-ink-3">{label}</span>
            <p
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${
                isCustomer
                  ? 'rounded-tr-sm bg-ds-primary text-white'
                  : isAgent
                    ? 'rounded-tl-sm border border-ds-line bg-ds-bg text-ds-ink'
                    : 'rounded-tl-sm border border-dashed border-ds-line-strong bg-ds-bg text-ds-ink'
              }`}
            >
              {content}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
