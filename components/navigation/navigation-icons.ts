import {
  Activity,
  Archive,
  FolderKanban,
  LibraryBig,
  MessageSquareText,
  Plus,
  Settings,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import type { NavigationIconName } from "./navigation-model";

export const NAVIGATION_ICONS: Record<NavigationIconName, LucideIcon> = {
  activity: Activity,
  archive: Archive,
  folder: FolderKanban,
  library: LibraryBig,
  plus: Plus,
  reviews: MessageSquareText,
  settings: Settings,
  trash: Trash2,
};
