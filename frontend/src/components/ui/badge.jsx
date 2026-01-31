/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  // NOTE: we keep the "important" base from shadcn, but map tokens to our Tailwind palette.
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none transition-[color,box-shadow] overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30",
  {
    variants: {
      variant: {
        default: "bg-emerald-500/15 text-emerald-200 border-emerald-500/30",
        secondary: "bg-neutral-900 text-neutral-100 border-neutral-700",
        destructive: "bg-rose-500/15 text-rose-200 border-rose-500/30",
        outline: "bg-transparent border-neutral-700 text-neutral-200",
        ghost: "bg-transparent border-transparent text-neutral-200 hover:bg-neutral-900/50",
        link: "bg-transparent border-transparent text-emerald-300 underline underline-offset-4 hover:text-emerald-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({ className, variant = "default", asChild = false, ...props }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
