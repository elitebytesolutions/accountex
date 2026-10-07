import { Construction } from "lucide-react";
import { PageHead, Panel } from "@/components/ui/page";
import { EmptyState } from "@/components/ui/states";

/** Stand-in for a screen that has its route and permission but no content yet (built in its roadmap phase). */
export function ScreenPlaceholder({ title }: { title: string }) {
  return (
    <>
      <PageHead title={title} />
      <Panel>
        <EmptyState icon={<Construction />} title="Not built yet" description="This screen arrives in its delivery phase (see docs/delivery/ROADMAP.md)." />
      </Panel>
    </>
  );
}
