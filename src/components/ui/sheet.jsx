import * as React from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
function Sheet({ open, onOpenChange, children }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" onClick={() => onOpenChange?.(false)} />
      {children}
    </div>
  );
}
function SheetContent({ className, children, side = "right", ...props }) {
  return (
    <div className={cn("fixed z-50 gap-4 bg-background p-6 shadow-lg overflow-y-auto",
      side === "right" && "inset-y-0 right-0 h-full w-3/4 max-w-sm",
      side === "left" && "inset-y-0 left-0 h-full w-3/4 max-w-sm",
      className)} {...props}>
      {children}
    </div>
  );
}
function SheetHeader({ className, ...props }) { return <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />; }
function SheetTitle({ className, ...props }) { return <h2 className={cn("text-lg font-semibold text-foreground", className)} {...props} />; }
function SheetDescription({ className, ...props }) { return <p className={cn("text-sm text-muted-foreground", className)} {...props} />; }
function SheetTrigger({ children, onClick }) { return React.cloneElement(React.Children.only(children), { onClick }); }
function SheetFooter({ className, ...props }) { return <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />; }
export { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger, SheetFooter };
