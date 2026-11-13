import React from "react";
import { Layers, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { formatIDR } from "@/lib/utils";

export interface HighVolumeProjectIndication {
  project_id: string;
  project_name: string;
  item_count: number;
  total_qty: number;
  total_cost: number;
}

interface ProcurementTopBannersProps {
  highVolumeProjectIndications: HighVolumeProjectIndication[];
  pendingWorkspaceDocs: any[];
  onNavigateProcurementPlan: (projectId: string) => void;
  onApproveWorkspaceDoc: (docId: string) => void;
  onReviseWorkspaceDoc: (docId: string) => void;
}

export const ProcurementTopBanners = React.memo(function ProcurementTopBanners({
  highVolumeProjectIndications,
  pendingWorkspaceDocs,
  onNavigateProcurementPlan,
  onApproveWorkspaceDoc,
  onReviseWorkspaceDoc,
}: ProcurementTopBannersProps) {
  return (
    <>
      {highVolumeProjectIndications.length > 0 && (
        <div className="bg-white border border-stone-200 p-3.5 rounded-xl flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-stone-700">
            <Layers className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong className="text-stone-900">
                Manufacturing Procurement Wave ({highVolumeProjectIndications.length})
              </strong>{" "}
              — Schedule staged material arrivals aligned with Setup Master stations, PR/BOM quantities, and BOP priority.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {highVolumeProjectIndications.slice(0, 3).map((ind) => (
              <button
                key={ind.project_id}
                type="button"
                onClick={() => onNavigateProcurementPlan(ind.project_id)}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 border border-stone-300 dark:border-stone-700 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <span className="truncate max-w-[180px]">
                  Plan: {ind.project_name}
                </span>
                <span className="font-mono text-[11px] text-stone-300 tabular-nums">
                  ({ind.item_count} items ·{" "}
                  {ind.total_qty.toLocaleString("en-US")} u)
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {pendingWorkspaceDocs.length > 0 && (
        <div className="bg-white border border-stone-200/80 p-4 rounded-xl shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-bold text-stone-900 text-xs uppercase tracking-wider">
              <span>
                Action Required: Workspace Document Approvals (
                {pendingWorkspaceDocs.length})
              </span>
            </div>
            <a
              href="/document-workspace"
              className="text-xs font-bold text-stone-700 hover:underline"
            >
              Open Document Workspace &rarr;
            </a>
          </div>

          <div className="divide-y divide-stone-100">
            {pendingWorkspaceDocs.map((doc) => (
              <div
                key={doc.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-mono font-bold text-stone-900">
                    {doc.document_code} - {doc.title}
                  </div>
                  <div className="text-[10px] text-stone-500">
                    Created by: {doc.created_by_name} ({doc.department}) • Type:{" "}
                    {doc.document_type}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    variant="success_soft"
                    onClick={() => onApproveWorkspaceDoc(doc.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={() => onReviseWorkspaceDoc(doc.id)}
                  >
                    Add Revision Note
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
});

export function buildPoEmailBody(doc: any): string {
  if (!doc) return "";
  const issueDate =
    doc.created_at || doc.date || doc.po_date
      ? new Date(
          doc.created_at || doc.date || doc.po_date
        ).toLocaleDateString("en-US", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";
  const totalVal = doc.total_amount || doc.grand_total || doc.amount;
  const deliveryDate = doc.expected_delivery_date
    ? new Date(doc.expected_delivery_date).toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;
  const itemCount =
    Array.isArray(doc.items) && doc.items.length > 0
      ? doc.items.length
      : null;

  return `Dear ${doc.supplier_name || "Supplier Partner"},

Warm regards,

Thank you for your continued partnership and collaboration with 𝗖𝗩 𝗕𝗮𝘁𝘂 𝗘𝗺𝗮𝘀 𝗚𝗿𝗼𝘂𝗽.

Please find attached our official 𝗣𝘂𝗿𝗰𝗵𝗮𝘀𝗲 𝗢𝗿𝗱𝗲𝗿 (𝗣𝗢) for our operational procurement requirements.

𝗢𝗿𝗱𝗲𝗿 𝗦𝘂𝗺𝗺𝗮𝗿𝘆:
• PO Reference No. : ${doc.po_number}${
    issueDate ? `\n• PO Issue Date    : ${issueDate}` : ""
  }${totalVal ? `\n• Total PO Value   : ${formatIDR(totalVal)}` : ""}${
    itemCount
      ? `\n• Total Line Items : ${itemCount} item(s) / service(s) (specifications attached)`
      : ""
  }${deliveryDate ? `\n• Target Delivery  : ${deliveryDate}` : ""}

𝗣𝗿𝗼𝗰𝗲𝘀𝘀𝗶𝗻𝗴 & 𝗗𝗲𝗹𝗶𝘃𝗲𝗿𝘆 𝗜𝗻𝘀𝘁𝗿𝘂𝗰𝘁𝗶𝗼𝗻𝘀:
Please process this order in accordance with the agreed specifications, quantities, and pricing terms. Ensure that your Delivery Order references this PO number upon arrival at our facility.

𝗡𝗲𝘅𝘁 𝗦𝘁𝗲𝗽𝘀:
Kindly confirm receipt of this Purchase Order and your estimated delivery readiness by replying to this email. Should there be any technical inquiries or delivery schedule coordination needed, please contact our Procurement team immediately.

Thank you for your attention, time, and cooperation.

Best regards,`;
}

export async function dispatchPoEmailClient(
  data: { to: string; subject: string; body: string },
  showToast: (msg: string, type?: any) => void
) {
  let logoSrc = `${window.location.origin}/logo.png`;
  try {
    const response = await fetch("/logo.png");
    const blob = await response.blob();
    const base64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    if (base64) logoSrc = base64 as string;
  } catch (err) {
    console.warn("Failed to convert logo to base64", err);
  }

  const htmlSignature = `
<table cellpadding="0" cellspacing="0" border="0" style="font-family: Arial, Helvetica, sans-serif; max-width: 650px; background-color: #ffffff; margin-top: 24px; border-top: 2px solid #b02524; padding-top: 16px;">
  <tr>
    <td colspan="3" style="padding-bottom: 15px;">
      <strong style="font-size: 18px; color: #b02524; letter-spacing: 0.5px;">
        <span style="color: #b02524;"><font color="#b02524">ADMIN PURCHASING</font></span>
      </strong>
      <br/>
      <span style="font-size: 13px; color: #666666;">
        <span style="color: #666666;"><font color="#666666">Procurement Division</font></span>
      </span>
    </td>
  </tr>
  <tr>
    <td style="vertical-align: middle; padding-right: 20px; width: 80px;">
      <img src="${logoSrc}" alt="CV Batu Emas Group Logo" width="80" style="display: block; width: 80px; max-width: 80px; height: auto; border: 0;" />
    </td>
    <td style="vertical-align: middle; padding: 0 20px; border-left: 2px solid #e0e0e0; width: 220px; font-size: 12px; color: #555555; line-height: 1.5;">
      <span style="color: #555555;">
        <font color="#555555">Dusun Petahunan, Gambiran,<br/>Banyuwangi, Jawa Timur<br/>Indonesia</font>
      </span>
    </td>
    <td style="vertical-align: middle; padding-left: 20px; border-left: 2px solid #e0e0e0;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/mail.png" width="14" height="14" alt="email" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <a href="mailto:pavingjoss@gmail.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">pavingjoss@gmail.com</font></span>
            </a>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px; padding-bottom: 6px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/phone.png" width="14" height="14" alt="phone" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555; padding-bottom: 6px;">
            <span style="color: #555555;"><font color="#555555">(+62) 811 1111 3993</font></span>
          </td>
        </tr>
        <tr>
          <td style="vertical-align: middle; padding-right: 10px;">
            <img src="https://img.icons8.com/material-outlined/24/555555/domain.png" width="14" height="14" alt="web" style="display: block; border: 0;" />
          </td>
          <td style="vertical-align: middle; font-size: 12px; color: #555555;">
            <a href="https://www.pavingjoss.com" style="color: #555555; text-decoration: none;">
              <span style="color: #555555;"><font color="#555555">www.pavingjoss.com</font></span>
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td colspan="3" style="padding-top: 20px; font-size: 9px; color: #999999; line-height: 1.4; text-align: justify;">
      <span style="color: #999999;">
        <font color="#999999">The content of this email is confidential and intended for the recipient specified in message only. It is strictly forbidden to share any part of this message with any third party, without a written consent of the sender. If you received this message by mistake, please reply to this message and follow with its deletion, so that we can ensure such a mistake does not occur in the future.</font>
      </span>
    </td>
  </tr>
</table>
  `;

  const plainSignature = `\n\nAdmin Purchasing\nProcurement Division\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCV. Batu Emas Group\nDusun Petahunan, Gambiran, Banyuwangi,\nJawa Timur, Indonesia\nm: (+62) 811 1111 3993\ne: pavingjoss@gmail.com\n\nwww.pavingjoss.com`;

  let copied = false;
  try {
    if (typeof window !== "undefined" && window.ClipboardItem) {
      const htmlBlob = new Blob([htmlSignature], { type: "text/html" });
      const textBlob = new Blob([plainSignature], { type: "text/plain" });
      const item = new window.ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      });
      await navigator.clipboard.write([item]);
      copied = true;
    }
  } catch (err) {
    console.warn("Failed to copy rich signature", err);
  }

  const bodyWithPrompt =
    data.body +
    (copied ? "\n\n[PASTE (CTRL+V) YOUR SIGNATURE HERE]" : plainSignature);

  const mailtoUrl = `mailto:${data.to}?subject=${encodeURIComponent(
    data.subject
  )}&body=${encodeURIComponent(bodyWithPrompt)}`;
  const a = document.createElement("a");
  a.href = mailtoUrl;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  if (copied) {
    showToast(
      "Signature copied! Press Ctrl+V in your email client.",
      "success"
    );
  } else {
    showToast("Opening email client...", "success");
  }
}
