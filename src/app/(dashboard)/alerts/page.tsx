import { TablePage } from "@/components/TablePage";

export default function AlertsPage() {
  return (
    <TablePage
      title="Alerts"
      subtitle="Emails sent + dashboard notifications"
      columns={[
        { key: "type", label: "Type" },
        { key: "subject", label: "Subject" },
        { key: "body", label: "Body" },
        { key: "sent", label: "Sent", align: "right" },
      ]}
      emptyMessage="No alerts yet — low-inventory and kill-switch alerts appear here as they fire."
    />
  );
}
