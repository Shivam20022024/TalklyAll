import Link from 'next/link'
import React from 'react'

// Internal paths use Next's router. Full URLs and mailto/tel links stay plain anchors.
export default function SmartLink({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: any }) {
  if (/^(https?:|mailto:|tel:)/.test(to)) {
    const external = to.startsWith('http')
    return (
      <a href={to} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...props}>
        {children}
      </a>
    )
  }
  return <Link href={to} {...props}>{children}</Link>
}
