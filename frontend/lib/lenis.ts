let instance: any = null

export const setLenis = (lenis: any) => {
  instance = lenis
}

export const getLenis = () => instance

export function scrollToTarget(target: number | Element, { immediate = false }: { immediate?: boolean } = {}) {
  if (instance) {
    instance.scrollTo(target, { immediate, force: true })
    return
  }
  if (typeof target === 'number') window.scrollTo(0, target)
  else target.scrollIntoView()
}
