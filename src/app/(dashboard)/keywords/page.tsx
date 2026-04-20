import { TablePage } from "@/components/TablePage";

export default function KeywordsPage() {
  return (
    <TablePage
      title="Keywords"
      subtitle="Every keyword the momentum engine manages"
      columns={[
        { key: "text", label: "Keyword" },
        { key: "campaign", label: "Campaign" },
        { key: "match", label: "Match" },
        { key: "state", label: "State" },
        { key: "bid", label: "Current bid", align: "right" },
        { key: "acos3d", label: "3d ACOS", align: "right" },
        { key: "lastChange", label: "Last change", align: "right" },
      ]}
      emptyMessage="No keywords tracked yet — starts populating after first Ads API sync."
    />
  );
}
