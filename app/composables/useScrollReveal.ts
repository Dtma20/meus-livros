import type { Directive } from 'vue'

function getScrollParent(element: HTMLElement | null): HTMLElement | null {
  if (!element || typeof window === 'undefined') return null
  let parent = element.parentElement
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent)
    const overflowY = style.overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return parent
    }
    parent = parent.parentElement
  }
  return null
}

let sharedObserver: IntersectionObserver | null = null
const revealCallbacks = new Map<Element, (entry: IntersectionObserverEntry) => void>()

function getSharedObserver(): IntersectionObserver | null {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    return null
  }
  if (!sharedObserver) {
    try {
      sharedObserver = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const cb = revealCallbacks.get(entry.target)
            if (cb) cb(entry)
          }
        },
        {
          root: null,
          rootMargin: '0px 0px -10px 0px',
          threshold: 0.02,
        },
      )
    }
    catch {
      sharedObserver = null
    }
  }
  return sharedObserver
}

export function registerRevealElement(el: HTMLElement) {
  if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
    el.classList.add('is-revealed')
    return
  }

  const observer = getSharedObserver()
  if (!observer) {
    el.classList.add('is-revealed')
    return
  }

  const handleIntersection = (entry: IntersectionObserverEntry) => {
    el.classList.add('reveal-enabled')
    if (entry.isIntersecting) {
      el.classList.add('is-revealed')
    } else {
      const scrollParent = getScrollParent(el)
      const visibleBottom = scrollParent
        ? Math.min(scrollParent.getBoundingClientRect().bottom, window.innerHeight)
        : window.innerHeight

      if (entry.boundingClientRect.top >= visibleBottom - 25) {
        el.classList.remove('is-revealed')
      } else {
        el.classList.add('is-revealed')
      }
    }
  }

  revealCallbacks.set(el, handleIntersection)
  try {
    observer.observe(el)
  }
  catch {
    revealCallbacks.delete(el)
    el.classList.remove('reveal-enabled')
    el.classList.add('is-revealed')
  }
}

export function unregisterRevealElement(el: HTMLElement) {
  if (!sharedObserver) return
  revealCallbacks.delete(el)
  sharedObserver.unobserve(el)
}

export const vReveal: Directive<HTMLElement> = {
  mounted(el) {
    registerRevealElement(el)
  },
  unmounted(el) {
    unregisterRevealElement(el)
  },
}
