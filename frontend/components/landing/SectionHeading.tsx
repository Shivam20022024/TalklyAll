import Reveal from './Reveal'

export default function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-[46rem] text-center lg:mb-14">
      <h2 className="h-section">{title}</h2>
      {children && <p className="mx-auto mt-4 max-w-[38rem] text-[1.0625rem] leading-relaxed text-balance">{children}</p>}
    </Reveal>
  )
}
