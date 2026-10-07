import { ButtonLink } from "@/components/ui/button";
import { PageHead } from "@/components/ui/page";
import { StatesDemo } from "@/features/shell/components/states-demo";

/** Template `app/states` (UI States reference): every shared UI pattern, rendered with the app's UI kit. */
export default function StatesPage() {
  return (
    <>
      <PageHead
        eyebrow="System / UI States"
        title="UI States"
        description="Empty, loading, error, confirmation and toast patterns used across Accountex."
        actions={
          <>
            <ButtonLink href="/this-page-does-not-exist">404 page</ButtonLink>
            <ButtonLink href="/unauthorized">No access page</ButtonLink>
          </>
        }
      />
      <StatesDemo />
    </>
  );
}
