import * as React from "react";
import { cn } from "@/lib/utils";
function TooltipProvider({ children }) { return <>{children}</>; }
function Tooltip({ children }) { return <div className="relative group inline-flex">{children}</div>; }
function TooltipTrigger({ asChild, children }) { return <>{children}</>; }
function TooltipContent({ className, children }) {
  return (
    <div className={cn("absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md whitespace-nowrap", className)}>
      {children}
    </div>
  );
}
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
