import { TablePage } from "@/components/TablePage";

export default function CampaignsPage() {
  return (
    <TablePage
      title="Campaigns"
      subtitle="Sponsored Products campaigns — auto and manual"
      columns={[
        { key: "name", label: "Name" },
        { key: "product", label: "Ad product" },
        { key: "targeting", label: "Targeting" },
        { key: "state", label: "State" },
        { key: "bidding", label: "Bidding strategy" },
        { key: "budget", label: "Daily budget", align: "right" },
      ]}
      emptyMessage="No campaigns yet — pulls from Amazon Ads API once registration is approved."
    />
  );
}
