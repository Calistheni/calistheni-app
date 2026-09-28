/**
 * Non-visual marker for a parallel slot whose real route has not resolved yet.
 *
 * The primary host uses this marker to keep the previously resolved real page
 * visible. It must never grow destination-specific layout or presentation.
 */
export function PrimaryRoutePending({
  destination,
}: {
  destination: string;
}) {
  return (
    <template
      data-primary-route-pending
      data-primary-tab-data="pending"
      data-primary-tab-destination={destination}
    />
  );
}
