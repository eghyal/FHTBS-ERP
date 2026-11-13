export interface Thread {
  id: string;
  name: string | null;
  is_group: number;
  created_at: string;
  created_by: string;
  last_message: string | null;
  last_message_file_name?: string | null;
  last_message_file_type?: string | null;
  last_message_time: string | null;
  last_message_sender?: string | null;
  unread_count?: number;
  participants: string[];
}

export interface Message {
  id: string;
  thread_id: string;
  sender_username: string;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  file_type: string | null;
  is_deleted: number;
  created_at: string;
  read_by?: string;
  forwarded_from?: string | null;
  reply_to_id?: string | null;
  reply_to_sender?: string | null;
  reply_to_content?: string | null;
  is_pinned?: number;
  pinned_by?: string | null;
}

export interface UserDirectory {
  username: string;
  name: string;
  role: string;
  level?: string;
}

export interface ErpRefItem {
  id: string;
  doc_number: string;
  type: "NTP" | "PR" | "PO" | "PROJECT" | "QUOTATION" | "INVOICE" | string;
  title: string;
  subtitle?: string;
  status: string;
  amount: number;
  urgency: string;
  partner_name?: string;
  requires_auth: boolean;
  url: string;
}

const FORUM_AVATAR_COLORS = [
  "forum-avatar-badge bg-stone-100 text-stone-700 border-stone-200/80",
  "forum-avatar-badge bg-blue-50/80 text-blue-700 border-stone-200/80",
  "forum-avatar-badge bg-amber-50/80 text-amber-700 border-stone-200/80",
  "forum-avatar-badge bg-stone-100/90 text-stone-800 border-stone-200/80",
  "forum-avatar-badge bg-rose-50/80 text-rose-700 border-stone-200/80",
  "forum-avatar-badge bg-indigo-50/80 text-indigo-700 border-stone-200/80",
  "forum-avatar-badge bg-sky-50/80 text-sky-700 border-stone-200/80",
];

export const getColorHash = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return FORUM_AVATAR_COLORS[Math.abs(hash) % FORUM_AVATAR_COLORS.length];
};

export const isImageAttachment = (
  fileType?: string | null,
  fileName?: string | null,
  fileUrl?: string | null,
): boolean => {
  if (fileType && fileType.toLowerCase().startsWith("image/")) return true;
  const target = (fileName || fileUrl || "").toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/.test(target);
};

export { stripMarkdown, formatMsgTime, getInitials } from "@/utils/format";

