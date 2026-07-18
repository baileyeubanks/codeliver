import {
  Activity,
  Archive,
  Clapperboard,
  FolderKanban,
  House,
  LibraryBig,
  MessageSquareText,
  Plus,
  Settings,
  Target,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { NavigationIconName } from "./navigation-model";

export const NAVIGATION_ICONS: Record<NavigationIconName, LucideIcon> = {
  activity: Activity,
  archive: Archive,
  field: Clapperboard,
  folder: FolderKanban,
  home: House,
  library: LibraryBig,
  opportunities: Target,
  plus: Plus,
  reviews: MessageSquareText,
  settings: Settings,
  trash: Trash2,
};
