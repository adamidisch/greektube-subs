"use client";

import { useEffect } from "react";

const SETTINGS_CLOSE_SELECTOR = ".settings-page .settings-close";

export default function SettingsUXEnhancer() {
  useEffect(() => {
    const getCloseButton = () => document.querySelector<HTMLButtonElement>(SETTINGS_CLOSE_SELECTOR);

    const closeSettings = () => {
      const closeButton = getCloseButton();
      if (!closeButton) return false;
      closeButton.click();
      return true;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || !getCloseButton()) return;
      event.preventDefault();
      closeSettings();
    };

    const handleClick = (event: MouseEvent) => {
      const closeButton = getCloseButton();
      if (!closeButton) return;

      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button") as HTMLButtonElement | null;
      if (!button || button === closeButton || !button.closest(".app-header")) return;

      const isSettingsButton =
        button.getAttribute("aria-label") === "Ρυθμίσεις" ||
        button.textContent?.trim() === "Ρυθμίσεις";
      if (!isSettingsButton) return;

      const fromMobileMenu = Boolean(button.closest(".mobile-menu"));
      event.preventDefault();
      event.stopPropagation();
      closeButton.click();

      if (fromMobileMenu) {
        requestAnimationFrame(() => {
          document.querySelector<HTMLButtonElement>(".mobile-menu-toggle.active")?.click();
        });
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("click", handleClick, true);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("click", handleClick, true);
    };
  }, []);

  return (
    <style>{`
      .settings-page-header {
        position: relative;
        padding-right: 54px;
      }

      .settings-close {
        position: absolute;
        top: -2px;
        right: 0;
        z-index: 3;
        width: 38px;
        height: 38px;
        display: grid;
        place-items: center;
        padding: 0;
        border: 1px solid var(--line);
        border-radius: 11px;
        background: var(--raised);
        color: var(--text);
        font-size: 24px;
        font-weight: 400;
        line-height: 1;
        box-shadow: 0 8px 24px rgba(0, 0, 0, .18);
        transition: transform .15s ease, background .15s ease, border-color .15s ease;
      }

      .settings-close:hover {
        transform: translateY(-1px);
        border-color: rgba(143, 127, 240, .45);
        background: color-mix(in srgb, var(--raised) 82%, var(--accent2));
      }

      .settings-close:focus-visible {
        outline: 2px solid var(--accent2);
        outline-offset: 3px;
      }

      @media (max-width: 700px) {
        .settings-page-header {
          padding-right: 60px;
        }

        .settings-close {
          top: -7px;
          width: 44px;
          height: 44px;
          border-radius: 13px;
          border-color: rgba(143, 127, 240, .38);
          font-size: 28px;
          box-shadow: 0 10px 28px rgba(0, 0, 0, .24);
        }
      }
    `}</style>
  );
}
