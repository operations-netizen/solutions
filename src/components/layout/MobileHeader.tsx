import { Menu } from 'lucide-react'
import { useState } from 'react'

import { SidebarNav } from '@/components/layout/Sidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * Below `lg` there is no room for a rail, so navigation collapses behind a menu
 * button. Above `lg` this bar is gone entirely and the sidebar is always visible
 * — no header competing with each page's own title.
 */
export function MobileHeader() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur-sm lg:hidden">
      <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open navigation</span>
            </Button>
          </SheetTrigger>

          {/* p-0 because SidebarNav brings its own padding and dividers. */}
          <SheetContent side="left" className="w-64 p-0 sm:max-w-xs">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            {/* Following a link should dismiss the sheet, not leave it covering the page. */}
            <SidebarNav onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>

        <span className="text-sm font-semibold text-foreground">HOBU Solutions</span>
      </div>
    </header>
  )
}
