"use client";

import { OPEN_PRIVACY_SETTINGS_EVENT } from "./ConsentBanner";

/** Footer control that reopens the privacy choices notice. */
export default function PrivacySettingsButton() {
  return (
    <button
      type="button"
      className="footer-link-button"
      onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_SETTINGS_EVENT))}
    >
      Privacy settings
    </button>
  );
}
