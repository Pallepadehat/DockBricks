import { HomeIcon, DatabaseIcon, PlusIcon, FolderIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Category } from "@/types/models";

type AppSidebarProps = {
  categories: Category[];
  selectedCategory: string | null; // null = "All"
  onSelectCategory: (id: string | null) => void;
  onCreateCategory: () => void;
  onCreateDatabase: () => void;
};

export function AppSidebar({
  categories,
  selectedCategory,
  onSelectCategory,
  onCreateCategory,
  onCreateDatabase,
}: AppSidebarProps) {
  return (
    <Sidebar collapsible="none" className="border-r">
      <SidebarHeader />
      <SidebarContent>
        <SidebarGroup className="p-0 px-2">
          <SidebarGroupContent>
            <SidebarMenu>
              {/* "All" item */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={selectedCategory === null}
                  onClick={() => onSelectCategory(null)}
                  className="gap-2.5 px-3 h-9"
                >
                  <HomeIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span>All</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {/* Dynamic categories */}
              {categories.map((cat) => (
                <SidebarMenuItem key={cat.id}>
                  <SidebarMenuButton
                    isActive={selectedCategory === cat.id}
                    onClick={() => onSelectCategory(cat.id)}
                    className="gap-2.5 px-3 h-9"
                  >
                    <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span>{cat.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
              <PlusIcon className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-44">
            <DropdownMenuItem onClick={onCreateDatabase}>
              <DatabaseIcon className="size-4" />
              Create Database
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCreateCategory}>
              <FolderIcon className="size-4" />
              Create Category
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
