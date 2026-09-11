// Small (16x16) stroke icons used in menus and context menus throughout the
// app. All use `currentColor` so they inherit whatever color the menu item
// text is rendered in (see `.context-menu-item-icon` in index.css).
import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function RenameIcon() {
  return (
    <Svg>
      <path d="M15.5 4.5L19.5 8.5L8 20H4V16L15.5 4.5Z" />
    </Svg>
  );
}

export function DeleteIcon() {
  return (
    <Svg>
      <path d="M4 7H20" />
      <path d="M9 7V4H15V7" />
      <path d="M6 7L7 20H17L18 7" />
    </Svg>
  );
}

export function CutIcon() {
  return (
    <Svg>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="6" cy="18" r="2.5" />
      <path d="M8 7.5L20 19" />
      <path d="M8 16.5L20 5" />
    </Svg>
  );
}

export function CopyIcon() {
  return (
    <Svg>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 9V5.5C15 4.7 14.3 4 13.5 4H5.5C4.7 4 4 4.7 4 5.5V13.5C4 14.3 4.7 15 5.5 15H9" />
    </Svg>
  );
}

export function PasteIcon() {
  return (
    <Svg>
      <rect x="6" y="4" width="12" height="17" rx="1.5" />
      <path d="M9.5 4V3C9.5 2.4 10 2 10.5 2H13.5C14 2 14.5 2.4 14.5 3V4" />
      <path d="M9 12H15" />
      <path d="M9 16H15" />
    </Svg>
  );
}

export function PasteSpecialIcon() {
  return (
    <Svg>
      <rect x="6" y="4" width="12" height="17" rx="1.5" />
      <path d="M9.5 4V3C9.5 2.4 10 2 10.5 2H13.5C14 2 14.5 2.4 14.5 3V4" />
      <path d="M9 12H12.5" strokeWidth="3" />
      <path d="M9 16L14 16" />
    </Svg>
  );
}

export function OpenInExplorerIcon() {
  return (
    <Svg>
      <path d="M3 6.5C3 5.7 3.7 5 4.5 5H9.5L11.5 7H19.5C20.3 7 21 7.7 21 8.5V17.5C21 18.3 20.3 19 19.5 19H4.5C3.7 19 3 18.3 3 17.5V6.5Z" />
    </Svg>
  );
}

export function LinkIcon() {
  return (
    <Svg>
      <path d="M9 15L15 9" />
      <path d="M10.5 6.5L12.4 4.6C13.8 3.2 16 3.2 17.4 4.6C18.8 6 18.8 8.2 17.4 9.6L15.5 11.5" />
      <path d="M13.5 17.5L11.6 19.4C10.2 20.8 8 20.8 6.6 19.4C5.2 18 5.2 15.8 6.6 14.4L8.5 12.5" />
    </Svg>
  );
}

export function ParagraphIcon() {
  return (
    <Svg>
      <path d="M12 4H18" />
      <path d="M12 4V20" />
      <path d="M12 4H9.5C7.6 4 6 5.6 6 7.5C6 9.4 7.6 11 9.5 11H12" />
    </Svg>
  );
}

export function QuoteIcon() {
  return (
    <Svg>
      <path d="M6 8C4.9 8 4 8.9 4 10V13C4 14.1 4.9 15 6 15H7L5 19" />
      <path d="M15 8C13.9 8 13 8.9 13 10V13C13 14.1 13.9 15 15 15H16L14 19" />
    </Svg>
  );
}

export function ListOrderedIcon() {
  return (
    <Svg>
      <path d="M10 6H20" />
      <path d="M10 12H20" />
      <path d="M10 18H20" />
      <path d="M4.5 5.5H6V9" />
      <path d="M4.3 15C4.3 14.2 5 13.5 5.8 13.5C6.6 13.5 7.3 14.2 7.3 15C7.3 15.9 4 17 4 18.5H7.3" />
    </Svg>
  );
}

export function ListUnorderedIcon() {
  return (
    <Svg>
      <path d="M10 6H20" />
      <path d="M10 12H20" />
      <path d="M10 18H20" />
      <circle cx="5" cy="6" r="1.5" />
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="5" cy="18" r="1.5" />
    </Svg>
  );
}

export function ListTaskIcon() {
  return (
    <Svg>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <path d="M5.3 7L6.3 8L8.7 5.5" />
      <path d="M13 7H20" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <path d="M13 17H20" />
    </Svg>
  );
}

export function ListIcon() {
  return (
    <Svg>
      <path d="M9 6H20" />
      <path d="M9 12H20" />
      <path d="M9 18H20" />
      <path d="M4.5 6H4.51" />
      <path d="M4.5 12H4.51" />
      <path d="M4.5 18H4.51" />
    </Svg>
  );
}

export function BoldIcon() {
  return (
    <Svg>
      <path d="M6 4H13C15 4 16.5 5.3 16.5 7.2C16.5 9.1 15 10.4 13 10.4H6V4Z" />
      <path d="M6 10.4H14C16.2 10.4 18 11.8 18 13.9C18 16 16.2 17.4 14 17.4H6V10.4Z" />
    </Svg>
  );
}

export function ItalicIcon() {
  return (
    <Svg>
      <path d="M11 4H17" />
      <path d="M6 20H12" />
      <path d="M14 4L9 20" />
    </Svg>
  );
}

export function UnderlineIcon() {
  return (
    <Svg>
      <path d="M6 4V12C6 15.3 8.7 18 12 18C15.3 18 18 15.3 18 12V4" />
      <path d="M5 20H19" />
    </Svg>
  );
}

export function StrikethroughIcon() {
  return (
    <Svg>
      <path d="M4 12H20" />
      <path d="M7.5 7.5C7.5 5.6 9.4 4 12 4C14.2 4 16 5 16.6 6.5" />
      <path d="M8 17.5C8.6 19 10.2 20 12.2 20C14.7 20 16.5 18.6 16.5 16.8C16.5 15.4 15.6 14.4 14 12" />
    </Svg>
  );
}

export function SuperscriptIcon() {
  return (
    <Svg>
      <path d="M4 18L11 8" />
      <path d="M4 8L11 18" />
      <path d="M14 6H19" />
      <path d="M14 6C14 5 14.7 4.3 15.7 4.3C16.7 4.3 17.4 5 17.4 6C17.4 7 14 8 14 9.5H17.7" />
    </Svg>
  );
}

export function SubscriptIcon() {
  return (
    <Svg>
      <path d="M4 6L11 16" />
      <path d="M4 16L11 6" />
      <path d="M14 18H19" />
      <path d="M14 14.5C14 13.5 14.7 12.8 15.7 12.8C16.7 12.8 17.4 13.5 17.4 14.5C17.4 15.5 14 16.5 14 18" />
    </Svg>
  );
}

export function HighlightIcon() {
  return (
    <Svg>
      <path d="M11 15L5.5 20.5L3.5 20.5L3.5 18.5L9 13" />
      <path d="M11 15L16 10" />
      <path d="M13.5 4.5C15 3 16 3 17.5 4.5L19.5 6.5C21 8 21 9 19.5 10.5L16 14L10 8L13.5 4.5Z" />
    </Svg>
  );
}

export function InlineCodeIcon() {
  return (
    <Svg>
      <path d="M9 6L3 12L9 18" />
      <path d="M15 6L21 12L15 18" />
    </Svg>
  );
}

export function MathIcon() {
  return (
    <Svg>
      <path d="M18 4H8L12 12L8 20H18" />
    </Svg>
  );
}

export function BlockIcon() {
  return (
    <Svg>
      <rect x="3.5" y="4" width="17" height="16" rx="1.5" />
      <path d="M3.5 9H20.5" />
    </Svg>
  );
}

export function FormatIcon() {
  return (
    <Svg>
      <path d="M4 19L9 6H10L15 19" />
      <path d="M5.5 15H13.5" />
      <path d="M16 10H21" />
      <path d="M16 14H19.5" />
    </Svg>
  );
}

export function TabIcon() {
  return (
    <Svg>
      <path d="M3 6.5C3 5.7 3.7 5 4.5 5H10L12 8H19.5C20.3 8 21 8.7 21 9.5V17.5C21 18.3 20.3 19 19.5 19H4.5C3.7 19 3 18.3 3 17.5V6.5Z" />
    </Svg>
  );
}

export function CloseLeftIcon() {
  return (
    <Svg>
      <path d="M4 5V19" />
      <path d="M20 12H9" />
      <path d="M13 8L9 12L13 16" />
    </Svg>
  );
}

export function CloseRightIcon() {
  return (
    <Svg>
      <path d="M20 5V19" />
      <path d="M4 12H15" />
      <path d="M11 8L15 12L11 16" />
    </Svg>
  );
}

export function CloseAllIcon() {
  return (
    <Svg>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M9.5 9.5L14.5 14.5" />
      <path d="M14.5 9.5L9.5 14.5" />
    </Svg>
  );
}

export function CloseOthersIcon() {
  return (
    <Svg>
      <rect x="7.5" y="8" width="9" height="9" rx="1" />
      <path d="M4 13V6.5C4 5.7 4.7 5 5.5 5H12" />
    </Svg>
  );
}

export function TextCursorIcon() {
  return (
    <Svg>
      <path d="M9 5H15" />
      <path d="M9 19H15" />
      <path d="M12 5V19" />
    </Svg>
  );
}

/** Used for both header ids ({#id}) and links to a header (#Header) — same underlying "#" concept. */
export function HashIcon() {
  return (
    <Svg>
      <path d="M9 4L7 20" />
      <path d="M17 4L15 20" />
      <path d="M5 9H19" />
      <path d="M4 15H18" />
    </Svg>
  );
}

/** Used for both block ids (^block-id) and links to a block — same underlying "^" concept. */
export function CaretIcon() {
  return (
    <Svg>
      <path d="M5 15L12 6L19 15" />
    </Svg>
  );
}

export function InsertIcon() {
  return (
    <Svg>
      <path d="M12 5V19" />
      <path d="M5 12H19" />
    </Svg>
  );
}

export function FootnoteIcon() {
  return (
    <Svg>
      <path d="M12 6V14" />
      <path d="M8.5 8L15.5 12" />
      <path d="M15.5 8L8.5 12" />
      <path d="M6 19H18" />
    </Svg>
  );
}

export function CitationIcon() {
  return (
    <Svg>
      <circle cx="12" cy="13" r="4" />
      <path d="M16 13V15.3C16 16.8 17.6 17.2 18.6 16.1C19.8 14.8 19.6 10.3 16.2 8.2C12.7 6 7 7.3 7 13C7 17.8 11.5 20.2 16 18.3" />
    </Svg>
  );
}

export function CalloutIcon() {
  return (
    <Svg>
      <path d="M6 4V20" />
      <path d="M13 9V13" />
      <path d="M13 16.5H13.01" />
    </Svg>
  );
}

export function HorizontalRuleIcon() {
  return (
    <Svg>
      <path d="M4 12H8" />
      <path d="M10 12H14" />
      <path d="M16 12H20" />
    </Svg>
  );
}

export function PageIcon() {
  return (
    <Svg>
      <path d="M7 3.5H14L18 7.5V20.5H7V3.5Z" />
      <path d="M14 3.5V7.5H18" />
      <path d="M9.5 12H15.5" />
      <path d="M9.5 15.5H15.5" />
    </Svg>
  );
}

export function ExternalLinkIcon() {
  return (
    <Svg>
      <path d="M9 6H5.5C4.7 6 4 6.7 4 7.5V18.5C4 19.3 4.7 20 5.5 20H16.5C17.3 20 18 19.3 18 18.5V15" />
      <path d="M13 4H20V11" />
      <path d="M20 4L11 13" />
    </Svg>
  );
}

export function SearchIcon() {
  return (
    <Svg>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L20 20" />
    </Svg>
  );
}

export function FindReplaceIcon() {
  return (
    <Svg>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M13 13L17 17" />
      <path d="M13.5 19H20" />
      <path d="M17.5 16.5L20.5 19L17.5 21.5" />
    </Svg>
  );
}
