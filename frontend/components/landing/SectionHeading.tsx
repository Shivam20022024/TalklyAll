import Reveal from './Reveal'

/**
 * Centered section heading. On scroll the optional label, the heading and the
 * description each fade up in turn (a short 0.08s stagger), once.
 */
export default function SectionHeading({
  title,
  eyebrow,
  children,
}: {
  title: string
  eyebrow?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="mx-auto mb-12 max-w-[46rem] text-center lg:mb-14">
      {eyebrow && (
        <Reveal y={12} amount={0.6}>
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[#dbe3fb] bg-white px-3 py-1 text-[0.8125rem] font-semibold text-brand-dark shadow-[0_1px_2px_rgb(17_24_39/0.04)]">
            {eyebrow}
          </p>
        </Reveal>
      )}
      <Reveal y={16} amount={0.6} delay={eyebrow ? 0.08 : 0}>
        <h2 className="h-section">{title}</h2>
      </Reveal>
      {children && (
        <Reveal y={12} amount={0.6} delay={eyebrow ? 0.16 : 0.08}>
          <p className="mx-auto mt-4 max-w-[38rem] text-[1.0625rem] leading-relaxed text-balance">{children}</p>
        </Reveal>
      )}
    </div>
  )
}
