// Full-page /anas — the same widget rendered edge-to-edge.
// Reuses AnasWidget in fullPage mode so history stays in sync with the side panel.

import { AnasWidget } from "@/components/anas/AnasWidget";

export default function AnasPage() {
  return (
    <div className="h-screen w-screen">
      <AnasWidget fullPage />
    </div>
  );
}
